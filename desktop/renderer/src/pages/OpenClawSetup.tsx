import { useEffect, useRef, useState } from 'react'

type Phase =
  | 'detecting'
  | 'not-found'
  | 'installing'
  | 'done'
  | 'error'

interface Props {
  onDone: () => void
}

export function OpenClawSetup({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [logs, setLogs] = useState('')
  const [version, setVersion] = useState('')
  const [error, setError] = useState('')
  const termRef = useRef<HTMLPreElement>(null)
  const started = useRef(false)

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }, [logs])

  // Detect on mount
  useEffect(() => {
    if (started.current) return
    started.current = true

    window.api.onInstallLog((line: string) => {
      setLogs(prev => prev + line)
    })

    detect()
  }, [])

  async function detect() {
    setLogs('$ openclaw --version\n')
    setPhase('detecting')

    try {
      const result = await window.api.checkOpenClaw()
      if (result.installed) {
        setLogs(prev => prev + `${result.version}\n`)
        setVersion(result.version)
        setPhase('done')
        return
      }
    } catch {
      // not found
    }

    setLogs(prev => prev + 'command not found: openclaw\n')
    setPhase('not-found')
  }

  async function handleInstall() {
    setPhase('installing')
    setLogs(prev => prev + '\n')

    try {
      const result = await window.api.installOpenClaw()
      if (result.ok) {
        setVersion(result.version ?? '')
        setPhase('done')
      } else {
        setError(result.error ?? 'Installation failed')
        setPhase('error')
      }
    } catch (err) {
      setError(String(err))
      setPhase('error')
    }
  }

  async function handleOpenTerminal() {
    await window.api.openTerminal()
  }

  function handleRetry() {
    setLogs('')
    setError('')
    started.current = false
    detect()
  }

  const phaseLabel: Record<Phase, string> = {
    detecting: '检测环境...',
    'not-found': '未检测到 OpenClaw',
    installing: '安装中...',
    done: `就绪 — ${version}`,
    error: '出现问题',
  }

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      <div className="drag-region h-8 shrink-0" />

      <div className="flex flex-1 flex-col px-8 pb-6">
        {/* Header */}
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#bcbec4]">OpenClaw Setup</h1>
            <p className="text-sm text-[#7d818a]">{phaseLabel[phase]}</p>
          </div>

          <div className="ml-auto">
            {(phase === 'detecting' || phase === 'installing') && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            )}
            {phase === 'done' && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-400">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            )}
            {(phase === 'not-found' || phase === 'error') && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-orange-400">
                  <path d="M12 9v4m0 4h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Terminal */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[#464951] bg-[#2b2d33]">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#464951] bg-[#383b42] px-3">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs text-[#7d818a]">openclaw — setup</span>
          </div>

          <pre
            ref={termRef}
            className="terminal-scroll flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed text-[#bcbec4]"
          >
            {logs || ''}
          </pre>
        </div>

        {/* Bottom actions */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-[#7d818a]">
            {phase === 'not-found' && '选择安装方式'}
            {phase === 'installing' && '正在安装 openclaw...'}
            {phase === 'done' && '后续配置请使用 openclaw configure'}
            {phase === 'error' && (
              <span className="text-red-400">{error}</span>
            )}
          </div>

          <div className="flex gap-3">
            {phase === 'not-found' && (
              <>
                <button onClick={handleOpenTerminal} className="btn-secondary cursor-pointer">
                  打开终端手动安装
                </button>
                <button onClick={handleInstall} className="btn-primary cursor-pointer px-8">
                  一键安装
                </button>
              </>
            )}
            {phase === 'error' && (
              <>
                <button onClick={handleOpenTerminal} className="btn-secondary cursor-pointer">
                  打开终端
                </button>
                <button onClick={handleRetry} className="btn-secondary cursor-pointer">
                  重试
                </button>
              </>
            )}
            {phase === 'done' && (
              <button onClick={onDone} className="btn-primary cursor-pointer px-8">
                进入
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
