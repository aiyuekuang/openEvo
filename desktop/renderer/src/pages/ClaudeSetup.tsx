import { useState, useEffect } from 'react'
import { Terminal, ExternalLink } from 'lucide-react'

type Phase = 'checking' | 'cli-found' | 'cli-not-found' | 'configuring' | 'done'

interface Props {
  onDone: () => void
}

export function ClaudeSetup({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [model, setModel] = useState('claude-sonnet-4-5-20250929')

  useEffect(() => {
    checkClaude()
  }, [])

  async function checkClaude() {
    setPhase('checking')

    try {
      const result = await window.api.checkClaude()

      if (result.configured) {
        setPhase('done')
      } else if (result.cliAvailable) {
        setPhase('cli-found')
      } else {
        setPhase('cli-not-found')
      }
    } catch {
      setPhase('cli-not-found')
    }
  }

  async function handleUseCLI() {
    setPhase('configuring')

    try {
      const result = await window.api.useCLI(model)
      if (result.ok) {
        setPhase('done')
        setTimeout(() => onDone(), 1000)
      } else {
        setPhase('cli-not-found')
      }
    } catch {
      setPhase('cli-not-found')
    }
  }

  const phaseLabel: Record<Phase, string> = {
    checking: '检测 Claude CLI...',
    'cli-found': '检测到本地 Claude CLI',
    'cli-not-found': 'Claude CLI 未安装',
    configuring: '保存配置...',
    done: '配置完成',
  }

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      <div className="drag-region h-8 shrink-0" />

      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-6">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20">
            <Terminal size={32} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#bcbec4]">Claude CLI 配置</h1>
            <p className="mt-1 text-sm text-[#7d818a]">{phaseLabel[phase]}</p>
          </div>
        </div>

        {/* Checking State */}
        {phase === 'checking' && (
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-sm text-[#7d818a]">检测本地 Claude CLI...</span>
          </div>
        )}

        {/* CLI Found */}
        {phase === 'cli-found' && (
          <div className="w-full max-w-md space-y-4">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <Terminal size={24} className="text-green-400" />
                </div>
              </div>
              <p className="mb-2 text-sm font-medium text-[#bcbec4]">
                检测到本地 Claude CLI ✓
              </p>
              <p className="mb-4 text-xs text-[#7d818a]">可以直接使用，无需额外配置</p>

              {/* Model Selection */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-[#bcbec4]">选择模型</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-[#464951] bg-[#383b42] px-4 py-2.5 text-[#bcbec4] focus:border-indigo-500 focus:outline-none"
                >
                  <option value="claude-sonnet-4-5-20250929">Claude 4.5 Sonnet</option>
                  <option value="claude-opus-4-6">Claude 4.6 Opus</option>
                  <option value="claude-haiku-4-5-20251001">Claude 4.5 Haiku</option>
                </select>
              </div>

              <button onClick={handleUseCLI} className="btn-primary w-full cursor-pointer">
                使用 Claude CLI
              </button>
            </div>
          </div>
        )}

        {/* CLI Not Found */}
        {phase === 'cli-not-found' && (
          <div className="w-full max-w-md space-y-4">
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-6 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20">
                  <Terminal size={24} className="text-orange-400" />
                </div>
              </div>
              <p className="mb-2 text-sm font-medium text-[#bcbec4]">未检测到 Claude CLI</p>
              <p className="mb-4 text-xs text-[#7d818a]">
                请先安装 Claude CLI 才能使用此应用
              </p>
            </div>

            {/* Install Guide */}
            <div className="space-y-3 rounded-lg border border-[#464951] bg-[#383b42] p-4">
              <p className="text-sm font-medium text-[#bcbec4]">安装 Claude CLI：</p>

              <div className="space-y-2 text-sm text-[#7d818a]">
                <div className="rounded bg-[#2b2d33] p-3 font-mono text-xs">
                  <p className="text-green-400"># macOS / Linux</p>
                  <p className="mt-1">npm install -g @anthropic-ai/claude-code</p>
                </div>

                <div className="rounded bg-[#2b2d33] p-3 font-mono text-xs">
                  <p className="text-green-400"># Windows</p>
                  <p className="mt-1">npm install -g @anthropic-ai/claude-code</p>
                </div>
              </div>

              <button
                onClick={() =>
                  window.api.openExternal('https://github.com/anthropics/claude-code')
                }
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#464951] px-4 py-2 text-sm text-[#bcbec4] transition-colors hover:bg-[#464951]"
              >
                <ExternalLink size={14} />
                查看安装文档
              </button>

              <button
                onClick={checkClaude}
                className="btn-primary w-full cursor-pointer"
              >
                重新检测
              </button>
            </div>
          </div>
        )}

        {/* Configuring State */}
        {phase === 'configuring' && (
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-sm text-[#7d818a]">配置中...</span>
          </div>
        )}

        {/* Done State */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-green-400"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm text-[#bcbec4]">配置完成</p>
            <button onClick={onDone} className="btn-primary cursor-pointer px-8">
              进入
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
