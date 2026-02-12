/**
 * OpenClaw 步骤管理 Hook
 *
 * 接收 Gateway 事件，构建递归步骤树，管理任务状态
 */

import { useState, useEffect } from 'react'
import type { Task, TaskStep, GatewayEvent, ChatMessage } from '../types/task'

export function useOpenClawSteps() {
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map())

  useEffect(() => {
    // 监听 Gateway 事件
    const unsubscribe = window.api.onGatewayEvent((event: GatewayEvent) => {
      console.log('[useOpenClawSteps] Gateway event:', event)

      setTasks((prev) => {
        const newMap = new Map(prev)

        switch (event.type) {
          case 'task_start':
            handleTaskStart(newMap, event)
            break

          case 'skill_invoke':
            handleSkillInvoke(newMap, event)
            break

          case 'step_start':
            handleStepStart(newMap, event)
            break

          case 'step_complete':
            handleStepComplete(newMap, event)
            break

          case 'step_message':
            handleStepMessage(newMap, event)
            break

          case 'task_complete':
            handleTaskComplete(newMap, event)
            break
        }

        return newMap
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return {
    tasks: Array.from(tasks.values()),
  }
}

// ============================================================================
// 事件处理函数
// ============================================================================

function handleTaskStart(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'task_start' }>
) {
  const newTask: Task = {
    id: event.sessionId,
    sessionId: event.sessionId,
    title: extractTitle(event.prompt),
    message: event.prompt,
    status: 'running',
    createdAt: event.timestamp,
    conversation: [],
    images: [],
    steps: [],
  }

  taskMap.set(event.sessionId, newTask)
}

function handleSkillInvoke(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'skill_invoke' }>
) {
  const task = taskMap.get(event.sessionId)
  if (!task) return

  const newStep: TaskStep = {
    id: event.stepId,
    name: event.skillName,
    status: 'running',
    isSkill: true,
    skillName: event.skillName,
    conversation: [],
    output: [],
    children: [],
  }

  if (!event.parentStepId) {
    // 根级步骤
    task.steps.push(newStep)
  } else {
    // 嵌套步骤
    addChildStep(task.steps, event.parentStepId, newStep)
  }

  task.currentStepId = event.stepId
  taskMap.set(event.sessionId, { ...task })
}

function handleStepStart(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'step_start' }>
) {
  const task = taskMap.get(event.sessionId)
  if (!task) return

  const newStep: TaskStep = {
    id: event.stepId,
    name: event.stepName,
    status: 'running',
    conversation: [],
    output: [],
    children: [],
  }

  if (!event.parentStepId) {
    task.steps.push(newStep)
  } else {
    addChildStep(task.steps, event.parentStepId, newStep)
  }

  task.currentStepId = event.stepId
  taskMap.set(event.sessionId, { ...task })
}

function handleStepComplete(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'step_complete' }>
) {
  const task = taskMap.get(event.sessionId)
  if (!task) return

  updateStepRecursive(task.steps, event.stepId, (step) => ({
    ...step,
    status: 'done',
    duration: event.duration,
    output: event.output ? [...step.output, event.output] : step.output,
  }))

  taskMap.set(event.sessionId, { ...task })
}

function handleStepMessage(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'step_message' }>
) {
  const task = taskMap.get(event.sessionId)
  if (!task) return

  const message: ChatMessage = {
    role: event.role,
    content: event.content,
    timestamp: event.timestamp,
  }

  updateStepRecursive(task.steps, event.stepId, (step) => ({
    ...step,
    conversation: [...step.conversation, message],
  }))

  taskMap.set(event.sessionId, { ...task })
}

function handleTaskComplete(
  taskMap: Map<string, Task>,
  event: Extract<GatewayEvent, { type: 'task_complete' }>
) {
  const task = taskMap.get(event.sessionId)
  if (!task) return

  task.status = 'done'
  taskMap.set(event.sessionId, { ...task })
}

// ============================================================================
// 辅助函数：递归操作步骤树
// ============================================================================

/**
 * 递归添加子步骤
 */
function addChildStep(steps: TaskStep[], parentId: string, newStep: TaskStep): boolean {
  for (const step of steps) {
    if (step.id === parentId) {
      step.children = step.children || []
      step.children.push(newStep)
      return true
    }
    if (step.children && addChildStep(step.children, parentId, newStep)) {
      return true
    }
  }
  return false
}

/**
 * 递归更新步骤
 */
function updateStepRecursive(
  steps: TaskStep[],
  stepId: string,
  updater: (step: TaskStep) => TaskStep
): boolean {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].id === stepId) {
      steps[i] = updater(steps[i])
      return true
    }
    if (steps[i].children && updateStepRecursive(steps[i].children!, stepId, updater)) {
      return true
    }
  }
  return false
}

/**
 * 从 prompt 提取任务标题
 */
function extractTitle(prompt: string): string {
  const lines = prompt.trim().split('\n')
  const firstLine = lines[0].trim()

  // 限制长度
  if (firstLine.length > 50) {
    return firstLine.substring(0, 47) + '...'
  }

  return firstLine
}
