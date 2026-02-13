import { useEffect, useState } from 'react'
import { ArrowLeft, Bot, Bell, Settings as SettingsIcon, Info, Loader2, Plus, Globe, Copy, CheckCircle } from 'lucide-react'

interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: { id: string; name: string; description?: string }[]
  authModes: ('api_key' | 'oauth')[]
  sdkType: string
}

interface ProviderStatusInfo {
  providerId: string
  configured: boolean
  authMode?: 'api_key' | 'oauth'
  email?: string
  maskedKey?: string
  defaultModel?: string
}

interface OAuthFlowState {
  status: 'idle' | 'device_code' | 'polling' | 'success' | 'error'
  userCode?: string
  verificationUri?: string
  error?: string
}

type NavItem = 'models' | 'notify' | 'general' | 'about'

interface Props {
  onBack: () => void
}

export function Settings({ onBack }: Props) {
  const [activeNav, setActiveNav] = useState<NavItem>('models')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [statuses, setStatuses] = useState<ProviderStatusInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; error?: string } | null>(null)
  const [oauthFlows, setOauthFlows] = useState<Record<string, OAuthFlowState>>({})
  const [copiedCode, setCopiedCode] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [providerData, statusData] = await Promise.all([
        window.api.provider.list(),
        window.api.provider.statuses(),
      ])
      setProviders([...providerData.presets, ...providerData.custom])
      setStatuses(statusData)
    } catch (err) {
      console.error('Failed to load provider data:', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Listen for OAuth status events
  useEffect(() => {
    const unsub = window.api.oauth.onStatus((event) => {
      setOauthFlows(prev => {
        const existing = prev[event.providerId]
        return {
          ...prev,
          [event.providerId]: {
            status: event.status,
            // Preserve userCode/verificationUri from device_code phase during polling
            userCode: event.info?.userCode ?? existing?.userCode,
            verificationUri: event.info?.verificationUri ?? existing?.verificationUri,
            error: event.error,
          },
        }
      })

      // On success, reload data
      if (event.status === 'success') {
        loadData()
        // Auto-clear success after 3s
        setTimeout(() => {
          setOauthFlows(prev => ({
            ...prev,
            [event.providerId]: { status: 'idle' },
          }))
        }, 3000)
      }
    })
    return unsub
  }, [])

  function getStatus(id: string) {
    return statuses.find(s => s.providerId === id)
  }

  function getOAuthFlow(id: string): OAuthFlowState {
    return oauthFlows[id] || { status: 'idle' }
  }

  async function handleStartOAuth(providerId: string) {
    setOauthFlows(prev => ({
      ...prev,
      [providerId]: { status: 'polling' },
    }))
    await window.api.oauth.start(providerId)
  }

  async function handleCancelOAuth(providerId: string) {
    await window.api.oauth.cancel(providerId)
    setOauthFlows(prev => ({
      ...prev,
      [providerId]: { status: 'idle' },
    }))
  }

  async function handleCopyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleSaveApiKey(providerId: string) {
    if (!apiKeyInput.trim()) return
    await window.api.provider.saveAuth({
      providerId,
      mode: 'api_key',
      apiKey: apiKeyInput.trim(),
    })
    const provider = providers.find(p => p.id === providerId)
    if (provider?.models[0]) {
      await window.api.provider.setDefaultModel(providerId, provider.models[0].id)
    }
    setEditingId(null)
    setApiKeyInput('')
    setBaseUrlInput('')
    await loadData()
  }

  async function handleTest(providerId: string) {
    const keyToTest = apiKeyInput.trim()
    if (!keyToTest && !statuses.find(s => s.providerId === providerId)?.configured) return
    setTesting(providerId)
    setTestResult(null)
    const result = await window.api.provider.test(providerId, keyToTest)
    setTestResult({ id: providerId, ...result })
    setTesting(null)
  }

  async function handleRemove(providerId: string) {
    await window.api.provider.deleteAuth(providerId)
    await loadData()
  }

  async function handleModelChange(providerId: string, modelId: string) {
    await window.api.provider.setDefaultModel(providerId, modelId)
    await window.api.provider.setActive(providerId, modelId)
    await loadData()
  }

  const navItems: { id: NavItem; label: string; icon: typeof Bot; section: string }[] = [
    { id: 'models', label: '模型配置', icon: Bot, section: '账号配置' },
    { id: 'notify', label: '通知设置', icon: Bell, section: '账号配置' },
    { id: 'general', label: '通用设置', icon: SettingsIcon, section: '通用' },
    { id: 'about', label: '关于', icon: Info, section: '通用' },
  ]

  const sections = [...new Set(navItems.map(n => n.section))]

  // Split providers into OAuth and API Key groups
  const oauthProviders = providers.filter(p => p.authModes.includes('oauth'))
  const apiKeyProviders = providers.filter(p => !p.authModes.includes('oauth'))

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      {/* Titlebar */}
      <div className="drag-region flex h-12 shrink-0 items-center border-b border-[#464951] px-4">
        <div className="ml-20 flex items-center gap-3">
          <button onClick={onBack} className="no-drag cursor-pointer rounded-md p-1.5 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-medium text-[#bcbec4]">设置</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex w-[220px] shrink-0 flex-col gap-2 border-r border-[#464951] py-5">
          {sections.map(section => (
            <div key={section}>
              <div className="px-4 pb-1 text-[11px] font-semibold tracking-wider text-[#7d818a]">{section}</div>
              <div className="space-y-0.5 px-2">
                {navItems.filter(n => n.section === section).map(item => {
                  const Icon = item.icon
                  const active = activeNav === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                        active ? 'bg-[#383b42] font-medium text-[#bcbec4]' : 'text-[#8c8f96] hover:bg-[#383b42]/50'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-indigo-400' : 'text-[#7d818a]'} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Content */}
        <div className="flex-1 overflow-y-auto terminal-scroll p-8">
          {activeNav === 'models' && (
            <div className="mx-auto max-w-[720px] space-y-6">
              <div>
                <h1 className="text-lg font-semibold text-[#bcbec4]">模型配置</h1>
                <p className="mt-1 text-[13px] text-[#7d818a]">配置 AI 模型供应商的 API 密钥或登录凭证，用于任务执行</p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : (
                <>
                  {/* OAuth Providers Section */}
                  {oauthProviders.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Globe size={14} className="text-indigo-400" />
                        <span className="text-[13px] font-medium text-[#bcbec4]">浏览器登录</span>
                        <span className="text-[11px] text-[#7d818a]">— 一键登录，免费使用</span>
                      </div>

                      {oauthProviders.map(provider => {
                        const status = getStatus(provider.id)
                        const configured = status?.configured
                        const flow = getOAuthFlow(provider.id)
                        const isFlowActive = flow.status !== 'idle' && flow.status !== 'success'

                        return (
                          <div key={provider.id} className="rounded-xl border border-[#464951] bg-[#383b42]">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`h-2 w-2 rounded-full ${configured ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-[#464951]'}`} />
                                <span className="text-[14px] font-medium text-[#bcbec4]">{provider.name}</span>
                                {configured && (
                                  <span className="rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">已登录</span>
                                )}
                                {flow.status === 'success' && (
                                  <span className="flex items-center gap-1 rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                                    <CheckCircle size={10} /> 登录成功
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {configured && (
                                  <button
                                    onClick={() => handleRemove(provider.id)}
                                    className="cursor-pointer rounded-md border border-red-500/30 px-3 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
                                  >
                                    退出登录
                                  </button>
                                )}
                                {!configured && !isFlowActive && (
                                  <button
                                    onClick={() => handleStartOAuth(provider.id)}
                                    className="cursor-pointer rounded-md bg-indigo-500 px-4 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-600"
                                  >
                                    浏览器登录
                                  </button>
                                )}
                                {isFlowActive && (
                                  <button
                                    onClick={() => handleCancelOAuth(provider.id)}
                                    className="cursor-pointer rounded-md border border-[#464951] px-3 py-1 text-[11px] text-[#7d818a] transition-colors hover:bg-[#464951]"
                                  >
                                    取消
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* OAuth Device Code + Polling with code */}
                            {(flow.status === 'device_code' || flow.status === 'polling') && flow.userCode && (
                              <div className="border-t border-[#464951] px-4 py-3 space-y-3">
                                <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 p-4 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                                    <p className="text-[12px] text-indigo-300">
                                      浏览器已打开，请在页面中输入以下验证码:
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <code className="rounded-lg bg-[#2b2d33] px-5 py-2.5 font-mono text-xl font-bold tracking-[0.3em] text-white">
                                      {flow.userCode}
                                    </code>
                                    <button
                                      onClick={() => handleCopyCode(flow.userCode!)}
                                      className="cursor-pointer rounded-md border border-[#464951] p-2 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
                                      title="复制验证码"
                                    >
                                      {copiedCode ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-[#7d818a]">
                                    如果浏览器未自动打开，请手动访问:{' '}
                                    <button
                                      onClick={() => window.api.openExternal(flow.verificationUri!)}
                                      className="cursor-pointer text-indigo-400 underline hover:text-indigo-300"
                                    >
                                      {flow.verificationUri}
                                    </button>
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Polling without code (initial connecting phase) */}
                            {flow.status === 'polling' && !flow.userCode && (
                              <div className="border-t border-[#464951] px-4 py-3">
                                <div className="flex items-center gap-2 text-[12px] text-[#7d818a]">
                                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                                  正在连接...
                                </div>
                              </div>
                            )}

                            {/* Error */}
                            {flow.status === 'error' && (
                              <div className="border-t border-[#464951] px-4 py-3">
                                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                                  登录失败: {flow.error}
                                </div>
                              </div>
                            )}

                            {/* Configured info */}
                            {configured && flow.status !== 'device_code' && (
                              <div className="border-t border-[#464951] px-4 py-3 space-y-2">
                                <div className="flex items-center gap-3">
                                  <span className="w-14 text-[12px] text-[#7d818a]">默认模型</span>
                                  <select
                                    value={status?.defaultModel || provider.models[0]?.id}
                                    onChange={e => handleModelChange(provider.id, e.target.value)}
                                    className="cursor-pointer rounded-md border border-[#464951] bg-[#2b2d33] px-3 py-1 text-[12px] text-[#bcbec4] outline-none focus:border-indigo-500"
                                  >
                                    {provider.models.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* API Key Providers Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-[#7d818a]" />
                      <span className="text-[13px] font-medium text-[#bcbec4]">API Key 配置</span>
                      <span className="text-[11px] text-[#7d818a]">— 使用自己的 API 密钥</span>
                    </div>

                    {apiKeyProviders.map(provider => {
                      const status = getStatus(provider.id)
                      const isEditing = editingId === provider.id
                      const configured = status?.configured

                      return (
                        <div key={provider.id} className="rounded-xl border border-[#464951] bg-[#383b42]">
                          {/* Header */}
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`h-2 w-2 rounded-full ${configured ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-[#464951]'}`} />
                              <span className="text-[14px] font-medium text-[#bcbec4]">{provider.name}</span>
                              {configured && (
                                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">API Key</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {configured && (
                                <>
                                  <button
                                    onClick={() => handleTest(provider.id)}
                                    disabled={testing === provider.id}
                                    className="cursor-pointer rounded-md border border-[#464951] px-3 py-1 text-[11px] text-[#7d818a] transition-colors hover:bg-[#464951] disabled:opacity-50"
                                  >
                                    {testing === provider.id ? <Loader2 size={12} className="animate-spin" /> : '测试连接'}
                                  </button>
                                  <button
                                    onClick={() => handleRemove(provider.id)}
                                    className="cursor-pointer rounded-md border border-red-500/30 px-3 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
                                  >
                                    移除
                                  </button>
                                </>
                              )}
                              {!configured && !isEditing && (
                                <button
                                  onClick={() => { setEditingId(provider.id); setApiKeyInput(''); setBaseUrlInput(provider.baseUrl) }}
                                  className="cursor-pointer rounded-md bg-indigo-500/10 border border-indigo-500/40 px-3 py-1 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-500/20"
                                >
                                  配置
                                </button>
                              )}
                              {configured && !isEditing && (
                                <button
                                  onClick={() => { setEditingId(provider.id); setApiKeyInput(''); setBaseUrlInput(provider.baseUrl) }}
                                  className="cursor-pointer rounded-md bg-indigo-500/10 border border-indigo-500/40 px-3 py-1 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-500/20"
                                >
                                  编辑
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Test result banner */}
                          {testResult?.id === provider.id && (
                            <div className={`mx-4 mb-2 rounded-lg px-3 py-2 text-[11px] ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {testResult.ok ? '连接测试成功' : `连接失败: ${testResult.error}`}
                            </div>
                          )}

                          {/* Editing form */}
                          {isEditing && (
                            <div className="border-t border-[#464951] px-4 py-3 space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="w-14 text-[12px] text-[#7d818a]">API Key</span>
                                <input
                                  type="password"
                                  value={apiKeyInput}
                                  onChange={e => setApiKeyInput(e.target.value)}
                                  placeholder={`输入 ${provider.name} API Key`}
                                  className="flex-1 rounded-md border border-[#464951] bg-[#2b2d33] px-3 py-1.5 text-[12px] text-[#bcbec4] placeholder-[#7d818a] outline-none focus:border-indigo-500"
                                  autoFocus
                                />
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="w-14 text-[12px] text-[#7d818a]">Base URL</span>
                                <input
                                  type="text"
                                  value={baseUrlInput}
                                  onChange={e => setBaseUrlInput(e.target.value)}
                                  className="flex-1 rounded-md border border-[#464951] bg-[#2b2d33] px-3 py-1.5 text-[12px] text-[#bcbec4] placeholder-[#7d818a] outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveApiKey(provider.id)}
                                  disabled={!apiKeyInput.trim()}
                                  className="cursor-pointer rounded-md bg-indigo-500 px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => handleTest(provider.id)}
                                  disabled={!apiKeyInput.trim() || testing === provider.id}
                                  className="cursor-pointer rounded-md border border-[#464951] px-4 py-1.5 text-[12px] text-[#bcbec4] transition-colors hover:bg-[#464951] disabled:opacity-40"
                                >
                                  {testing === provider.id ? '测试中...' : '测试连接'}
                                </button>
                                <button
                                  onClick={() => { setEditingId(null); setApiKeyInput(''); setTestResult(null) }}
                                  className="cursor-pointer rounded-md border border-[#464951] px-4 py-1.5 text-[12px] text-[#bcbec4] transition-colors hover:bg-[#464951]"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Configured info */}
                          {configured && !isEditing && (
                            <div className="border-t border-[#464951] px-4 py-3 space-y-2">
                              {status?.maskedKey && (
                                <div className="flex items-center gap-3">
                                  <span className="w-14 text-[12px] text-[#7d818a]">API Key</span>
                                  <span className="font-mono text-[12px] text-[#8c8f96]">{status.maskedKey}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                <span className="w-14 text-[12px] text-[#7d818a]">默认模型</span>
                                <select
                                  value={status?.defaultModel || provider.models[0]?.id}
                                  onChange={e => handleModelChange(provider.id, e.target.value)}
                                  className="cursor-pointer rounded-md border border-[#464951] bg-[#2b2d33] px-3 py-1 text-[12px] text-[#bcbec4] outline-none focus:border-indigo-500"
                                >
                                  {provider.models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Add custom provider */}
                    <button className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#464951] px-4 py-4 text-[13px] text-[#7d818a] transition-colors hover:border-indigo-500/40 hover:text-indigo-400">
                      <Plus size={14} />
                      添加自定义 OpenAI 兼容供应商
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeNav === 'about' && (
            <div className="mx-auto max-w-[720px] space-y-4">
              <h1 className="text-lg font-semibold text-[#bcbec4]">关于</h1>
              <div className="rounded-xl border border-[#464951] bg-[#383b42] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#bcbec4]">AI Skill Forge</p>
                    <p className="text-xs text-[#7d818a]">自进化 AI 任务助手</p>
                  </div>
                  <div className="text-xs text-[#7d818a]">{navigator.platform}</div>
                </div>
              </div>
            </div>
          )}

          {(activeNav === 'notify' || activeNav === 'general') && (
            <div className="mx-auto max-w-[720px]">
              <h1 className="text-lg font-semibold text-[#bcbec4]">{navItems.find(n => n.id === activeNav)?.label}</h1>
              <p className="mt-4 text-[13px] text-[#7d818a]">即将推出...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
