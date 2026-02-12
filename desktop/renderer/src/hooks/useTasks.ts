import { useState, useCallback, useEffect } from 'react'
import type { Task } from '../types/task'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 监听流式输出事件
  useEffect(() => {
    console.log('[useTasks] Setting up task:stream listener')
    const unsubscribe = window.api.onTaskStream((event) => {
      console.log('[useTasks] Received task:stream event:', event.type, event.fullResponse?.substring(0, 50))
      const { taskId, type, content, fullResponse, error } = event

      if (type === 'token' && fullResponse) {
        // 实时更新任务的 conversation
        console.log('[useTasks] Updating conversation for task:', taskId, 'with fullResponse:', fullResponse.substring(0, 100))
        setTasks(prev => {
          const updated = prev.map(t => {
            if (t.id === taskId) {
              const userMsg = t.conversation.find(msg => msg.role === 'user')
              const assistantMsg: Task['conversation'][0] = {
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
              }
              const newConversation = userMsg ? [userMsg, assistantMsg] : [assistantMsg]
              console.log('[useTasks] New conversation:', newConversation)
              return {
                ...t,
                conversation: newConversation,
              }
            }
            return t
          })
          console.log('[useTasks] Updated tasks:', updated.map(t => ({ id: t.id, conversation: t.conversation })))
          return updated
        })
      } else if (type === 'error' && error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'error', error } : t
        ))
      }
    })

    return () => unsubscribe()
  }, [])

  const createTask = useCallback(async (title: string, message: string, images: string[]) => {
    const taskId = crypto.randomUUID()
    console.log('[useTasks] Creating task:', { taskId, title, message })

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
      steps: [], // 添加 steps 字段
    }

    setTasks(prev => [task, ...prev])
    setExpandedId(taskId)

    try {
      console.log('[useTasks] Calling window.api.createTask...')
      const result = await window.api.createTask(taskId, message)
      console.log('[useTasks] Task result:', result)

      if (result.error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'error', error: result.error } : t
        ))
        return
      }

      // 任务完成 - 更新状态为 done，但保留流式更新的 conversation
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          // 如果流式事件已经更新了 conversation，保留它；否则使用最终结果
          const finalConversation = t.conversation.length > 1
            ? t.conversation  // 已有流式输出
            : result.reply
              ? [
                  { role: 'user', content: message, timestamp: Date.now() },
                  { role: 'assistant', content: result.reply, timestamp: Date.now() }
                ]
              : t.conversation

          return {
            ...t,
            sessionId: result.sessionId,
            status: 'done',
            conversation: finalConversation,
          }
        }
        return t
      }))
    } catch (err) {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'error', error: String(err) } : t
      ))
    }
  }, [])

  const cancelTask = useCallback(async (taskId: string) => {
    await window.api.cancelTask(taskId)
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'error', error: '已取消' } : t
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
