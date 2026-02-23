import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, ImagePlus, X, ChevronDown } from 'lucide-react'

interface ModelOption {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
}

interface Props {
  onSubmit: (title: string, message: string, images: string[], providerId?: string, model?: string) => void
}

export function TaskInput({ onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Load configured providers and active model
  useEffect(() => {
    async function load() {
      try {
        const [providerData, statusData, active] = await Promise.all([
          window.api.provider.list(),
          window.api.provider.statuses(),
          window.api.provider.getActive(),
        ])
        const configuredIds = new Set(statusData.filter(s => s.configured).map(s => s.providerId))
        const allProviders = [...providerData.presets, ...providerData.custom]

        const options: ModelOption[] = []
        for (const p of allProviders) {
          if (!configuredIds.has(p.id)) continue
          for (const m of p.models) {
            options.push({
              providerId: p.id,
              providerName: p.name,
              modelId: m.id,
              modelName: m.name,
            })
          }
        }
        setModelOptions(options)

        // Set active model
        let picked: ModelOption | null = null
        if (active) {
          const match = options.find(o => o.providerId === active.providerId && o.modelId === active.model)
          picked = match || options[0] || null
        } else if (options.length > 0) {
          picked = options[0]
        }
        if (picked) {
          setSelectedModel(picked)
        }
      } catch (err) {
        console.error('Failed to load model options:', err)
      }
    }
    load()
  }, [])

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    if (showModelPicker) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelPicker])

  const handleSubmit = useCallback(() => {
    const msg = message.trim()
    if (!msg) return
    onSubmit(title.trim(), msg, images, selectedModel?.providerId, selectedModel?.modelId)
    setTitle('')
    setMessage('')
    setImages([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [title, message, images, selectedModel, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const urls: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      urls.push(await readFileAsDataURL(file))
    }
    setImages(prev => [...prev, ...urls])
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue
      const url = await readFileAsDataURL(file)
      setImages(prev => [...prev, url])
    }
  }, [])

  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }, [])

  function handleSelectModel(option: ModelOption) {
    setSelectedModel(option)
    setShowModelPicker(false)
    // Also set as active provider
    window.api.provider.setActive(option.providerId, option.modelId)
  }

  // Group options by provider
  const groupedOptions = modelOptions.reduce<Record<string, ModelOption[]>>((acc, opt) => {
    if (!acc[opt.providerName]) acc[opt.providerName] = []
    acc[opt.providerName].push(opt)
    return acc
  }, {})

  return (
    <div className="shrink-0 border-t border-[#464951] bg-[#383b42] px-4 py-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <div key={i} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#464951]">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Model selector row */}
      <div className="mb-2 flex items-center gap-2" ref={pickerRef}>
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#464951] bg-[#2b2d33] px-2.5 py-1 text-[11px] text-[#bcbec4] transition-colors hover:border-indigo-500/50"
          >
            {selectedModel ? (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="max-w-[200px] truncate">{selectedModel.modelName}</span>
              </>
            ) : (
              <span className="text-[#7d818a]">选择模型</span>
            )}
            <ChevronDown size={12} className="text-[#7d818a]" />
          </button>

          {/* Dropdown */}
          {showModelPicker && (
            <div className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-[#464951] bg-[#2b2d33] py-1 shadow-xl">
              {Object.entries(groupedOptions).map(([providerName, options]) => (
                <div key={providerName}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-[#7d818a]">
                    {providerName}
                  </div>
                  {options.map(opt => {
                    const isActive = selectedModel?.providerId === opt.providerId && selectedModel?.modelId === opt.modelId
                    return (
                      <button
                        key={`${opt.providerId}-${opt.modelId}`}
                        onClick={() => handleSelectModel(opt)}
                        className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                          isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-[#bcbec4] hover:bg-[#383b42]'
                        }`}
                      >
                        <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-indigo-400' : 'bg-transparent'}`} />
                        {opt.modelName}
                      </button>
                    )
                  })}
                </div>
              ))}
              {modelOptions.length === 0 && (
                <div className="px-3 py-3 text-center text-[11px] text-[#7d818a]">
                  尚未配置任何供应商，请前往设置配置
                </div>
              )}
            </div>
          )}
        </div>
        {selectedModel && (
          <span className="text-[10px] text-[#7d818a]">{selectedModel.providerName}</span>
        )}
      </div>

      <div className="flex items-end gap-3">
        <input
          type="text"
          placeholder="标题（可选）"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-28 shrink-0 rounded-lg border border-[#464951] bg-[#2b2d33] px-3 py-2 text-sm text-[#bcbec4] placeholder-[#7d818a] outline-none transition-colors focus:border-indigo-500"
        />
        <textarea
          ref={textareaRef}
          placeholder="描述你的任务..."
          value={message}
          onChange={e => { setMessage(e.target.value); handleTextareaInput() }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          className="min-h-[38px] flex-1 resize-none rounded-lg border border-[#464951] bg-[#2b2d33] px-3 py-2 text-sm text-[#bcbec4] placeholder-[#7d818a] outline-none transition-colors focus:border-indigo-500"
        />

        {/* Image upload */}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#464951] text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
        >
          <ImagePlus size={16} />
        </button>

        <button
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-lg bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
