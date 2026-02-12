import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, Terminal } from 'lucide-react'

interface Props {
  onBack: () => void
  onSetup?: () => void
  onGatewayTest?: () => void
}

export function Settings({ onBack, onSetup, onGatewayTest }: Props) {
  const [claudeConfig, setClaudeConfig] = useState<{
    mode: 'cli'
    model: string
    cliAvailable: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadClaudeConfig() {
    setLoading(true)
    try {
      const config = await window.api.getClaudeConfig()
      setClaudeConfig(config)
    } catch (error) {
      console.error('Failed to load Claude config:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadClaudeConfig()
  }, [])

  const modelNames: Record<string, string> = {
    'claude-sonnet-4-5-20250929': 'Claude 4.5 Sonnet',
    'claude-opus-4-6': 'Claude 4.6 Opus',
    'claude-haiku-4-5-20251001': 'Claude 4.5 Haiku',
  }

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      {/* Titlebar */}
      <div className="drag-region flex h-12 shrink-0 items-center border-b border-[#464951] px-4">
        <div className="ml-20 flex items-center gap-3">
          <button
            onClick={onBack}
            className="no-drag cursor-pointer rounded-md p-1.5 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-medium text-[#bcbec4]">设置</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto terminal-scroll p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Section: Claude CLI 配置 */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#7d818a]">
              Claude CLI 配置
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : claudeConfig?.cliAvailable ? (
              <div className="space-y-3">
                {/* CLI 状态卡片 */}
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-[#bcbec4]" />
                        <span className="text-sm font-medium text-[#bcbec4]">Claude CLI</span>
                      </div>
                      <p className="text-xs text-[#7d818a]">已连接</p>
                    </div>
                    <button
                      onClick={onSetup}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#464951] px-3 py-1.5 text-xs text-[#bcbec4] transition-colors hover:bg-[#464951]"
                    >
                      重新配置
                    </button>
                  </div>
                </div>

                {/* 模型卡片 */}
                <div className="rounded-xl border border-[#464951] bg-[#383b42] p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#bcbec4]">模型</span>
                        <span className="text-xs text-[#7d818a]">
                          {modelNames[claudeConfig.model] || claudeConfig.model}
                        </span>
                      </div>
                      <p className="text-xs text-[#7d818a]">当前使用的 AI 模型</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#464951] bg-[#383b42] p-6 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20">
                    <Terminal size={20} className="text-orange-400" />
                  </div>
                </div>
                <p className="mb-4 text-sm text-[#bcbec4]">未检测到 Claude CLI</p>
                <button onClick={onSetup} className="btn-primary cursor-pointer px-6">
                  重新配置
                </button>
              </div>
            )}
          </div>

          {/* Section: 关于 */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#7d818a]">
              关于
            </h2>
            <div className="rounded-xl border border-[#464951] bg-[#383b42] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#bcbec4]">AI Skill Forge</p>
                  <p className="text-xs text-[#7d818a]">基于 Claude CLI 的智能助手</p>
                </div>
                <button
                  onClick={() =>
                    window.api.openExternal('https://github.com/anthropics/claude-code')
                  }
                  className="no-drag flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#464951] px-3 py-1.5 text-xs text-[#bcbec4] transition-colors hover:bg-[#464951]"
                >
                  <ExternalLink size={12} />
                  文档
                </button>
              </div>
            </div>
          </div>

          {/* Section: 系统信息 */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#7d818a]">
              系统信息
            </h2>
            <div className="rounded-xl border border-[#464951] bg-[#383b42] p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7d818a]">平台</span>
                  <span className="text-[#bcbec4]">{navigator.platform}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7d818a]">模式</span>
                  <span className="flex items-center gap-1 text-[#bcbec4]">
                    <Terminal size={12} />
                    CLI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: 开发者工具 */}
          {onGatewayTest && (
            <div>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#7d818a]">
                开发者工具
              </h2>
              <div className="rounded-xl border border-[#464951] bg-[#383b42] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#bcbec4]">Gateway 测试</p>
                    <p className="text-xs text-[#7d818a]">测试 OpenClaw Gateway 集成</p>
                  </div>
                  <button
                    onClick={onGatewayTest}
                    className="no-drag flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/20"
                  >
                    打开测试
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
