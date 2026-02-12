import { useEffect, useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import { TaskGrid } from '../components/TaskGrid'
import { TaskInput } from '../components/TaskInput'
import { Settings, Terminal } from 'lucide-react'

interface Props {
  onOpenSettings: () => void
}

export function Main({ onOpenSettings }: Props) {
  const { tasks, expandedId, toggleExpand, createTask, cancelTask } = useTasks()

  return (
    <div className="flex h-screen flex-col bg-[#2b2d33]">
      {/* Titlebar */}
      <div className="drag-region flex h-12 shrink-0 items-center border-b border-[#464951] px-4">
        <div className="ml-20 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-indigo-400"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-medium text-[#bcbec4]">AI Skill Forge</span>

          {/* 模式标识 - CLI 模式 */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#464951] px-2 py-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
            <Terminal size={10} className="text-[#7d818a]" />
            <span className="text-[10px] text-[#7d818a]">CLI</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {tasks.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#7d818a]">
              <span>{tasks.filter((t) => t.status === 'running').length} 运行中</span>
              <span className="text-[#464951]">/</span>
              <span>{tasks.length} 总计</span>
            </div>
          )}
          <button
            onClick={onOpenSettings}
            className="no-drag cursor-pointer rounded-md p-1.5 text-[#7d818a] transition-colors hover:bg-[#464951] hover:text-[#bcbec4]"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Task cards */}
      <div className="flex-1 overflow-y-auto terminal-scroll">
        <TaskGrid
          tasks={tasks}
          expandedId={expandedId}
          onToggle={toggleExpand}
          onCancel={cancelTask}
        />
      </div>

      {/* Bottom input */}
      <TaskInput onSubmit={createTask} />
    </div>
  )
}
