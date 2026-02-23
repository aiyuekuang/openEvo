/**
 * Indexer — 记忆索引管理
 * 扫描 MEMORY.md + daily logs，按 hash 增量更新 chunks
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { randomUUID } from 'crypto'
import { getMemoryDb, hasFTS5 } from './db'
import { embed, getEmbeddingConfig, isEmbeddingAvailable } from './embeddings'
import { chunkMarkdown } from './chunker'
import { getMemoryDir } from './store'

const MEMORY_FILE = 'MEMORY.md'

export interface IndexStats {
  filesScanned: number
  chunksIndexed: number
  chunksSkipped: number
  embeddingsRequested: number
}

/**
 * 全量同步: 扫描所有 memory 文件，增量更新索引
 */
export async function syncMemoryIndex(): Promise<IndexStats> {
  const stats: IndexStats = { filesScanned: 0, chunksIndexed: 0, chunksSkipped: 0, embeddingsRequested: 0 }
  const db = getMemoryDb()
  const memoryDir = getMemoryDir()
  const cfg = getEmbeddingConfig()

  // 列出所有文件
  const files: Array<{ relPath: string; absPath: string }> = []

  // MEMORY.md
  const memoryFile = path.join(memoryDir, MEMORY_FILE)
  if (fs.existsSync(memoryFile)) {
    files.push({ relPath: MEMORY_FILE, absPath: memoryFile })
  }

  // Daily logs: *.md (excluding MEMORY.md)
  if (fs.existsSync(memoryDir)) {
    for (const f of fs.readdirSync(memoryDir)) {
      if (f === MEMORY_FILE) continue
      if (!f.endsWith('.md')) continue
      files.push({ relPath: f, absPath: path.join(memoryDir, f) })
    }
  }

  // 获取已索引文件的 hash 记录
  const getFile = db.prepare('SELECT hash, mtime FROM files WHERE path = ?')

  // 需要更新的文件
  const toUpdate: typeof files = []
  const currentPaths = new Set<string>()

  for (const file of files) {
    stats.filesScanned++
    currentPaths.add(file.relPath)

    const stat = fs.statSync(file.absPath)
    const content = fs.readFileSync(file.absPath, 'utf-8')
    const hash = crypto.createHash('sha256').update(content).digest('hex')

    const existing = getFile.get(file.relPath) as { hash: string; mtime: number } | undefined
    if (existing && existing.hash === hash) {
      stats.chunksSkipped++
      continue
    }

    toUpdate.push(file)
  }

  // 删除已不存在的文件的 chunks
  const allIndexed = db.prepare('SELECT path FROM files').all() as { path: string }[]
  for (const row of allIndexed) {
    if (!currentPaths.has(row.path)) {
      removeChunksByPath(row.path)
    }
  }

  // 如果有文件需要更新但 embedding 不可用，跳过索引
  if (toUpdate.length > 0 && !isEmbeddingAvailable()) {
    return stats
  }

  // 更新变化的文件
  for (const file of toUpdate) {
    const content = fs.readFileSync(file.absPath, 'utf-8')
    const stat = fs.statSync(file.absPath)
    const hash = crypto.createHash('sha256').update(content).digest('hex')

    // 删除旧 chunks
    removeChunksByPath(file.relPath)

    // 分块 → embed → 写入
    const chunks = chunkMarkdown(content)
    if (chunks.length === 0) continue

    const texts = chunks.map(c => c.text)
    const vectors = await embed(texts)
    stats.embeddingsRequested += texts.length

    const insertChunk = db.prepare(
      'INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertFts = hasFTS5()
      ? db.prepare('INSERT INTO chunks_fts (id, path, source, start_line, end_line, text) VALUES (?, ?, ?, ?, ?, ?)')
      : null

    const upsertFile = db.prepare(
      'INSERT OR REPLACE INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)'
    )

    const now = Date.now()
    db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const id = randomUUID()
        insertChunk.run(id, file.relPath, 'memory', chunk.startLine, chunk.endLine, chunk.hash, cfg.model, chunk.text, JSON.stringify(vectors[i]), now)
        insertFts?.run(id, file.relPath, 'memory', chunk.startLine, chunk.endLine, chunk.text)
        stats.chunksIndexed++
      }
      upsertFile.run(file.relPath, 'memory', hash, stat.mtimeMs, stat.size)
    })()
  }

  return stats
}

/**
 * 索引一段文本（用于 memory_store 实时写入）
 */
export async function indexText(
  text: string,
  source: string,
  filePath: string,
): Promise<string[]> {
  const db = getMemoryDb()
  const cfg = getEmbeddingConfig()
  const chunks = chunkMarkdown(text)
  if (chunks.length === 0) return []

  const texts = chunks.map(c => c.text)
  const vectors = await embed(texts)

  const insertChunk = db.prepare(
    'INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertFts = hasFTS5()
    ? db.prepare('INSERT INTO chunks_fts (id, path, source, start_line, end_line, text) VALUES (?, ?, ?, ?, ?, ?)')
    : null

  const ids: string[] = []
  const now = Date.now()

  db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const id = randomUUID()
      ids.push(id)
      insertChunk.run(id, filePath, source, chunk.startLine, chunk.endLine, chunk.hash, cfg.model, chunk.text, JSON.stringify(vectors[i]), now)
      insertFts?.run(id, filePath, source, chunk.startLine, chunk.endLine, chunk.text)
    }
  })()

  return ids
}

/**
 * 删除指定路径的所有 chunks
 */
export function removeChunksByPath(filePath: string): number {
  const db = getMemoryDb()
  const result = db.prepare('DELETE FROM chunks WHERE path = ?').run(filePath)
  if (hasFTS5()) {
    try { db.prepare('DELETE FROM chunks_fts WHERE path = ?').run(filePath) } catch {}
  }
  db.prepare('DELETE FROM files WHERE path = ?').run(filePath)
  return result.changes
}
