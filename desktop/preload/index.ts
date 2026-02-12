import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Config
  getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke('config:set', key, value),

  // Claude CLI
  checkClaude: () => ipcRenderer.invoke('claude:check') as Promise<{
    configured: boolean
    cliAvailable: boolean
  }>,
  useCLI: (model?: string) =>
    ipcRenderer.invoke('claude:use-cli', model) as Promise<{
      ok: boolean
      error?: string
    }>,
  getClaudeConfig: () => ipcRenderer.invoke('claude:get-config') as Promise<{
    mode: 'cli'
    model: string
    cliAvailable: boolean
  }>,

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Dependencies
  checkDeps: () => ipcRenderer.invoke('dep:check-all') as Promise<{
    claude: {
      configured: boolean
      mode: 'cli'
      model: string
      cliAvailable: boolean
    }
    platform: string
  }>,

  // Tasks — with streaming support
  createTask: (taskId: string, message: string) =>
    ipcRenderer.invoke('task:create', taskId, message) as Promise<{
      sessionId: string
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
    return () => ipcRenderer.removeListener('task:stream', handler)
  },

  // Gateway
  gateway: {
    start: () => ipcRenderer.invoke('gateway:start'),
    stop: () => ipcRenderer.invoke('gateway:stop'),
    getStatus: () => ipcRenderer.invoke('gateway:status'),
    rpc: (method: string, params?: unknown) =>
      ipcRenderer.invoke('gateway:rpc', method, params),
    sendMessage: (content: string, options?: { model?: string }) =>
      ipcRenderer.invoke('gateway:chat', content, options),
    onStatus: (callback: (status: any) => void) => {
      const handler = (_event: unknown, status: any) => callback(status)
      ipcRenderer.on('gateway:status', handler)
      return () => ipcRenderer.removeListener('gateway:status', handler)
    },
    onMessage: (callback: (message: any) => void) => {
      const handler = (_event: unknown, message: any) => callback(message)
      ipcRenderer.on('gateway:message', handler)
      return () => ipcRenderer.removeListener('gateway:message', handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
