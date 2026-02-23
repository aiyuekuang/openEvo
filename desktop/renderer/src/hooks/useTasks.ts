import { useState, useCallback, useEffect, useRef } from 'react'
import type { Task, TaskStep, ChatMessage } from '../types/task'

/**
 * 每个任务的步骤构建器状态
 * 用栈追踪嵌套的 skill 调用，按 depth 构建树
 */
interface StepBuilder {
  // 按 depth 索引当前活跃的 step ID（用于嵌套定位）
  activeByDepth: Map<number, string>
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // 步骤构建器（不参与渲染，用 ref 避免闭包问题）
  const builders = useRef(new Map<string, StepBuilder>())

  // ═══ 启动时加载已保存的任务 ═══
  useEffect(() => {
    if (loaded) return
    window.api.loadAllTasks().then((saved) => {
      if (saved && saved.length > 0) {
        const restored: Task[] = saved.map(t => ({
          id: t.id,
          sessionId: t.sessionId || t.id,
          title: t.title,
          message: t.message,
          status: t.status,
          createdAt: t.createdAt,
          conversation: (t.conversation || []).map(c => ({
            role: c.role as ChatMessage['role'],
            content: c.content,
            timestamp: c.timestamp,
          })),
          images: t.images || [],
          steps: t.steps || [],
          error: t.error,
        }))
        setTasks(restored)
      }
      setLoaded(true)
    }).catch(() => {
      setLoaded(true)
    })
  }, [loaded])

  // 监听流式输出事件
  useEffect(() => {
    const unsubscribe = window.api.onTaskStream((event) => {
      const { taskId, type, fullResponse, error } = event

      if (type === 'token' && fullResponse) {
        setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t
          const userMsg = t.conversation.find(msg => msg.role === 'user')
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
          }
          return {
            ...t,
            conversation: userMsg ? [userMsg, assistantMsg] : [assistantMsg],
          }
        }))

      } else if (type === 'error' && error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'error' as const, error } : t
        ))

      } else if (type === 'memory-saved') {
        console.log(`[Memory] 已保存 ${event.entries?.length ?? 0} 条记忆:`, event.entries)

      } else if (type === 'tool_call' && event.toolCall) {
        // ═══ Skill 调用开始 → 创建步骤节点 ═══
        const depth = event.depth ?? 1
        const callId = event.toolCall.id
        const skillName = event.skillName || event.toolCall.name

        // 初始化构建器
        if (!builders.current.has(taskId)) {
          builders.current.set(taskId, { activeByDepth: new Map() })
        }
        const builder = builders.current.get(taskId)!

        const newStep: TaskStep = {
          id: callId,
          name: skillName,
          status: 'running',
          output: [],
          isSkill: true,
          skillName,
          children: [],
          conversation: [
            {
              role: 'user',
              content: formatSkillInput(skillName, event.toolCall.arguments),
              timestamp: Date.now(),
            },
          ],
        }

        // 记录当前 depth 的活跃 step
        builder.activeByDepth.set(depth, callId)

        setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t
          const steps = insertStepAtDepth(t.steps, newStep, depth, builder)
          return { ...t, steps }
        }))

      } else if (type === 'tool_result' && event.toolResult) {
        // ═══ Skill 执行完成 → 更新步骤状态 ═══
        const callId = event.toolResult.toolCallId
        const duration = event.duration
        const isError = event.toolResult.isError

        setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t
          const steps = updateStepInTree(t.steps, callId, (step) => ({
            ...step,
            status: isError ? 'error' as const : 'done' as const,
            duration: typeof duration === 'number' ? duration : undefined,
            conversation: [
              ...step.conversation,
              {
                role: 'assistant' as const,
                content: formatSkillOutput(event.toolResult!.content, isError),
                timestamp: Date.now(),
              },
            ],
          }))
          return { ...t, steps }
        }))
      }
    })

    return () => { unsubscribe() }
  }, [])

  const createTask = useCallback(async (title: string, message: string, images: string[], providerId?: string, model?: string) => {
    const taskId = crypto.randomUUID()

    const task: Task = {
      id: taskId,
      sessionId: '',
      title: title || message.slice(0, 30),
      message,
      status: 'running',
      createdAt: Date.now(),
      conversation: [
        { role: 'user', content: message, timestamp: Date.now() },
      ],
      images,
      steps: [],
    }

    setTasks(prev => [task, ...prev])
    setExpandedId(taskId)

    try {
      const result = await window.api.createTask(taskId, message, providerId, model)

      if (result.error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'error' as const, error: result.error } : t
        ))
        return
      }

      // 任务完成 - 更新状态为 done，保留流式更新的 conversation
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t

        const finalConversation: ChatMessage[] = t.conversation.length > 1
          ? t.conversation
          : result.reply
            ? [
                { role: 'user', content: message, timestamp: Date.now() },
                { role: 'assistant', content: result.reply, timestamp: Date.now() },
              ]
            : t.conversation

        return {
          ...t,
          status: 'done' as const,
          conversation: finalConversation,
        }
      }))

      // 清理构建器
      builders.current.delete(taskId)
    } catch (err) {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'error' as const, error: String(err) } : t
      ))
      builders.current.delete(taskId)
    }
  }, [])

  const cancelTask = useCallback(async (taskId: string) => {
    await window.api.cancelTask(taskId)
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'error' as const, error: '已取消' } : t
    ))
    builders.current.delete(taskId)
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  return {
    tasks,
    expandedId,
    toggleExpand,
    createTask,
    cancelTask,
  }
}

// ═══ 辅助函数 ═══

/**
 * 将新步骤插入到正确的深度位置（immutable）
 *
 * depth 1 → 根级（task.steps[]）
 * depth 2 → 上一个 depth-1 步骤的 children
 * depth N → 上一个 depth-(N-1) 步骤的 children
 */
function insertStepAtDepth(
  steps: TaskStep[],
  newStep: TaskStep,
  depth: number,
  builder: StepBuilder,
): TaskStep[] {
  if (depth <= 1) {
    return [...steps, newStep]
  }

  // 找到 depth-1 的父步骤
  const parentId = builder.activeByDepth.get(depth - 1)
  if (!parentId) {
    return [...steps, newStep]
  }

  // immutable 插入子步骤
  const result = insertIntoParent(steps, parentId, newStep)
  return result.changed ? result.steps : [...steps, newStep]
}

/**
 * 在步骤树中找到 parentId 并将 newStep 添加为其子步骤（immutable）
 */
function insertIntoParent(
  steps: TaskStep[],
  parentId: string,
  newStep: TaskStep,
): { steps: TaskStep[]; changed: boolean } {
  let changed = false
  const newSteps = steps.map(step => {
    if (step.id === parentId) {
      changed = true
      return {
        ...step,
        children: [...(step.children || []), newStep],
      }
    }
    if (step.children && step.children.length > 0) {
      const childResult = insertIntoParent(step.children, parentId, newStep)
      if (childResult.changed) {
        changed = true
        return { ...step, children: childResult.steps }
      }
    }
    return step
  })
  return { steps: newSteps, changed }
}

/**
 * 递归更新步骤树中指定 ID 的步骤
 */
function updateStepInTree(
  steps: TaskStep[],
  stepId: string,
  updater: (step: TaskStep) => TaskStep,
): TaskStep[] {
  return steps.map(step => {
    if (step.id === stepId) {
      return updater(step)
    }
    if (step.children && step.children.length > 0) {
      return {
        ...step,
        children: updateStepInTree(step.children, stepId, updater),
      }
    }
    return step
  })
}

/**
 * 格式化 Skill 输入参数为可读文本
 */
function formatSkillInput(skillName: string, args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return `调用 ${skillName}()`

  const params = entries
    .map(([k, v]) => {
      const val = typeof v === 'string'
        ? (v.length > 100 ? v.slice(0, 100) + '...' : v)
        : JSON.stringify(v)
      return `  ${k}: ${val}`
    })
    .join('\n')

  return `调用 ${skillName}:\n${params}`
}

/**
 * 格式化 Skill 输出结果
 */
function formatSkillOutput(content: string, isError?: boolean): string {
  if (isError) return `错误: ${content}`

  try {
    const parsed = JSON.parse(content)
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2)
    }
    return content
  } catch {
    return content
  }
}
