/**
 * Task 元数据持久化存储
 *
 * 存储位置: ~/.openevo/tasks.json
 * 与 transcript.ts 配合：
 *   - tasks.json = 任务索引（元数据）
 *   - sessions/<taskId>.jsonl = 完整对话记录（已有）
 *
 * 加载时从 transcript 重建 conversation + steps
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readTranscript, type TranscriptEntry } from '../memory/transcript'

const OPENEVO_DIR = path.join(os.homedir(), '.openevo')
const TASKS_FILE = path.join(OPENEVO_DIR, 'tasks.json')

/** 持久化的任务元数据（不含 conversation/steps，这些从 transcript 重建） */
export interface TaskMeta {
  id: string
  title: string
  message: string
  status: 'pending' | 'running' | 'done' | 'error'
  createdAt: number
  updatedAt: number
  images: string[]
  error?: string
  providerId?: string
  model?: string
}

/** 重建后的完整任务数据（发送给 renderer） */
export interface RestoredTask {
  id: string
  sessionId: string
  title: string
  message: string
  status: 'pending' | 'running' | 'done' | 'error'
  createdAt: number
  conversation: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
  images: string[]
  steps: RestoredStep[]
  error?: string
}

interface RestoredStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  output: string[]
  isSkill: boolean
  skillName: string
  children: RestoredStep[]
  conversation: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
  duration?: number
}

// ─── CRUD ───

function ensureDir(): void {
  if (!fs.existsSync(OPENEVO_DIR)) {
    fs.mkdirSync(OPENEVO_DIR, { recursive: true })
  }
}

function loadIndex(): TaskMeta[] {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'))
    }
  } catch {}
  return []
}

function saveIndex(tasks: TaskMeta[]): void {
  ensureDir()
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
}

/** 保存或更新任务元数据 */
export function saveTaskMeta(meta: TaskMeta): void {
  const tasks = loadIndex()
  const idx = tasks.findIndex(t => t.id === meta.id)
  if (idx >= 0) {
    tasks[idx] = meta
  } else {
    tasks.unshift(meta)
  }
  // 只保留最近 100 条
  saveIndex(tasks.slice(0, 100))
}

/** 更新任务状态 */
export function updateTaskStatus(
  taskId: string,
  status: TaskMeta['status'],
  error?: string,
): void {
  const tasks = loadIndex()
  const task = tasks.find(t => t.id === taskId)
  if (task) {
    task.status = status
    task.updatedAt = Date.now()
    if (error !== undefined) task.error = error
    saveIndex(tasks)
  }
}

/** 列出所有已保存的任务（仅元数据） */
export function listTaskMetas(): TaskMeta[] {
  return loadIndex()
}

/** 加载单个任务（元数据 + 从 transcript 重建对话和步骤） */
export function loadTask(taskId: string): RestoredTask | null {
  const tasks = loadIndex()
  const meta = tasks.find(t => t.id === taskId)
  if (!meta) return null

  return restoreFromTranscript(meta)
}

/** 批量加载所有任务 */
export function loadAllTasks(): RestoredTask[] {
  const metas = loadIndex()
  return metas.map(meta => restoreFromTranscript(meta))
}

/** 删除任务 */
export function deleteTaskMeta(taskId: string): void {
  const tasks = loadIndex().filter(t => t.id !== taskId)
  saveIndex(tasks)
}

// ─── Transcript → Task 重建 ───

function restoreFromTranscript(meta: TaskMeta): RestoredTask {
  const entries = readTranscript(meta.id)

  // 重建对话
  const conversation = entries
    .filter(e => e.type === 'message' && e.role && e.content)
    .map(e => ({
      role: e.role as 'user' | 'assistant' | 'system',
      content: e.content!,
      timestamp: e.timestamp,
    }))

  // 重建步骤树
  const steps = rebuildSteps(entries)

  // 如果任务还在 running 但 app 重启了，标记为 error
  const status = meta.status === 'running' ? 'error' as const : meta.status

  return {
    id: meta.id,
    sessionId: meta.id,
    title: meta.title,
    message: meta.message,
    status,
    createdAt: meta.createdAt,
    conversation,
    images: meta.images,
    steps,
    error: meta.status === 'running' ? '任务被中断（应用重启）' : meta.error,
  }
}

/**
 * 从 transcript entries 重建步骤树
 *
 * 策略：
 *   - tool_call entry → 创建步骤（status: running）
 *   - tool_result entry → 通过 toolCallId 匹配，更新为 done/error
 *   - 使用栈模拟嵌套关系
 */
function rebuildSteps(entries: TranscriptEntry[]): RestoredStep[] {
  const rootSteps: RestoredStep[] = []
  // callId → step 的映射
  const stepMap = new Map<string, RestoredStep>()
  // 用栈追踪嵌套：每个 tool_call push，对应 tool_result pop
  const stack: string[] = []

  for (const entry of entries) {
    if (entry.type === 'tool_call' && entry.toolCalls) {
      for (const tc of entry.toolCalls) {
        const step: RestoredStep = {
          id: tc.id,
          name: tc.name,
          status: 'running',
          output: [],
          isSkill: true,
          skillName: tc.name,
          children: [],
          conversation: [
            {
              role: 'user',
              content: formatCallInput(tc.name, tc.arguments),
              timestamp: entry.timestamp,
            },
          ],
        }
        stepMap.set(tc.id, step)

        // 如果栈中有父步骤，则作为子步骤添加
        if (stack.length > 0) {
          const parentId = stack[stack.length - 1]
          const parent = stepMap.get(parentId)
          if (parent) {
            parent.children.push(step)
          } else {
            rootSteps.push(step)
          }
        } else {
          rootSteps.push(step)
        }

        stack.push(tc.id)
      }
    }

    if (entry.type === 'tool_result' && entry.toolResults) {
      for (const tr of entry.toolResults) {
        const step = stepMap.get(tr.toolCallId)
        if (step) {
          step.status = tr.isError ? 'error' : 'done'
          step.conversation.push({
            role: 'assistant',
            content: tr.isError ? `错误: ${tr.content}` : tr.content,
            timestamp: entry.timestamp,
          })
        }
        // 从栈中弹出（LIFO：最近的 tool_call 对应）
        if (stack.length > 0) {
          stack.pop()
        }
      }
    }
  }

  // 栈中还有未完成的步骤，标记为 error
  for (const callId of stack) {
    const step = stepMap.get(callId)
    if (step && step.status === 'running') {
      step.status = 'error'
    }
  }

  return rootSteps
}

function formatCallInput(name: string, args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return `调用 ${name}()`
  const params = entries
    .map(([k, v]) => {
      const val = typeof v === 'string'
        ? (v.length > 100 ? v.slice(0, 100) + '...' : v)
        : JSON.stringify(v)
      return `  ${k}: ${val}`
    })
    .join('\n')
  return `调用 ${name}:\n${params}`
}
