import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { ChatMessage } from '../types/task'

interface Props {
  messages: ChatMessage[]
}

export function ConversationPanel({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="terminal-scroll flex-1 overflow-y-auto px-4 py-3"
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          className={clsx(
            'mb-2',
            msg.role === 'user' ? 'flex justify-end' : '',
          )}
        >
          {msg.role === 'user' ? (
            <div className="max-w-[80%] rounded-lg bg-indigo-500/20 px-3 py-2 text-sm text-[#bcbec4]">
              {msg.content}
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap text-[#bcbec4]">
              <span className="mr-1.5 text-xs text-indigo-400">AI</span>
              {msg.content}
              {/* Streaming cursor */}
              {i === messages.length - 1 && (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-indigo-400 align-text-bottom" />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
