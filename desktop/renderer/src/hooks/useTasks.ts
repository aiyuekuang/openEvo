import { useState, useCallback, useEffect } from 'react'
import type { Task, ChatMessage } from '../types/task'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
    } catch (err) {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'error' as const, error: String(err) } : t
      ))
    }
  }, [])

  const cancelTask = useCallback(async (taskId: string) => {
    await window.api.cancelTask(taskId)
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'error' as const, error: '已取消' } : t
    ))
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
