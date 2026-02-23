/**
 * 步骤节点组件
 *
 * 递归渲染单个步骤及其子步骤
 * 选中时展示 skill 摘要，点击"查看详情"弹窗展示完整输入/输出
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Circle, CheckCircle2, ArrowRight, ArrowLeft, X, Maximize2 } from 'lucide-react'
import clsx from 'clsx'
import type { TaskStep } from '../../types/task'

interface StepNodeProps {
  step: TaskStep
  depth?: number
  selectedStepId?: string
  onSelectStep: (stepId: string | undefined) => void
}

export function StepNode({ step, depth = 0, selectedStepId, onSelectStep }: StepNodeProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const hasChildren = step.children && step.children.length > 0
  const isSelected = selectedStepId === step.id

  // 从 conversation 提取输入和输出
  const inputMsg = step.conversation.find(m => m.role === 'user')
  const outputMsg = step.conversation.find(m => m.role === 'assistant')

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectStep(isSelected ? undefined : step.id)
  }

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsed(!collapsed)
  }

  const handleOpenDetail = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDetail(true)
  }

  return (
    <>
      {/* 当前步骤节点 */}
      <div
        className={clsx(
          'flex items-center gap-2 py-1.5 cursor-pointer transition-colors',
          'hover:bg-[#383b42]',
          isSelected && 'bg-[#818cf808]'
        )}
        style={{ paddingLeft: `${14 + depth * 26}px`, paddingRight: '14px' }}
        onClick={handleClick}
      >
        {/* 折叠箭头 */}
        {hasChildren ? (
          <ChevronDown
            size={12}
            className={clsx(
              'flex-shrink-0 transition-transform text-[#7d818a]',
              collapsed && '-rotate-90'
            )}
            onClick={handleToggleCollapse}
          />
        ) : (
          <div className="w-3" />
        )}

        {/* 状态图标 */}
        <StatusIcon status={step.status} isSkill={step.isSkill} />

        {/* 步骤名称 */}
        <span
          className={clsx(
            'text-xs font-medium flex-shrink truncate',
            step.status === 'done' && 'text-green-400',
            step.status === 'running' && 'text-indigo-400',
            step.status === 'pending' && 'text-[#7d818a]',
            step.status === 'error' && 'text-red-400'
          )}
        >
          {step.name}
        </span>

        {/* skill 标签 */}
        {step.isSkill && (
          <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] rounded bg-[#818cf815] text-[#818cf880] font-medium">
            skill
          </span>
        )}

        {/* 弹性间隔 */}
        <div className="flex-1 min-w-0" />

        {/* 状态标签 */}
        {step.status === 'running' && (
          <span className="flex-shrink-0 text-[10px] text-indigo-400">运行中...</span>
        )}

        {/* 时长 */}
        {typeof step.duration === 'number' && (
          <span className="flex-shrink-0 text-[10px] text-[#7d818a]">
            {formatDuration(step.duration)}
          </span>
        )}
      </div>

      {/* ═══ 选中时展示摘要 + 查看详情按钮 ═══ */}
      {isSelected && step.isSkill && (inputMsg || outputMsg) && (
        <div
          className="border-l-2 border-indigo-500/30 bg-[#2b2d33]/50 mx-2 mb-1 rounded-r"
          style={{ marginLeft: `${14 + depth * 26 + 12}px` }}
        >
          {/* 摘要：输入首行 + 输出首行 */}
          <div className="px-3 py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {inputMsg && (
                <div className="flex items-center gap-1.5">
                  <ArrowRight size={9} className="flex-shrink-0 text-indigo-400" />
                  <span className="text-[10px] text-[#7d818a] truncate">
                    {summarize(extractParams(inputMsg.content))}
                  </span>
                </div>
              )}
              {outputMsg && (
                <div className="flex items-center gap-1.5">
                  <ArrowLeft size={9} className="flex-shrink-0 text-green-400" />
                  <span className="text-[10px] text-[#7d818a] truncate">
                    {summarize(outputMsg.content)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleOpenDetail}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
              title="查看完整输入/输出"
            >
              <Maximize2 size={10} />
              详情
            </button>
          </div>
        </div>
      )}

      {/* ═══ 详情弹窗（Portal 到 body，避免被父容器 overflow 裁剪） ═══ */}
      {showDetail && createPortal(
        <StepDetailModal
          step={step}
          inputContent={inputMsg ? extractParams(inputMsg.content) : undefined}
          outputContent={outputMsg?.content}
          onClose={() => setShowDetail(false)}
        />,
        document.body,
      )}

      {/* 递归渲染子步骤 */}
      {hasChildren && !collapsed && (
        <>
          {step.children!.map((child) => (
            <StepNode
              key={child.id}
              step={child}
              depth={depth + 1}
              selectedStepId={selectedStepId}
              onSelectStep={onSelectStep}
            />
          ))}
        </>
      )}
    </>
  )
}

/**
 * Skill 详情弹窗 — 完整展示输入/输出
 */
function StepDetailModal({
  step,
  inputContent,
  outputContent,
  onClose,
}: {
  step: TaskStep
  inputContent?: string
  outputContent?: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-[680px] max-w-[90vw] max-h-[80vh] rounded-xl border border-[#464951] bg-[#2b2d33] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#464951] shrink-0">
          <div className="flex items-center gap-2.5">
            <StatusIcon status={step.status} isSkill={step.isSkill} />
            <span className="text-sm font-medium text-[#bcbec4]">{step.name}</span>
            {step.isSkill && (
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-[#818cf815] text-[#818cf880] font-medium">
                skill
              </span>
            )}
            {typeof step.duration === 'number' && (
              <span className="text-[11px] text-[#7d818a]">{formatDuration(step.duration)}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-[#7d818a] hover:bg-[#464951] hover:text-[#bcbec4] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto terminal-scroll p-5 space-y-4">
          {/* 输入 */}
          {inputContent && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowRight size={12} className="text-indigo-400" />
                <span className="text-[11px] font-semibold text-indigo-400 uppercase">输入</span>
              </div>
              <pre className="rounded-lg bg-[#383b42] border border-[#464951] px-4 py-3 text-[11px] text-[#bcbec4] leading-relaxed whitespace-pre-wrap break-all">
                {inputContent}
              </pre>
            </div>
          )}

          {/* 输出 */}
          {outputContent && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowLeft size={12} className="text-green-400" />
                <span className="text-[11px] font-semibold text-green-400 uppercase">输出</span>
              </div>
              <pre className="rounded-lg bg-[#383b42] border border-[#464951] px-4 py-3 text-[11px] text-[#bcbec4] leading-relaxed whitespace-pre-wrap break-all">
                {outputContent}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 状态图标组件
 */
function StatusIcon({ status, isSkill }: { status: TaskStep['status']; isSkill?: boolean }) {
  if (status === 'done') {
    return <CheckCircle2 size={14} className="flex-shrink-0 text-green-400" />
  }

  if (status === 'running') {
    if (isSkill) {
      return (
        <div className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-indigo-400 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      )
    } else {
      return (
        <div className="flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 border-indigo-400" />
      )
    }
  }

  if (status === 'error') {
    return (
      <div className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-red-400 flex items-center justify-center">
        <span className="text-white text-[10px] font-bold">×</span>
      </div>
    )
  }

  return <Circle size={14} className="flex-shrink-0 text-[#7d818a]" />
}

/**
 * 格式化时长（毫秒输入）
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return ms > 0 ? `${ms}ms` : '< 1ms'
  }
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) {
    return `${minutes}m`
  }
  return `${minutes}m ${remainingSeconds}s`
}

/**
 * 从 "调用 xxx:\n  key: value" 格式中提取参数部分
 */
function extractParams(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= 1) return content
  return lines.slice(1).map(l => l.trimStart()).join('\n')
}

/**
 * 生成单行摘要（取首行，截断到 80 字符）
 */
function summarize(content: string, maxLen = 80): string {
  const firstLine = content.split('\n')[0].trim()
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen) + '...'
}
