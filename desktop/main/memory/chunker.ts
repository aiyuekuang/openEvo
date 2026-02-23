/**
 * Chunker — Markdown 文本分块
 * 滑动窗口分块，复刻 OpenClaw 的 chunkMarkdown 逻辑
 */
import crypto from 'crypto'

export interface ChunkingConfig {
  tokens: number   // 目标 token 数（用 *4 估算字符数）
  overlap: number  // 重叠 token 数
}

export interface Chunk {
  startLine: number
  endLine: number
  text: string
  hash: string
}

const DEFAULT_CONFIG: ChunkingConfig = { tokens: 400, overlap: 80 }

export function chunkMarkdown(content: string, config?: Partial<ChunkingConfig>): Chunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const maxChars = cfg.tokens * 4
  const overlapChars = cfg.overlap * 4

  const lines = content.split('\n')
  if (lines.length === 0) return []

  const chunks: Chunk[] = []
  let currentLines: string[] = []
  let currentChars = 0
  let startLine = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    currentLines.push(line)
    currentChars += line.length + 1 // +1 for newline

    if (currentChars >= maxChars) {
      // Flush current chunk
      const text = currentLines.join('\n').trim()
      if (text) {
        chunks.push({
          startLine,
          endLine: startLine + currentLines.length - 1,
          text,
          hash: crypto.createHash('sha256').update(text).digest('hex'),
        })
      }

      // Carry overlap: find lines that fit in overlapChars
      let overlapCount = 0
      let overlapSize = 0
      for (let j = currentLines.length - 1; j >= 0; j--) {
        overlapSize += currentLines[j].length + 1
        if (overlapSize > overlapChars) break
        overlapCount++
      }

      const overlapLines = currentLines.slice(-overlapCount)
      startLine = startLine + currentLines.length - overlapCount
      currentLines = overlapLines
      currentChars = overlapLines.reduce((sum, l) => sum + l.length + 1, 0)
    }
  }

  // Flush remaining
  const text = currentLines.join('\n').trim()
  if (text) {
    chunks.push({
      startLine,
      endLine: startLine + currentLines.length - 1,
      text,
      hash: crypto.createHash('sha256').update(text).digest('hex'),
    })
  }

  return chunks
}
