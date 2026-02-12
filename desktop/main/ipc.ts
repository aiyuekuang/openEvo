import { ipcMain, shell } from 'electron'
import { ConfigStore } from './config/store'
import { createClaudeCLIAdapter, ClaudeCLIAdapter } from './llm/claude-cli-adapter'
import { GatewayManager } from './gateway/manager'
import { executeTaskViaGateway } from './task-handler'

const configStore = new ConfigStore()

// Active task sessions
const activeTasks = new Map<string, { sessionId: string; cancel: () => void }>()

export function registerIpcHandlers(gatewayManager: GatewayManager) {
  // --- Gateway 控制 ---
  ipcMain.handle('gateway:start', async () => {
    await gatewayManager.start()
    return gatewayManager.getStatus()
  })

  ipcMain.handle('gateway:stop', async () => {
    await gatewayManager.stop()
  })

  ipcMain.handle('gateway:restart', async () => {
    await gatewayManager.restart()
  })

  ipcMain.handle('gateway:status', async () => {
    return gatewayManager.getStatus()
  })

  ipcMain.handle('gateway:rpc', async (_e, method: string, params?: unknown) => {
    return gatewayManager.rpc(method, params)
  })

  ipcMain.handle('gateway:chat', async (event, content: string, options?: { model?: string }) => {
    const sender = event.sender

    try {
      // 通过 RPC 调用发送聊天消息
      const result = await gatewayManager.rpc('chat.send', {
        content,
        model: options?.model || 'claude-sonnet-4-5-20250929',
      })

      return { success: true, result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[IPC] Gateway chat error:', errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // --- 原有 handlers ---
  // --- Config ---
  ipcMain.handle('config:get', async (_e, key: string) => {
    return configStore.get(key)
  })

  ipcMain.handle('config:set', async (_e, key: string, value: unknown) => {
    return configStore.set(key, value)
  })

  // --- Claude CLI 检测 ---
  ipcMain.handle('claude:check', async () => {
    const cliAvailable = await ClaudeCLIAdapter.isAvailable()

    if (cliAvailable) {
      return {
        configured: true,
        cliAvailable: true,
      }
    }

    return {
      configured: false,
      cliAvailable: false,
    }
  })

  // --- 使用 CLI 模式 ---
  ipcMain.handle('claude:use-cli', async (_e, model?: string) => {
    const cliAvailable = await ClaudeCLIAdapter.isAvailable()
    if (!cliAvailable) {
      return {
        ok: false,
        error: 'Claude CLI not found. Please install it first.',
      }
    }

    configStore.set('claudeMode', 'cli')
    if (model) {
      configStore.set('claudeModel', model)
    }

    return { ok: true }
  })

  // --- 获取 Claude 配置 ---
  ipcMain.handle('claude:get-config', async () => {
    const model = (configStore.get('claudeModel') as string) || 'claude-sonnet-4-5-20250929'
    const cliAvailable = await ClaudeCLIAdapter.isAvailable()

    return { mode: 'cli', model, cliAvailable }
  })

  // --- Open external URL ---
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  // --- Task: Create & run (使用 Gateway) ---
  ipcMain.handle('task:create', async (event, taskId: string, message: string) => {
    const sender = event.sender
    const sessionId = `session-${taskId.slice(0, 8)}`

    // 获取配置
    const model = (configStore.get('claudeModel') as string) || 'claude-sonnet-4-5-20250929'

    // 检查 Gateway 状态
    const gatewayStatus = gatewayManager.getStatus()
    console.log('[IPC] Gateway status:', gatewayStatus)
    if (gatewayStatus.state !== 'running') {
      return {
        sessionId,
        error: `Gateway not running. Current state: ${gatewayStatus.state}. Error: ${gatewayStatus.error || 'none'}`,
      }
    }

    // 取消标志（暂不支持取消）
    const cancel = () => {}
    activeTasks.set(taskId, { sessionId, cancel })

    try {
      const result = await executeTaskViaGateway(
        gatewayManager,
        taskId,
        message,
        model,
        (streamEvent) => {
          console.log('[IPC] Sending task:stream event:', streamEvent.type, streamEvent.fullResponse?.substring(0, 50))
          sender.send('task:stream', streamEvent)
        }
      )

      activeTasks.delete(taskId)
      return result
    } catch (error) {
      activeTasks.delete(taskId)
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[IPC] Task error:', errorMessage)
      return { sessionId, error: errorMessage }
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

  // --- Dependency check ---
  ipcMain.handle('dep:check-all', async () => {
    const cliAvailable = await ClaudeCLIAdapter.isAvailable()

    return {
      claude: {
        configured: cliAvailable,
        mode: 'cli',
        model: (configStore.get('claudeModel') as string) || 'claude-sonnet-4-5-20250929',
        cliAvailable,
      },
      platform: process.platform,
    }
  })
}
