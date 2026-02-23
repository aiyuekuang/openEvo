/**
 * Auto — 自动记忆回忆 + 自动捕获
 * autoRecall: 对话前搜索相关记忆 → <relevant-memories> XML
 * autoCapture: 对话后提取可记忆内容 → embed → 去重 → 索引
 */
import { hybridSearch } from './search'
import { syncMemoryIndex } from './indexer'
import { indexText } from './indexer'
import { isEmbeddingAvailable } from './embeddings'
import { appendToDailyLog, getTodayStr } from './store'

/**
 * Auto-recall: 对话开始前，用用户 query 搜索相关记忆
 * 返回 <relevant-memories> XML 块（可为空）
 */
export async function autoRecall(userQuery: string): Promise<string> {
  try {
    // 确保索引最新（仅在 embedding 可用时同步）
    if (isEmbeddingAvailable()) {
      await syncMemoryIndex()
    }

    const results = await hybridSearch(userQuery, { maxResults: 5, minScore: 0.3 })
    if (results.length === 0) return ''

    const sections = results.map((r, i) =>
      `[${i + 1}] ${r.path}:${r.startLine}-${r.endLine} (score=${r.score.toFixed(2)})\n${r.snippet}`
    )

    return `<relevant-memories>\n以下记忆可能与当前对话相关:\n\n${sections.join('\n\n')}\n</relevant-memories>`
  } catch (err) {
    console.warn('[AutoRecall] failed:', err)
    return ''
  }
}

/**
 * Auto-capture: 对话结束后，提取可记忆的内容
 */
export async function autoCapture(
  userMessage: string,
  assistantResponse: string
): Promise<{ captured: number; entries: string[] }> {
  const result = { captured: 0, entries: [] as string[] }

  try {
    const candidates = extractMemoryCandidates(userMessage, assistantResponse)
    if (candidates.length === 0) return result

    for (const candidate of candidates.slice(0, 3)) { // 最多 3 条/对话
      // 去重检查
      const existing = await hybridSearch(candidate, { maxResults: 1, minScore: 0.92 })
      if (existing.length > 0) continue

      // 写入 daily log + 索引
      appendToDailyLog(candidate)
      const todayStr = getTodayStr()
      await indexText(candidate, 'memory', `memory/${todayStr}.md`)
      result.captured++
      result.entries.push(candidate)
    }
  } catch (err) {
    console.warn('[AutoCapture] failed:', err)
  }

  return result
}

/**
 * 判断是否应该启用 auto-capture
 */
export function shouldCapture(userMessage: string): boolean {
  if (userMessage.length < 10) return false
  if (/^(你好|hi|hello|hey|嗯|好的|ok|thanks|谢谢|是的|对|不|否)\s*[!！.。]?$/i.test(userMessage.trim())) return false
  return true
}

// --- Internal ---

/** 记忆触发器 (参考 OpenClaw memory-lancedb 的 MEMORY_TRIGGERS) */
const MEMORY_TRIGGERS = [
  /记住|记录|记下|别忘了|remember/i,
  /我(喜欢|不喜欢|偏好|习惯|倾向于|讨厌|prefer|like|love|hate)/i,
  /决定|will use|decided|我们用|选择了/i,
  /\+\d{10,}/,                        // 电话号码
  /[\w.-]+@[\w.-]+\.\w+/,             // 邮箱
  /我的\s*\S+\s*是|my\s+\w+\s+is/i,   // "我的XX是"
  /always|never|总是|从不|一直/i,
  /important|重要|关键/i,
]

function extractMemoryCandidates(userMessage: string, assistantResponse: string): string[] {
  const candidates: string[] = []

  // 1. 用户明确要求记住
  if (/记住|remember|记录|记下|别忘了/i.test(userMessage)) {
    candidates.push(`用户要求记住: ${userMessage.slice(0, 200)}`)
  }

  // 2. 用户消息匹配触发器
  for (const trigger of MEMORY_TRIGGERS) {
    if (trigger.test(userMessage)) {
      // 避免重复（如果已被规则 1 捕获）
      if (candidates.length === 0) {
        candidates.push(userMessage.slice(0, 200))
      }
      break
    }
  }

  // 3. 兼容旧的 <memory-save> 标签
  const saveRegex = /<memory-save>\s*([\s\S]*?)\s*<\/memory-save>/g
  let match: RegExpExecArray | null
  while ((match = saveRegex.exec(assistantResponse)) !== null) {
    const lines = match[1].split('\n')
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
    candidates.push(...lines)
  }

  return candidates
}
