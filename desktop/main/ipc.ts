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

const configStore = new ConfigStore()
const activeTasks = new Map<string, { cancel: () => void }>()

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

  // --- Task: Create & run (direct LLM API) ---
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

    try {
      const stream = llmClient.chat(
        [{ role: 'user', content: message }],
        { model: activeModel, providerId: activeProviderId }
      )

      let finalResponse = ''
      for await (const streamEvent of stream) {
        if (cancelled) break

        if (streamEvent.type === 'token') {
          finalResponse = streamEvent.fullResponse || ''
          sender.send('task:stream', {
            taskId,
            type: 'token',
            content: streamEvent.content,
            fullResponse: streamEvent.fullResponse,
          })
        } else if (streamEvent.type === 'error') {
          sender.send('task:stream', {
            taskId,
            type: 'error',
            error: streamEvent.error,
          })
          activeTasks.delete(taskId)
          return { error: streamEvent.error }
        }
      }

      activeTasks.delete(taskId)
      return { reply: finalResponse }
    } catch (err) {
      activeTasks.delete(taskId)
      const errorMessage = err instanceof Error ? err.message : String(err)
      return { error: errorMessage }
    }
  })

  // --- Task: Cancel ---
  ipcMain.handle('task:cancel', async (_e, taskId: string) => {
    const task = activeTasks.get(taskId)
    if (task) {
      task.cancel()
      activeTasks.delete(taskId)
    }
  })
}
