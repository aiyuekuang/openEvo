import { ipcMain, shell, BrowserWindow } from 'electron'
import { ConfigStore } from './config/store'
import { llmClient } from './providers/llm-client'
import { PRESET_PROVIDERS } from './providers/registry'
import {
  setProviderAuth, deleteProviderAuth,
  getAllProviderStatuses, setDefaultModel,
  getActiveProvider, setActiveProvider,
  addCustomProvider, removeCustomProvider, getCustomProviders,
} from './providers/store'
import type { ProviderAuth } from './providers/types'
import { startOAuthFlow, cancelOAuthFlow, type OAuthProviderId } from './providers/oauth'
import {
  loadMemory, saveMemory, appendToMemory,
  loadDailyLog, appendToDailyLog, listDailyLogs, getMemoryDir,
} from './memory/store'
import { processAutoSave } from './memory/prompt'
import { autoCapture, shouldCapture } from './memory/auto'
import { appendTranscript } from './memory/transcript'
import { hybridSearch } from './memory/search'
import { syncMemoryIndex } from './memory/indexer'
import { getMemoryDb, hasFTS5 } from './memory/db'
import { getAgent, resetSystemSkills, getSkillsBaseDir, getCustomSkillsDir } from './evolang/bridge'
import { saveTaskMeta, updateTaskStatus, loadAllTasks, deleteTaskMeta, type TaskMeta } from './storage/tasks'

const configStore = new ConfigStore()
const activeTasks = new Map<string, { cancel: () => void }>()

// 跟踪每个任务的 skill 调用栈，用于关联 skill_call 和 skill_result
const skillCallStacks = new Map<string, Array<{ callId: string; depth: number }>>()

export function registerIpcHandlers() {
  // --- Config ---
  ipcMain.handle('config:get', async (_e, key: string) => configStore.get(key))
  ipcMain.handle('config:set', async (_e, key: string, value: unknown) => configStore.set(key, value))

  // --- Shell ---
  ipcMain.handle('shell:openExternal', async (_e, url: string) => shell.openExternal(url))

  // --- Provider Management ---
  ipcMain.handle('provider:list', async () => {
    const presets = PRESET_PROVIDERS.map(p => ({
      ...p,
      // Don't send full model objects, just the config
    }))
    const custom = getCustomProviders()
    return { presets, custom }
  })

  ipcMain.handle('provider:statuses', async () => {
    return getAllProviderStatuses()
  })

  ipcMain.handle('provider:save-auth', async (_e, auth: ProviderAuth) => {
    setProviderAuth(auth)
    return { ok: true }
  })

  ipcMain.handle('provider:delete-auth', async (_e, providerId: string) => {
    deleteProviderAuth(providerId)
    return { ok: true }
  })

  ipcMain.handle('provider:test', async (_e, providerId: string, apiKey: string, baseUrl?: string, model?: string) => {
    return llmClient.testConnection(providerId, apiKey, baseUrl, model)
  })

  ipcMain.handle('provider:set-default-model', async (_e, providerId: string, modelId: string) => {
    setDefaultModel(providerId, modelId)
    return { ok: true }
  })

  ipcMain.handle('provider:set-active', async (_e, providerId: string, model: string) => {
    setActiveProvider(providerId, model)
    return { ok: true }
  })

  ipcMain.handle('provider:get-active', async () => {
    return getActiveProvider()
  })

  ipcMain.handle('provider:add-custom', async (_e, provider: any) => {
    addCustomProvider(provider)
    return { ok: true }
  })

  ipcMain.handle('provider:remove-custom', async (_e, id: string) => {
    removeCustomProvider(id)
    return { ok: true }
  })

  // --- OAuth ---
  ipcMain.handle('oauth:start', async (event, providerId: OAuthProviderId) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender) ?? undefined
    // Fire-and-forget: startOAuthFlow sends events via sender.send
    startOAuthFlow(providerId, sender, win)
    return { ok: true }
  })

  ipcMain.handle('oauth:cancel', async (_e, providerId: string) => {
    cancelOAuthFlow(providerId)
    return { ok: true }
  })

  // --- Memory ---
  ipcMain.handle('memory:load', async () => loadMemory())
  ipcMain.handle('memory:save', async (_e, content: string) => { saveMemory(content); return { ok: true } })
  ipcMain.handle('memory:append', async (_e, entry: string) => { appendToMemory(entry); return { ok: true } })
  ipcMain.handle('memory:daily-log', async (_e, dateStr?: string) => loadDailyLog(dateStr))
  ipcMain.handle('memory:daily-log-append', async (_e, entry: string, dateStr?: string) => { appendToDailyLog(entry, dateStr); return { ok: true } })
  ipcMain.handle('memory:list-logs', async () => listDailyLogs())
  ipcMain.handle('memory:get-dir', async () => getMemoryDir())

  // --- Task: Create & run (via evolang Agent) ---
  ipcMain.handle('task:create', async (event, taskId: string, message: string, providerId?: string, model?: string) => {
    const sender = event.sender

    // Resolve provider + model
    let activeProviderId = providerId
    let activeModel = model
    if (!activeProviderId || !activeModel) {
      const active = getActiveProvider()
      if (!active) {
        return { error: '请先配置至少一个 AI 供应商' }
      }
      activeProviderId = activeProviderId || active.providerId
      activeModel = activeModel || active.model
    }

    let cancelled = false
    activeTasks.set(taskId, {
      cancel: () => { cancelled = true }
    })

    // 保存任务元数据
    saveTaskMeta({
      id: taskId,
      title: message.slice(0, 30),
      message,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [],
      providerId: activeProviderId,
      model: activeModel,
    })

    try {
      const agent = getAgent()

      // 记录用户消息到 transcript
      appendTranscript(taskId, {
        id: crypto.randomUUID(),
        type: 'message',
        role: 'user',
        content: message,
        timestamp: Date.now(),
        model: activeModel,
        providerId: activeProviderId,
      })

      // ═══ Skill 事件处理（提取为函数，供 onEvent 实时推送和 generator 共用） ═══

      const handleSkillCall = (evt: { skill?: string; input?: unknown; depth?: number }) => {
        const callId = crypto.randomUUID()
        const stack = skillCallStacks.get(taskId) || []
        stack.push({ callId, depth: evt.depth ?? 1 })
        skillCallStacks.set(taskId, stack)

        sender.send('task:stream', {
          taskId,
          type: 'tool_call',
          toolCall: { id: callId, name: evt.skill, arguments: (evt.input || {}) as Record<string, unknown> },
          depth: evt.depth ?? 1,
          skillName: evt.skill,
        })
        appendTranscript(taskId, {
          id: crypto.randomUUID(),
          type: 'tool_call',
          toolCalls: [{ id: callId, name: evt.skill || '', arguments: (evt.input || {}) as Record<string, unknown> }],
          timestamp: Date.now(),
        })
      }

      const handleSkillResult = (evt: { skill?: string; output?: unknown; isError?: boolean; duration?: number }) => {
        const resultStack = skillCallStacks.get(taskId) || []
        const matched = resultStack.pop() || { callId: '', depth: 1 }

        sender.send('task:stream', {
          taskId,
          type: 'tool_result',
          toolResult: {
            toolCallId: matched.callId,
            content: JSON.stringify(evt.output || {}),
            isError: evt.isError,
          },
          depth: matched.depth,
          skillName: evt.skill,
          duration: evt.duration,
        })
        appendTranscript(taskId, {
          id: crypto.randomUUID(),
          type: 'tool_result',
          toolResults: [{
            toolCallId: matched.callId,
            content: JSON.stringify(evt.output || {}),
            isError: evt.isError,
          }],
          timestamp: Date.now(),
        })
      }

      // ═══ Agent.run() — evolang 接管执行 ═══
      // onEvent: 实时推送通道 — skill 事件立即送达 UI（不等 generator yield）
      let finalResponse = ''
      for await (const runEvent of agent.run({
        taskId,
        message,
        model: activeModel,
        providerId: activeProviderId,
        onEvent: (evt) => {
          if (cancelled) return
          if (evt.type === 'skill_call') handleSkillCall(evt as any)
          else if (evt.type === 'skill_result') handleSkillResult(evt as any)
        },
      })) {
        if (cancelled) break

        switch (runEvent.type) {
          case 'token':
            finalResponse = runEvent.fullResponse || ''
            sender.send('task:stream', {
              taskId,
              type: 'token',
              content: runEvent.content,
              fullResponse: runEvent.fullResponse,
            })
            break

          // skill_call/skill_result 已由 onEvent 实时推送，generator 不再重复处理
          case 'skill_call':
            handleSkillCall(runEvent)
            break
          case 'skill_result':
            handleSkillResult(runEvent)
            break

          case 'error':
            sender.send('task:stream', {
              taskId,
              type: 'error',
              error: runEvent.error,
            })
            activeTasks.delete(taskId)
            skillCallStacks.delete(taskId)
            updateTaskStatus(taskId, 'error', runEvent.error)
            return { error: runEvent.error }

          case 'done':
            finalResponse = runEvent.fullResponse || finalResponse
            break
        }
      }

      // 记录 assistant 响应到 transcript
      appendTranscript(taskId, {
        id: crypto.randomUUID(),
        type: 'message',
        role: 'assistant',
        content: finalResponse,
        timestamp: Date.now(),
        model: activeModel,
        providerId: activeProviderId,
      })

      // 记录用户查询到日志
      appendToDailyLog(`用户查询: ${message.slice(0, 100)}`)

      // 兼容 <memory-save> 标签
      const { cleanedResponse, savedEntries } = processAutoSave(finalResponse)

      if (savedEntries.length > 0) {
        sender.send('task:stream', {
          taskId,
          type: 'memory-saved',
          entries: savedEntries,
        })
      }

      // Auto-capture: 自动提取可记忆内容
      if (shouldCapture(message)) {
        try {
          const captureResult = await autoCapture(message, cleanedResponse)
          if (captureResult.captured > 0) {
            console.log(`[AutoCapture] 捕获 ${captureResult.captured} 条记忆:`, captureResult.entries)
          }
        } catch (err) {
          console.warn('[task:create] autoCapture failed:', err)
        }
      }

      activeTasks.delete(taskId)
      skillCallStacks.delete(taskId)
      updateTaskStatus(taskId, 'done')
      return { reply: cleanedResponse }
    } catch (err) {
      activeTasks.delete(taskId)
      skillCallStacks.delete(taskId)
      const errorMessage = err instanceof Error ? err.message : String(err)
      updateTaskStatus(taskId, 'error', errorMessage)
      return { error: errorMessage }
    }
  })

  // --- Task: Cancel ---
  ipcMain.handle('task:cancel', async (_e, taskId: string) => {
    const task = activeTasks.get(taskId)
    if (task) {
      task.cancel()
      activeTasks.delete(taskId)
      updateTaskStatus(taskId, 'error', '已取消')
    }
  })

  // --- Task: Persistence ---
  ipcMain.handle('task:load-all', async () => {
    try {
      return loadAllTasks()
    } catch (err) {
      console.error('[task:load-all] failed:', err)
      return []
    }
  })

  ipcMain.handle('task:delete', async (_e, taskId: string) => {
    deleteTaskMeta(taskId)
    return { ok: true }
  })

  // --- Memory: Search & Index ---
  ipcMain.handle('memory:search', async (_e, query: string, limit?: number) => {
    try {
      const results = await hybridSearch(query, { maxResults: limit || 5 })
      return { results }
    } catch (err) {
      return { results: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('memory:sync-index', async () => {
    try {
      await syncMemoryIndex()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('memory:index-status', async () => {
    try {
      const db = getMemoryDb()
      const chunkCount = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any)?.count || 0
      const fileCount = (db.prepare('SELECT COUNT(*) as count FROM files').get() as any)?.count || 0
      const fts5 = hasFTS5()
      return { chunkCount, fileCount, fts5Available: fts5 }
    } catch (err) {
      return { chunkCount: 0, fileCount: 0, fts5Available: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // --- Skills Management ---
  ipcMain.handle('skills:reset-system', async () => {
    try {
      const result = await resetSystemSkills()
      return { ok: true, ...result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('skills:list', async () => {
    try {
      const agent = getAgent()
      const baseDir = getSkillsBaseDir()
      const skills = agent.getRegistry().list().map(s => ({
        name: s.meta.name,
        description: s.meta.description,
        category: s.meta.category,
        mode: s.meta.mode,
        version: s.meta.version,
        tags: s.meta.tags,
      }))
      return {
        skills,
        baseDir,
        dirs: {
          system: `${baseDir}/system`,
          market: `${baseDir}/market`,
          custom: getCustomSkillsDir(),
        },
      }
    } catch (err) {
      return { skills: [], error: err instanceof Error ? err.message : String(err) }
    }
  })
}
