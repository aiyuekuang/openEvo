/**
 * Memory Tools — memory_search / memory_store / memory_forget
 * 提供给 LLM 的 Tool Use 工具定义 + 执行器
 */
import type { ToolDefinition, ToolCall, ToolResult } from '../providers/types'
import { hybridSearch } from './search'
import { indexText } from './indexer'
import { appendToDailyLog, getTodayStr } from './store'
import { getMemoryDb, hasFTS5 } from './db'
import { toolRegistry } from '../tools/registry'

export const MEMORY_TOOLS: ToolDefinition[] = [
  {
    name: 'memory_search',
    description: '搜索用户的长期记忆和日志。用于回忆用户的偏好、过去的决策、项目信息等。当用户问到之前讨论过的内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询（自然语言）' },
        limit: { type: 'number', description: '最大返回数量（默认 5）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_store',
    description: '保存重要信息到长期记忆。用于存储用户偏好、关键决策、项目事实等值得长期记住的信息。只在用户明确要求记住或信息确实重要时使用。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要保存的内容（简洁的事实陈述）' },
        category: {
          type: 'string',
          enum: ['preference', 'fact', 'decision', 'entity', 'other'],
          description: '分类: preference=偏好, fact=事实, decision=决策, entity=实体, other=其他',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_forget',
    description: '删除记忆中的指定内容。当用户明确要求遗忘或删除某些信息时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要删除的内容描述（模糊匹配）' },
        memoryId: { type: 'string', description: '精确的记忆块 ID' },
      },
    },
  },
]

/**
 * 执行 memory tool call
 */
export async function executeMemoryTool(toolCall: ToolCall): Promise<ToolResult> {
  try {
    switch (toolCall.name) {
      case 'memory_search':
        return await handleMemorySearch(toolCall)
      case 'memory_store':
        return await handleMemoryStore(toolCall)
      case 'memory_forget':
        return await handleMemoryForget(toolCall)
      default:
        return { toolCallId: toolCall.id, content: `未知工具: ${toolCall.name}`, isError: true }
    }
  } catch (err) {
    return { toolCallId: toolCall.id, content: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

async function handleMemorySearch(toolCall: ToolCall): Promise<ToolResult> {
  const { query, limit } = toolCall.arguments as { query: string; limit?: number }
  const results = await hybridSearch(query, { maxResults: limit || 5 })

  if (results.length === 0) {
    return { toolCallId: toolCall.id, content: '未找到相关记忆。' }
  }

  const formatted = results.map((r, i) =>
    `[${i + 1}] ${r.path}:${r.startLine}-${r.endLine} (相关度: ${r.score.toFixed(2)})\n${r.snippet}`
  ).join('\n\n')

  return { toolCallId: toolCall.id, content: `找到 ${results.length} 条相关记忆:\n\n${formatted}` }
}

async function handleMemoryStore(toolCall: ToolCall): Promise<ToolResult> {
  const { text, category } = toolCall.arguments as { text: string; category?: string }

  // 去重检测
  const existing = await hybridSearch(text, { maxResults: 1, minScore: 0.92 })
  if (existing.length > 0) {
    return { toolCallId: toolCall.id, content: `记忆已存在（相似度 ${existing[0].score.toFixed(2)}），跳过存储。` }
  }

  // 写入 daily log
  const prefix = category ? `[${category}] ` : ''
  appendToDailyLog(`${prefix}${text}`)

  // 索引到 SQLite
  const todayStr = getTodayStr()
  await indexText(text, 'memory', `memory/${todayStr}.md`)

  return { toolCallId: toolCall.id, content: `已保存到记忆: "${text.slice(0, 100)}"` }
}

async function handleMemoryForget(toolCall: ToolCall): Promise<ToolResult> {
  const { query, memoryId } = toolCall.arguments as { query?: string; memoryId?: string }
  const db = getMemoryDb()

  if (memoryId) {
    db.prepare('DELETE FROM chunks WHERE id = ?').run(memoryId)
    if (hasFTS5()) {
      try { db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(memoryId) } catch {}
    }
    return { toolCallId: toolCall.id, content: `已删除记忆 ${memoryId}` }
  }

  if (query) {
    const results = await hybridSearch(query, { maxResults: 3, minScore: 0.7 })
    if (results.length === 0) {
      return { toolCallId: toolCall.id, content: '未找到匹配的记忆。' }
    }
    for (const r of results) {
      db.prepare('DELETE FROM chunks WHERE id = ?').run(r.id)
      if (hasFTS5()) {
        try { db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(r.id) } catch {}
      }
    }
    return { toolCallId: toolCall.id, content: `已删除 ${results.length} 条相关记忆。` }
  }

  return { toolCallId: toolCall.id, content: '请提供 query 或 memoryId 参数。', isError: true }
}

export function isMemoryTool(name: string): boolean {
  return ['memory_search', 'memory_store', 'memory_forget'].includes(name)
}

/** 将 memory tools 注册到全局 Tool Registry */
export function registerMemoryTools(): void {
  toolRegistry.registerMany('记忆', MEMORY_TOOLS, executeMemoryTool)
}
