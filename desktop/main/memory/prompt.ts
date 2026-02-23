/**
 * Memory Prompt — 构建 system prompt + 解析记忆保存标签
 */
import {
  loadMemory, loadDailyLog,
  getTodayStr, getYesterdayStr, appendToDailyLog,
} from './store'
import { toolRegistry } from '../tools/registry'

const MEMORY_SAVE_OPEN = '<memory-save>'
const MEMORY_SAVE_CLOSE = '</memory-save>'

export interface SystemPromptOptions {
  userSystemPrompt?: string
  relevantMemories?: string   // autoRecall 返回的 <relevant-memories> 块
  hasTools?: boolean          // 是否启用了 Memory Tools
}

/**
 * 构建包含记忆上下文的 system prompt
 * 始终加载: MEMORY.md + 今日日志 + 昨日日志
 * 可选: relevant-memories + tool 使用说明
 */
export function buildSystemPrompt(options?: SystemPromptOptions | string): string {
  // 兼容旧的 string 参数调用方式
  const opts: SystemPromptOptions = typeof options === 'string'
    ? { userSystemPrompt: options }
    : options || {}

  const parts: string[] = []

  parts.push(
    '你是 OpenEvo 的 AI 助手。请用中文回答用户的问题。',
    '你可以访问用户的长期记忆和每日日志来提供更有上下文的回答。',
  )

  // 长期记忆
  const memory = loadMemory()
  if (memory.trim()) {
    parts.push(
      '\n## 长期记忆 (MEMORY.md)\n以下是用户维护的长期记忆信息：\n',
      memory.trim(),
    )
  }

  // 今日日志
  const todayStr = getTodayStr()
  const todayLog = loadDailyLog(todayStr)
  if (todayLog.trim()) {
    parts.push(`\n## 今日日志 (${todayStr})\n`, todayLog.trim())
  }

  // 昨日日志
  const yesterdayStr = getYesterdayStr()
  const yesterdayLog = loadDailyLog(yesterdayStr)
  if (yesterdayLog.trim()) {
    parts.push(`\n## 昨日日志 (${yesterdayStr})\n`, yesterdayLog.trim())
  }

  // Auto-recall 搜索结果
  if (opts.relevantMemories?.trim()) {
    parts.push('\n' + opts.relevantMemories.trim())
  }

  // Tool Use 说明（从 registry 动态获取）
  if (opts.hasTools) {
    const instructions = toolRegistry.getToolInstructions()
    if (instructions) {
      parts.push('\n## 可用工具', instructions)
    }
  } else {
    // 没有 Tool Use 时，回退到 <memory-save> 标签机制
    parts.push(
      '\n## 记忆保存指令',
      '如果在对话过程中你发现了值得长期记住的重要信息（如用户偏好、项目事实、关键决策等），',
      '请在你的回复末尾使用以下格式保存到今日日志：',
      '',
      MEMORY_SAVE_OPEN,
      '要保存的内容（一行一条，简洁的事实陈述）',
      MEMORY_SAVE_CLOSE,
      '',
      '注意：只在确实有重要信息需要记录时才使用此格式。不要每次回复都保存。',
      '保存的内容应该是简洁的事实，而非完整的对话内容。',
    )
  }

  // 用户自定义指令
  if (opts.userSystemPrompt?.trim()) {
    parts.push('\n## 用户自定义指令\n', opts.userSystemPrompt.trim())
  }

  return parts.join('\n')
}

/**
 * 解析 LLM 响应中的 <memory-save> 标签
 * 返回清理后的响应 + 提取的记忆条目
 */
export function parseMemorySaveBlocks(response: string): {
  cleanedResponse: string
  memoryEntries: string[]
} {
  const entries: string[] = []
  const regex = new RegExp(
    `${escapeRegex(MEMORY_SAVE_OPEN)}\\s*([\\s\\S]*?)\\s*${escapeRegex(MEMORY_SAVE_CLOSE)}`,
    'g',
  )

  let match: RegExpExecArray | null
  while ((match = regex.exec(response)) !== null) {
    const blockContent = match[1].trim()
    if (blockContent) {
      const lines = blockContent
        .split('\n')
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0)
      entries.push(...lines)
    }
  }

  const cleanedResponse = response
    .replace(regex, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanedResponse, memoryEntries: entries }
}

/**
 * 任务完成后自动保存记忆
 * 解析响应中的记忆标签，追加到今日日志
 */
export function processAutoSave(fullResponse: string): {
  cleanedResponse: string
  savedEntries: string[]
} {
  const { cleanedResponse, memoryEntries } = parseMemorySaveBlocks(fullResponse)

  for (const entry of memoryEntries) {
    appendToDailyLog(entry)
  }

  return { cleanedResponse, savedEntries: memoryEntries }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
