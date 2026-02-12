import { useState, useRef, useCallback } from 'react'
import { Send, ImagePlus, X } from 'lucide-react'

interface Props {
  onSubmit: (title: string, message: string, images: string[]) => void
}

export function TaskInput({ onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const msg = message.trim()
    if (!msg) return
    onSubmit(title.trim(), msg, images)
    setTitle('')
    setMessage('')
    setImages([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [title, message, images, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // Support pasting screenshots from clipboard
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
