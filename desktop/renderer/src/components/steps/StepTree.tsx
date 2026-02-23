/**
 * 步骤树组件
 *
 * 渲染任务的所有步骤（根级），支持递归嵌套
 */

import type { TaskStep } from '../../types/task'
import { StepNode } from './StepNode'

interface StepTreeProps {
  steps: TaskStep[]
  selectedStepId?: string
  onSelectStep: (stepId: string | undefined) => void
}

export function StepTree({ steps, selectedStepId, onSelectStep }: StepTreeProps) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#7d818a] text-xs">
        <span>暂无步骤</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {steps.map((step) => (
        <StepNode
          key={step.id}
          step={step}
          depth={0}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
        />
      ))}
    </div>
  )
}
