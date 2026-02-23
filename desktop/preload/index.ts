import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Config
  getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Provider management
  provider: {
    list: () => ipcRenderer.invoke('provider:list') as Promise<{
      presets: any[]
      custom: any[]
    }>,
    statuses: () => ipcRenderer.invoke('provider:statuses') as Promise<Array<{
      providerId: string
      configured: boolean
      authMode?: 'api_key' | 'oauth'
      email?: string
      maskedKey?: string
      defaultModel?: string
    }>>,
    saveAuth: (auth: {
      providerId: string
      mode: 'api_key' | 'oauth'
      apiKey?: string
      accessToken?: string
      email?: string
    }) => ipcRenderer.invoke('provider:save-auth', auth) as Promise<{ ok: boolean }>,
    deleteAuth: (providerId: string) =>
      ipcRenderer.invoke('provider:delete-auth', providerId) as Promise<{ ok: boolean }>,
    test: (providerId: string, apiKey: string, baseUrl?: string, model?: string) =>
      ipcRenderer.invoke('provider:test', providerId, apiKey, baseUrl, model) as Promise<{ ok: boolean; error?: string }>,
    setDefaultModel: (providerId: string, modelId: string) =>
      ipcRenderer.invoke('provider:set-default-model', providerId, modelId) as Promise<{ ok: boolean }>,
    setActive: (providerId: string, model: string) =>
      ipcRenderer.invoke('provider:set-active', providerId, model) as Promise<{ ok: boolean }>,
    getActive: () => ipcRenderer.invoke('provider:get-active') as Promise<{
      providerId: string
      model: string
    } | null>,
    addCustom: (provider: any) =>
      ipcRenderer.invoke('provider:add-custom', provider) as Promise<{ ok: boolean }>,
    removeCustom: (id: string) =>
      ipcRenderer.invoke('provider:remove-custom', id) as Promise<{ ok: boolean }>,
  },

  // OAuth
  oauth: {
    start: (providerId: string) =>
      ipcRenderer.invoke('oauth:start', providerId) as Promise<{ ok: boolean }>,
    cancel: (providerId: string) =>
      ipcRenderer.invoke('oauth:cancel', providerId) as Promise<{ ok: boolean }>,
    onStatus: (callback: (event: {
      providerId: string
      status: 'device_code' | 'polling' | 'success' | 'error'
      info?: { userCode: string; verificationUri: string; expiresIn: number }
      error?: string
    }) => void) => {
      const handler = (_event: unknown, data: any) => callback(data)
      ipcRenderer.on('oauth:status', handler)
      return () => { ipcRenderer.removeListener('oauth:status', handler) }
    },
  },

  // Memory
  memory: {
    load: () => ipcRenderer.invoke('memory:load') as Promise<string>,
    save: (content: string) =>
      ipcRenderer.invoke('memory:save', content) as Promise<{ ok: boolean }>,
    append: (entry: string) =>
      ipcRenderer.invoke('memory:append', entry) as Promise<{ ok: boolean }>,
    dailyLog: (dateStr?: string) =>
      ipcRenderer.invoke('memory:daily-log', dateStr) as Promise<string>,
    dailyLogAppend: (entry: string, dateStr?: string) =>
      ipcRenderer.invoke('memory:daily-log-append', entry, dateStr) as Promise<{ ok: boolean }>,
    listLogs: () => ipcRenderer.invoke('memory:list-logs') as Promise<string[]>,
    getDir: () => ipcRenderer.invoke('memory:get-dir') as Promise<string>,
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke('memory:search', query, limit) as Promise<{
        results: Array<{ id: string; path: string; snippet: string; score: number }>
        error?: string
      }>,
    syncIndex: () =>
      ipcRenderer.invoke('memory:sync-index') as Promise<{ ok: boolean; error?: string }>,
    indexStatus: () =>
      ipcRenderer.invoke('memory:index-status') as Promise<{
        chunkCount: number
        fileCount: number
        fts5Available: boolean
        error?: string
      }>,
  },

  // Skills
  skills: {
    list: () => ipcRenderer.invoke('skills:list') as Promise<{
      skills: Array<{
        name: string
        description: string
        category: string
        mode: string
        version: string
        tags: string[]
      }>
      baseDir?: string
      dirs?: { system: string; market: string; custom: string }
      error?: string
    }>,
    resetSystem: () =>
      ipcRenderer.invoke('skills:reset-system') as Promise<{
        ok: boolean
        total?: number
        skills?: string[]
        error?: string
      }>,
  },

  // Tasks
  createTask: (taskId: string, message: string, providerId?: string, model?: string) =>
    ipcRenderer.invoke('task:create', taskId, message, providerId, model) as Promise<{
      reply?: string
      error?: string
    }>,
  cancelTask: (id: string) => ipcRenderer.invoke('task:cancel', id),
  loadAllTasks: () => ipcRenderer.invoke('task:load-all') as Promise<Array<{
    id: string
    sessionId: string
    title: string
    message: string
    status: 'pending' | 'running' | 'done' | 'error'
    createdAt: number
    conversation: Array<{ role: string; content: string; timestamp: number }>
    images: string[]
    steps: any[]
    error?: string
  }>>,
  deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id) as Promise<{ ok: boolean }>,

  // Task stream events
  onTaskStream: (callback: (event: {
    taskId: string
    type: 'token' | 'error' | 'memory-saved' | 'tool_call' | 'tool_result'
    content?: string
    fullResponse?: string
    error?: string
    entries?: string[]
    toolCall?: { id: string; name: string; arguments: Record<string, unknown> }
    toolResult?: { toolCallId: string; content: string; isError?: boolean }
    depth?: number
    skillName?: string
    duration?: number
  }) => void) => {
    const handler = (_event: unknown, streamEvent: any) => callback(streamEvent)
    ipcRenderer.on('task:stream', handler)
    return () => { ipcRenderer.removeListener('task:stream', handler) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
