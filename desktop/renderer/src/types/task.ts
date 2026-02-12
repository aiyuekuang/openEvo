export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface TaskStep {
  id: string
  name: string
  status: StepStatus
  output: string[]

  // 递归支持：skill 嵌套
  isSkill?: boolean
  skillName?: string
  children?: TaskStep[]

  // 对话支持：每个步骤独立的对话历史
  conversation: ChatMessage[]

  // 元数据
  duration?: number       // seconds
  filesChanged?: number
  linesAdded?: number
  linesRemoved?: number
}

export interface Task {
  id: string
  sessionId: string
  title: string
  message: string
  status: 'pending' | 'running' | 'done' | 'error'
  createdAt: number
  conversation: ChatMessage[]
  images: string[] // base64 data URLs attached by user
  steps: TaskStep[]
  currentStepId?: string  // 当前活跃的步骤 ID
  selectedStepId?: string // 用户选中的步骤 ID（UI 状态）
  error?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

// OpenClaw Gateway 事件类型
export type GatewayEvent =
  | { type: 'task_start'; sessionId: string; prompt: string; timestamp: number }
  | {
      type: 'skill_invoke'
      sessionId: string
      stepId: string
      skillName: string
      parentStepId: string | null
      timestamp: number
    }
  | {
      type: 'step_start'
      sessionId: string
      stepId: string
      stepName: string
      parentStepId: string | null
      timestamp: number
    }
  | {
      type: 'step_complete'
      sessionId: string
      stepId: string
      output?: string
      duration?: number
      timestamp: number
    }
  | {
      type: 'step_message'
      sessionId: string
      stepId: string
      role: 'user' | 'assistant'
      content: string
      timestamp: number
    }
  | {
      type: 'task_complete'
      sessionId: string
      timestamp: number
    }
