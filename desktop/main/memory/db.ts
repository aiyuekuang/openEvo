/**
 * Memory DB — SQLite 数据库管理
 * 存储: ~/.openevo/memory/index.sqlite
 * 包含: chunks 表 + FTS5 全文搜索 + embedding 缓存
 */
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const MEMORY_DB_DIR = path.join(os.homedir(), '.openevo', 'memory')
const MEMORY_DB_PATH = path.join(MEMORY_DB_DIR, 'index.sqlite')

let db: Database.Database | null = null

export function getMemoryDb(): Database.Database {
  if (db) return db
  fs.mkdirSync(MEMORY_DB_DIR, { recursive: true })
  db = new Database(MEMORY_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureSchema(db)
  return db
}

function ensureSchema(db: Database.Database): void {
  // meta — 索引元信息（provider/model fingerprint、chunking params）
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`)

  // files — 追踪已索引的文件
  db.exec(`CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'memory',
    hash TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL
  )`)

  // chunks — 文本块 + embedding
  db.exec(`CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'memory',
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    hash TEXT NOT NULL,
    model TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)`)

  // embedding_cache — hash → vector 缓存
  db.exec(`CREATE TABLE IF NOT EXISTS embedding_cache (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    hash TEXT NOT NULL,
    embedding TEXT NOT NULL,
    dims INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (provider, model, hash)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_updated ON embedding_cache(updated_at)`)

  // FTS5 全文搜索（降级友好）
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      id UNINDEXED,
      path UNINDEXED,
      source UNINDEXED,
      start_line UNINDEXED,
      end_line UNINDEXED
    )`)
  } catch {
    // FTS5 不可用时跳过（不影响核心功能，仅损失关键词搜索）
    console.warn('[MemoryDB] FTS5 not available, keyword search disabled')
  }
}

export function closeMemoryDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** 检查 FTS5 是否可用 */
export function hasFTS5(): boolean {
  try {
    const d = getMemoryDb()
    d.prepare("SELECT * FROM chunks_fts LIMIT 0").run()
    return true
  } catch {
    return false
  }
}
