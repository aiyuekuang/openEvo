import { useState, useEffect, useRef } from 'react'
import { X, Loader, Square } from 'lucide-react'
import clsx from 'clsx'
import type { Task, TaskStep } from '../types/task'
import { StepTree } from './steps/StepTree'
import { StepChatPanel } from './steps/StepChatPanel'

interface Props {
  task: Task
  expanded: boolean
  onToggle: () => void
  onCancel: (id: string) => void
  onSendStepMessage?: (stepId: string, message: string) => void
}

const statusColors = {
  pending: 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]',
  running: 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)] animate-pulse',
  done: 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]',
  error: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]',
}

const statusLabels = {
  pending: '等待中',
  running: '运行中',
  done: '已完成',
  error: '失败',
}

export function TaskCard({ task, expanded, onToggle, onCancel, onSendStepMessage }: Props) {
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined)
  // 用户是否手动点击过步骤（手动选择后停止自动跟随）
  const userManualSelect = useRef(false)
  const reply = task.conversation.find(m => m.role === 'assistant')?.content

  // ═══ 自动跟随：任务运行时自动选中最新执行的步骤 ═══
  useEffect(() => {
    if (task.status !== 'running' || userManualSelect.current) return
    const latest = findLatestActiveStep(task.steps)
    if (latest && latest.id !== selectedStepId) {
      setSelectedStepId(latest.id)
    }
  }, [task.steps, task.status])

  // 任务完成或新任务开始时重置手动选择标记
  useEffect(() => {
    if (task.status !== 'running') {
      userManualSelect.current = false
    }
  }, [task.status])

  const handleSelectStep = (stepId: string | undefined) => {
    userManualSelect.current = true
    setSelectedStepId(stepId)
  }

  // 查找选中的步骤
  const selectedStep = selectedStepId ? findStepById(task.steps, selectedStepId) : null

  // --- Compact card ---
  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className={clsx(
          'task-card-enter relative w-48 shrink-0 cursor-pointer rounded-xl border p-3 text-left transition-all',
          'bg-[#383b42] hover:bg-[#3e4148] border-[#464951] hover:border-[#5d6069]',
        )}
      >
        {/* Status dot */}
        <div className={clsx('absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full', statusColors[task.status])} />

        <h3 className="pr-6 text-sm font-medium text-[#bcbec4] truncate">
          {task.title}
        </h3>
        <p className="mt-1 text-xs text-[#7d818a] line-clamp-2">
          {task.message}
        </p>

        {/* Image thumbnails */}
        {task.images.length > 0 && (
          <div className="mt-2 flex gap-1">
            {task.images.slice(0, 3).map((src, i) => (
              <div key={i} className="h-6 w-6 overflow-hidden rounded border border-[#464951]">
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            {task.images.length > 3 && (
              <span className="text-[10px] text-[#7d818a] self-center">+{task.images.length - 3}</span>
            )}
          </div>
        )}
      </button>
    )
  }

  // --- Expanded card (fills row) ---
  return (
    <div className="task-card-enter w-full rounded-xl border border-indigo-500/40 bg-[#383b42] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#464951] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className={clsx('h-2.5 w-2.5 rounded-full', statusColors[task.status])} />
          <h3
            className="text-sm font-medium text-[#bcbec4] cursor-pointer hover:text-white transition-colors"
            onClick={() => handleSelectStep(undefined)}
            title="查看最终输出"
          >
            {task.title}
          </h3>
          <span className="text-xs text-[#7d818a]">{statusLabels[task.status]}</span>
        </div>
        <div className="flex items-center gap-2">
          {task.status === 'running' && (
            <button
              onClick={() => onCancel(task.id)}
              className="cursor-pointer rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Square size={12} className="inline mr-1" />取消
            </button>
          )}
          <button
            onClick={onToggle}
            className="cursor-pointer rounded p-1 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      {task.steps && task.steps.length > 0 ? (
        // 新版：步骤可视化视图
        <div className="flex h-80">
          {/* 左侧：步骤树 */}
          <div className="flex-1 border-r border-[#464951] flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-[#464951] shrink-0">
              <span className="text-xs font-semibold text-[#e0e1e6]">执行步骤</span>
            </div>
            <div className="flex-1 overflow-y-auto terminal-scroll">
              <StepTree
                steps={task.steps}
                selectedStepId={selectedStepId}
                onSelectStep={handleSelectStep}
              />
            </div>
          </div>

          {/* 右侧：对话面板 */}
          <StepChatPanel
            task={task}
            selectedStep={selectedStep}
            onSendMessage={onSendStepMessage}
          />
        </div>
      ) : (
        // 旧版：简单对话视图（兼容旧任务）
        <div className="max-h-64 overflow-y-auto terminal-scroll p-4">
          {/* User message */}
          <p className="text-xs text-[#7d818a] mb-2">{task.message}</p>

          {/* Attached images */}
          {task.images.length > 0 && (
            <div className="mb-3 flex gap-2 flex-wrap">
              {task.images.map((src, i) => (
                <div key={i} className="h-20 w-20 overflow-hidden rounded-lg border border-[#464951]">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* AI Reply */}
          {reply && (
            <div className="rounded-lg bg-[#2b2d33] p-3 text-sm text-[#bcbec4] whitespace-pre-wrap">
              {reply}
            </div>
          )}

          {/* Loading indicator */}
          {task.status === 'running' && !reply && (
            <div className="flex items-center gap-2 text-xs text-[#7d818a]">
              <Loader size={12} className="animate-spin" />
              <span>处理中...</span>
            </div>
          )}

          {/* Error */}
          {task.error && (
            <div className="mt-2 rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-xs text-red-400">
              {task.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 递归查找步骤
 */
function findStepById(steps: TaskStep[], stepId: string): TaskStep | null {
  for (const step of steps) {
    if (step.id === stepId) {
      return step
    }
    if (step.children) {
      const found = findStepById(step.children, stepId)
      if (found) return found
    }
  }
  return null
}

/**
 * 找到最新的活跃步骤（正在运行的，或最后一个完成的）
 * 优先返回 running 状态的步骤，否则返回最后一个 done 步骤
 */
function findLatestActiveStep(steps: TaskStep[]): TaskStep | null {
  let lastDone: TaskStep | null = null

  for (const step of steps) {
    if (step.status === 'running') return step
    if (step.status === 'done') lastDone = step

    // 递归检查子步骤
    if (step.children?.length) {
      const childActive = findLatestActiveStep(step.children)
      if (childActive?.status === 'running') return childActive
      if (childActive?.status === 'done') lastDone = childActive
    }
  }

  return lastDone
}
