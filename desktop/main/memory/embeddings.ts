/**
 * Embeddings — 文本向量化客户端 + 缓存
 * 默认使用 OpenAI text-embedding-3-small (1536维)
 * API Key 复用已配置的 OpenAI provider
 */
import OpenAI from 'openai'
import crypto from 'crypto'
import { getMemoryDb } from './db'
import { getProviderAuth } from '../providers/store'

export interface EmbeddingConfig {
  provider: 'openai'
  model: string
  dimensions: number
  apiKey?: string
  baseUrl?: string
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dimensions: 1536,
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * 批量 embedding，先查缓存再请求 API
 */
export async function embed(texts: string[], config?: Partial<EmbeddingConfig>): Promise<number[][]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const db = getMemoryDb()

  // 查缓存
  const getCache = db.prepare(
    'SELECT embedding FROM embedding_cache WHERE model = ? AND hash = ?'
  )
  const cached: (number[] | null)[] = texts.map(text => {
    const row = getCache.get(cfg.model, hashText(text)) as { embedding: string } | undefined
    return row ? JSON.parse(row.embedding) : null
  })

  // 找出未缓存的
  const missing = texts.map((_, i) => cached[i] === null ? i : -1).filter(i => i >= 0)

  if (missing.length > 0) {
    const missingTexts = missing.map(i => texts[i])
    const vectors = await requestEmbeddings(missingTexts, cfg)

    // 写入缓存
    const insertCache = db.prepare(
      'INSERT OR REPLACE INTO embedding_cache (provider, model, hash, embedding, dims, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const now = Date.now()
    const insertMany = db.transaction(() => {
      for (let j = 0; j < missing.length; j++) {
        const idx = missing[j]
        cached[idx] = vectors[j]
        insertCache.run(cfg.provider, cfg.model, hashText(texts[idx]), JSON.stringify(vectors[j]), cfg.dimensions, now)
      }
    })
    insertMany()
  }

  return cached as number[][]
}

/**
 * 单条查询 embedding
 */
export async function embedQuery(query: string, config?: Partial<EmbeddingConfig>): Promise<number[]> {
  const results = await embed([query], config)
  return results[0]
}

/**
 * 获取当前 embedding 配置
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...DEFAULT_CONFIG }
}

/**
 * 检查 embedding 是否可用（API Key 已配置）
 */
export function isEmbeddingAvailable(): boolean {
  const auth = getProviderAuth('openai')
  if (auth?.apiKey) return true
  if (process.env.OPENAI_API_KEY) return true
  return false
}

async function requestEmbeddings(texts: string[], cfg: EmbeddingConfig): Promise<number[][]> {
  // 解析 API Key：优先传入 → 已配置的 OpenAI provider → 环境变量
  let apiKey = cfg.apiKey
  if (!apiKey) {
    const auth = getProviderAuth('openai')
    apiKey = auth?.apiKey
  }
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY
  }
  if (!apiKey) {
    throw new Error('Embedding 需要 OpenAI API Key（请先配置 OpenAI 供应商或设置 OPENAI_API_KEY 环境变量）')
  }

  const client = new OpenAI({
    apiKey,
    baseURL: cfg.baseUrl || 'https://api.openai.com/v1',
  })

  const response = await client.embeddings.create({
    model: cfg.model,
    input: texts,
  })

  return response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}
