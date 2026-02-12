/**
 * 步骤对话面板组件
 *
 * 显示选中步骤的对话历史，支持在步骤上下文中继续对话
 */

import { useState } from 'react'
import { Send, Info } from 'lucide-react'
import clsx from 'clsx'
import type { Task, TaskStep } from '../../types/task'

interface StepChatPanelProps {
  task: Task
  selectedStep: TaskStep | null
  onSendMessage?: (stepId: string, message: string) => void
}

export function StepChatPanel({ task, selectedStep, onSendMessage }: StepChatPanelProps) {
  const [input, setInput] = useState('')

  // 如果没有选中步骤，显示任务级别的完整对话
  if (!selectedStep) {
    return (
      <div className="flex flex-col w-80 bg-[#383b42] border-l border-[#464951]">
        {/* 头部 */}
        <div className="px-3 py-2 border-b border-[#464951]">
          <div className="text-xs font-semibold text-[#e0e1e6]">完整对话</div>
          <div className="text-[9px] text-[#7d818a] mt-0.5">任务的整体对话记录</div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {task.conversation.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-[#7d818a] opacity-50">暂无对话记录</span>
            </div>
          ) : (
            task.conversation.map((msg, i) => (
              <div key={i} className="flex flex-col gap-1">
                {/* 消息头部 */}
                <div className="text-[9px] text-[#7d818a]">
                  {msg.role === 'user' ? '你' : 'AI'} · {formatTimestamp(msg.timestamp)}
                </div>

                {/* 消息内容 */}
                <div
                  className={clsx(
                    'px-2.5 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-[#818cf810] border border-[#818cf830] text-[#e0e1e6]'
                      : 'bg-[#464951] text-[#e0e1e6]'
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="mx-3 mb-3 px-2 py-1.5 rounded flex items-center gap-2 text-[10px] bg-[#60a5fa08] border border-[#60a5fa30] text-[#60a5fa]">
          <Info size={12} className="flex-shrink-0" />
          <span className="flex-1">点击左侧步骤查看单个步骤的详细对话</span>
        </div>
      </div>
    )
  }

  const handleSend = () => {
    if (!input.trim() || !onSendMessage) return
    onSendMessage(selectedStep.id, input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col w-80 bg-[#383b42] border-l border-[#464951]">
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-[#464951]">
        <div className="text-xs font-semibold text-[#e0e1e6] truncate">
          对话 · {selectedStep.name}
        </div>
        <div className="text-[9px] text-[#7d818a] mt-0.5">点击左侧步骤切换对话上下文</div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {selectedStep.conversation.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-[#7d818a] opacity-50">
              {selectedStep.status === 'pending' ? '此步骤尚未开始执行' : '暂无对话记录'}
            </span>
          </div>
        ) : (
          selectedStep.conversation.map((msg, i) => (
            <div key={i} className="flex flex-col gap-1">
              {/* 消息头部 */}
              <div className="text-[9px] text-[#7d818a]">
                {msg.role === 'user' ? '你' : 'AI'} · {formatTimestamp(msg.timestamp)}
              </div>

              {/* 消息内容 */}
              <div
                className={clsx(
                  'px-2.5 py-2 rounded-lg text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#818cf810] border border-[#818cf830] text-[#e0e1e6]'
                    : 'bg-[#464951] text-[#e0e1e6]'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 系统提示 */}
      <div
        className={clsx(
          'mx-3 mb-2 px-2 py-1.5 rounded flex items-center gap-2 text-[10px]',
          selectedStep.status === 'running' &&
            'bg-[#818cf808] border border-[#818cf830] text-[#818cf8]',
          selectedStep.status === 'done' &&
            'bg-[#22c55e08] border border-[#22c55e30] text-[#22c55e]',
          selectedStep.status === 'pending' &&
            'bg-[#60a5fa08] border border-[#60a5fa30] text-[#60a5fa]',
          selectedStep.status === 'error' &&
            'bg-[#ef444408] border border-[#ef444430] text-[#ef4444]'
        )}
      >
        <Info size={12} className="flex-shrink-0" />
        <span className="flex-1">
          {selectedStep.status === 'running' && '● 步骤执行中 — 你的消息会实时影响执行流程'}
          {selectedStep.status === 'done' && '✓ 步骤已完成 — 你可以询问详情或请求修改'}
          {selectedStep.status === 'pending' && '○ 步骤待执行 — 你可以提前给出执行指示'}
          {selectedStep.status === 'error' && '× 步骤失败 — 你可以询问错误原因或重试'}
        </span>
      </div>

      {/* 输入框 */}
      <div className="px-3 pb-3 border-t border-[#464951] pt-2">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-[#2b2d33] rounded border border-[#464951]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder(selectedStep.status)}
            className="flex-1 bg-transparent text-xs outline-none text-[#e0e1e6] placeholder:text-[#7d818a]"
            disabled={!onSendMessage}
          />
          <Send
            size={14}
            className={clsx(
              'flex-shrink-0 transition-colors',
              input.trim() && onSendMessage
                ? 'text-[#818cf8] cursor-pointer'
                : 'text-[#7d818a] cursor-not-allowed'
            )}
            onClick={handleSend}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 根据步骤状态获取输入框占位符
 */
function getPlaceholder(status: TaskStep['status']): string {
  switch (status) {
    case 'running':
      return '发送消息影响当前步骤...'
    case 'done':
      return '询问此步骤或请求修改...'
    case 'pending':
      return '提前给出执行指示...'
    case 'error':
      return '询问错误原因或请求重试...'
    default:
      return '输入消息...'
  }
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 1000) {
    return '刚刚'
  }

  if (diff < 60000) {
    return `${Math.floor(diff / 1000)} 秒前`
  }

  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`
  }

  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`
  }

  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
