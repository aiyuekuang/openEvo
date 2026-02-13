/**
 * Gateway Task Handler
 * 处理通过 Gateway 的任务执行
 */
import { GatewayManager } from './gateway/manager'

interface TaskResult {
  sessionId: string
  reply?: string
  error?: string
}

export async function executeTaskViaGateway(
  gatewayManager: GatewayManager,
  taskId: string,
  message: string,
  model: string,
  onStream: (event: { taskId: string; type: string; content?: string; fullResponse?: string; error?: string }) => void
): Promise<TaskResult> {
  const sessionId = `session-${taskId.slice(0, 8)}`
  let fullResponse = ''
  let resolved = false

  return new Promise<TaskResult>((resolve) => {
    let timeoutId: NodeJS.Timeout

    const cleanup = () => {
      gatewayManager.off('notification', notificationHandler)
      gatewayManager.off('chat:message', chatMessageHandler)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }

    const safeResolve = (result: TaskResult) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    // 通知处理器 - 处理 agent 事件
    const notificationHandler = (data: { method: string; params: any }) => {
      console.log('[Task] Received notification:', data.method)
      if (resolved) return

      // Gateway 将 agent 事件作为通知发送
      if (data.method === 'agent' && data.params) {
        const payload = data.params
        console.log('[Task] Agent event payload:', JSON.stringify(payload, null, 2))

        // lifecycle 事件
        if (payload.stream === 'lifecycle') {
          if (payload.data?.phase === 'start') {
            console.log('[Task] Agent started:', payload.runId)
          } else if (payload.data?.phase === 'end') {
            console.log('[Task] Agent ended:', payload.runId)
          }
        }

        // assistant stream 事件（文本内容）
        if (payload.stream === 'assistant' && payload.data?.delta) {
          const delta = payload.data.delta
          console.log('[Task] Received text delta:', delta)
          fullResponse += delta
          onStream({
            taskId,
            type: 'token',
            content: delta,
            fullResponse,
          })
        }
      }
    }

    // 聊天消息处理器 - 处理 chat 事件
    const chatMessageHandler = (data: { message: any }) => {
      console.log('[Task] Received chat:message event:', JSON.stringify(data, null, 2))
      if (resolved) return

      const message = data.message

      // 处理流式 content_block_delta（逐字输出）
      if (message.type === 'content_block_delta' && message.delta?.text) {
        const deltaText = message.delta.text
        console.log('[Task] Received content_block_delta:', deltaText)
        fullResponse += deltaText
        onStream({
          taskId,
          type: 'token',
          content: deltaText,
          fullResponse,
        })
      }

      // 处理消息完成（message_stop）
      if (message.type === 'message_stop') {
        console.log('[Task] Message stop reached')
        // 任务完成
        if (fullResponse) {
          safeResolve({ sessionId, reply: fullResponse })
        } else {
          safeResolve({ sessionId, error: 'No response received' })
        }
      }

      // 兼容旧格式：chat 事件的 payload 包含状态信息
      if (message.state === 'final') {
        console.log('[Task] Chat final state reached')
        // 任务完成
        if (fullResponse) {
          safeResolve({ sessionId, reply: fullResponse })
        } else {
          safeResolve({ sessionId, error: 'No response received' })
        }
      }
    }

    // 超时处理
    timeoutId = setTimeout(() => {
      console.log('[Task] Timeout reached. Full response so far:', fullResponse)
      if (fullResponse) {
        safeResolve({ sessionId, reply: fullResponse })
      } else {
        safeResolve({ sessionId, error: 'Request timeout after 2 minutes' })
      }
    }, 120000)

    // 监听事件
    gatewayManager.on('notification', notificationHandler)
    gatewayManager.on('chat:message', chatMessageHandler)

    // 发送 RPC 请求 (OpenClaw Gateway API 格式)
    const idempotencyKey = `${taskId}-${Date.now()}`

    // 优先使用支持工具调用的 GPT-4o 模型
    const requestParams: any = {
      sessionKey: sessionId,
      message: message,
      deliver: false, // 不立即发送，等待流式响应
      idempotencyKey,
    }

    // 如果指定了模型，添加到参数中
    if (model) {
      requestParams.model = model
    }

    console.log('[Task] Sending chat.send with params:', JSON.stringify(requestParams, null, 2))

    gatewayManager
      .rpc('chat.send', requestParams)
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[Task] RPC error:', errorMessage)
        safeResolve({ sessionId, error: errorMessage })
      })
  })
}
