/**
 * Search — 混合搜索 (BM25 + Vector)
 * 复刻 OpenClaw 的 hybrid search 策略
 */
import { getMemoryDb, hasFTS5 } from './db'
import { embedQuery } from './embeddings'

export interface SearchResult {
  id: string
  path: string
  startLine: number
  endLine: number
  snippet: string
  score: number
  source: string
}

export interface SearchConfig {
  maxResults: number
  minScore: number
  vectorWeight: number
  textWeight: number
  candidateMultiplier: number
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  maxResults: 5,
  minScore: 0.1,
  vectorWeight: 0.7,
  textWeight: 0.3,
  candidateMultiplier: 4,
}

const SNIPPET_MAX_CHARS = 700

/**
 * 混合搜索: 向量搜索 + BM25 关键词搜索 → 加权合并
 */
export async function hybridSearch(
  query: string,
  config?: Partial<SearchConfig>
): Promise<SearchResult[]> {
  const cfg = { ...DEFAULT_SEARCH_CONFIG, ...config }
  const candidates = cfg.maxResults * cfg.candidateMultiplier

  // 并行执行向量搜索和关键词搜索
  let vectorResults: ScoredResult[] = []
  let keywordResults: ScoredResult[] = []

  try {
    const queryVec = await embedQuery(query)
    vectorResults = searchVector(queryVec, candidates)
  } catch {
    // Embedding 不可用时降级到仅关键词搜索
  }

  if (hasFTS5()) {
    keywordResults = searchKeyword(query, candidates)
  }

  // 如果两种搜索都没有结果
  if (vectorResults.length === 0 && keywordResults.length === 0) {
    return []
  }

  // 合并
  return mergeHybridResults(vectorResults, keywordResults, cfg)
    .filter(r => r.score >= cfg.minScore)
    .slice(0, cfg.maxResults)
}

// --- Internal ---

interface ScoredResult extends SearchResult {
  vectorScore?: number
  textScore?: number
}

/**
 * 向量搜索: JS 余弦相似度（不依赖 sqlite-vec）
 */
function searchVector(queryVec: number[], limit: number): ScoredResult[] {
  const db = getMemoryDb()
  const rows = db.prepare(
    'SELECT id, path, source, start_line, end_line, text, embedding FROM chunks'
  ).all() as Array<{
    id: string; path: string; source: string
    start_line: number; end_line: number; text: string; embedding: string
  }>

  const results: ScoredResult[] = []
  for (const row of rows) {
    let vec: number[]
    try { vec = JSON.parse(row.embedding) } catch { continue }

    const sim = cosineSimilarity(queryVec, vec)
    if (sim > 0) {
      results.push({
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text.slice(0, SNIPPET_MAX_CHARS),
        score: sim,
        source: row.source,
        vectorScore: sim,
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * BM25 关键词搜索: FTS5
 */
function searchKeyword(query: string, limit: number): ScoredResult[] {
  const db = getMemoryDb()
  try {
    // 对查询进行 FTS5 安全处理
    const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
    if (!safeQuery) return []

    const rows = db.prepare(`
      SELECT id, path, source, start_line, end_line, text, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(safeQuery, limit) as Array<{
      id: string; path: string; source: string
      start_line: number; end_line: number; text: string; rank: number
    }>

    return rows.map(row => {
      // BM25 rank → similarity score: 1 / (1 + max(0, -rank))
      // FTS5 rank 是负数（越小越好），取绝对值
      const textScore = 1 / (1 + Math.max(0, -row.rank))
      return {
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text.slice(0, SNIPPET_MAX_CHARS),
        score: textScore,
        source: row.source,
        textScore,
      }
    })
  } catch {
    return []
  }
}

/**
 * 合并向量和关键词搜索结果
 */
function mergeHybridResults(
  vector: ScoredResult[],
  keyword: ScoredResult[],
  config: SearchConfig
): SearchResult[] {
  const merged = new Map<string, ScoredResult>()

  // 归一化权重
  const totalWeight = config.vectorWeight + config.textWeight
  const vw = config.vectorWeight / totalWeight
  const tw = config.textWeight / totalWeight

  for (const r of vector) {
    merged.set(r.id, { ...r, score: (r.vectorScore || 0) * vw })
  }

  for (const r of keyword) {
    const existing = merged.get(r.id)
    if (existing) {
      existing.score += (r.textScore || 0) * tw
      existing.textScore = r.textScore
    } else {
      merged.set(r.id, { ...r, score: (r.textScore || 0) * tw })
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
}

/**
 * 余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
