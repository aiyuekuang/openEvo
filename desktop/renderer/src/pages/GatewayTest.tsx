import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

interface Props {
  onBack?: () => void
}

export function GatewayTest({ onBack }: Props = {}) {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])

  useEffect(() => {
    // 监听 Gateway 状态变化
    const unsubStatus = window.api.gateway.onStatus((newStatus) => {
      console.log('Gateway status:', newStatus)
      setStatus(newStatus)
    })

    // 监听 Gateway 消息
    const unsubMessage = window.api.gateway.onMessage((message) => {
      console.log('Gateway message:', message)
      setMessages((prev) => [...prev, message])
    })

    // 获取初始状态
    window.api.gateway.getStatus().then(setStatus).catch(console.error)

    return () => {
      unsubStatus()
      unsubMessage()
    }
  }, [])

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.gateway.start()
      console.log('Gateway started:', result)
      setStatus(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error('Failed to start gateway:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    setError(null)
    try {
      await window.api.gateway.stop()
      console.log('Gateway stopped')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error('Failed to stop gateway:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.gateway.sendMessage('Hello, OpenClaw Gateway!')
      console.log('Message sent:', result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error('Failed to send message:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      {/* Titlebar */}
      <div className="drag-region flex h-12 shrink-0 items-center border-b border-[#464951] px-4">
        <div className="ml-20 flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="no-drag cursor-pointer rounded-md p-1.5 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="text-sm font-medium text-[#bcbec4]">Gateway 测试</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-6 rounded-lg border border-[#464951] bg-[#1e1f24] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#bcbec4]">Gateway 状态</h2>
          <pre className="overflow-auto text-xs text-[#7d818a]">
            {JSON.stringify(status, null, 2)}
          </pre>
        </div>

        <div className="mb-6 flex gap-3">
          <button
            onClick={handleStart}
            disabled={loading || status?.status === 'running'}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '处理中...' : '启动 Gateway'}
          </button>

          <button
            onClick={handleStop}
            disabled={loading || status?.status === 'stopped'}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '处理中...' : '停止 Gateway'}
          </button>

          <button
            onClick={handleSendMessage}
            disabled={loading || status?.status !== 'running'}
            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '发送中...' : '发送测试消息'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-[#464951] bg-[#1e1f24] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#bcbec4]">消息日志</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-[#7d818a]">暂无消息</p>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className="rounded border border-[#464951] bg-[#2b2d33] p-3 text-xs text-[#bcbec4]"
                >
                  <pre className="overflow-auto">{JSON.stringify(msg, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
