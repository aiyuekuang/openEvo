import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { TaskStep } from '../types/task'

interface Props {
  steps: TaskStep[]
}

export function StepPipeline({ steps }: Props) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {steps.map((step, i) => (
        <div key={step.name} className="flex items-center">
          {/* Step node */}
          <div className="flex items-center gap-1.5">
            <div
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all',
                step.status === 'done' && 'bg-green-500/20 text-green-400',
                step.status === 'active' && 'bg-indigo-500/20 text-indigo-400 animate-pulse',
                step.status === 'pending' && 'bg-[#464951] text-[#7d818a]',
              )}
            >
              {step.status === 'done' ? (
                <Check size={12} />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span
              className={clsx(
                'text-xs',
                step.status === 'done' && 'text-green-400',
                step.status === 'active' && 'text-indigo-400',
                step.status === 'pending' && 'text-[#7d818a]',
              )}
            >
              {step.name}
            </span>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={clsx(
                'mx-2 h-px w-8',
                step.status === 'done' ? 'bg-green-500/40' : 'bg-[#464951]',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
