import type { Task } from '../types/task'
import { TaskCard } from './TaskCard'

interface Props {
  tasks: Task[]
  expandedId: string | null
  onToggle: (id: string) => void
  onCancel: (id: string) => void
  onSendStepMessage?: (taskId: string, stepId: string, message: string) => void
}

export function TaskGrid({ tasks, expandedId, onToggle, onCancel, onSendStepMessage }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="text-sm text-[#7d818a]">在下方输入任务开始</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3 p-4">
      {tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          expanded={task.id === expandedId}
          onToggle={() => onToggle(task.id)}
          onCancel={onCancel}
          onSendStepMessage={onSendStepMessage ? (stepId, message) => onSendStepMessage(task.id, stepId, message) : undefined}
        />
      ))}
    </div>
  )
}
