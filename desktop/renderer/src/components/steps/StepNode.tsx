/**
 * 步骤节点组件
 *
 * 递归渲染单个步骤及其子步骤
 */

import { useState } from 'react'
import { ChevronDown, Circle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import type { TaskStep } from '../../types/task'

interface StepNodeProps {
  step: TaskStep
  depth?: number
  selectedStepId?: string
  onSelectStep: (stepId: string) => void
}

export function StepNode({ step, depth = 0, selectedStepId, onSelectStep }: StepNodeProps) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = step.children && step.children.length > 0
  const isSelected = selectedStepId === step.id

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectStep(step.id)
  }

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsed(!collapsed)
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
          <div className="w-3" /> // 占位符
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
        {step.duration && (
          <span className="flex-shrink-0 text-[10px] text-[#7d818a]">
            {formatDuration(step.duration)}
          </span>
        )}
      </div>

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
 * 状态图标组件
 */
function StatusIcon({ status, isSkill }: { status: TaskStep['status']; isSkill?: boolean }) {
  if (status === 'done') {
    return <CheckCircle2 size={14} className="flex-shrink-0 text-green-400" />
  }

  if (status === 'running') {
    if (isSkill) {
      // skill 运行中：实心圆
      return (
        <div className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-indigo-400 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      )
    } else {
      // 普通步骤运行中：空心圆
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

  // pending
  return <Circle size={14} className="flex-shrink-0 text-[#7d818a]" />
}

/**
 * 格式化时长
 */
function formatDuration(seconds: number): string {
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
