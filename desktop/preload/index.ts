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

  // Tasks
  createTask: (taskId: string, message: string, providerId?: string, model?: string) =>
    ipcRenderer.invoke('task:create', taskId, message, providerId, model) as Promise<{
      reply?: string
      error?: string
    }>,
  cancelTask: (id: string) => ipcRenderer.invoke('task:cancel', id),

  // Task stream events
  onTaskStream: (callback: (event: {
    taskId: string
    type: 'token' | 'error'
    content?: string
    fullResponse?: string
    error?: string
  }) => void) => {
    const handler = (_event: unknown, streamEvent: any) => callback(streamEvent)
    ipcRenderer.on('task:stream', handler)
    return () => { ipcRenderer.removeListener('task:stream', handler) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
