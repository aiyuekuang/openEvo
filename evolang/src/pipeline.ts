// ═══════════════════════════════════════════════════════════════
// evolang/src/pipeline.ts — composite 流水线执行器
//
// 支持两种执行模式：
//   1. 顺序模式 — 无任何步骤声明 depends（向后兼容）
//   2. DAG 并行模式 — 任一步骤有 depends
//      - 有 depends 的步骤按声明的依赖调度
//      - 无 depends 的步骤视为 depends: []（无依赖，立即就绪）
//      - 用户必须显式声明所有依赖关系
//
// 并行 foreach:
//   - maxConcurrency > 1 → 迭代项并行执行
//   - maxConcurrency = 1 或不设 → 顺序迭代
//
// 错误处理:
//   - retry + retryDelay → 步骤级重试（指数退避）
//   - timeout → 步骤级超时（每次 attempt 独立计时）
//   - continueOnError: true → 失败步骤结果为 { _error, _failed }
// ═══════════════════════════════════════════════════════════════

import type { PipelineStep, SkillContext, SkillMeta } from './types'

/**
 * 执行 composite 模式的 pipeline 步骤
 * 自动检测：有 depends → DAG 并行调度，否则 → 顺序执行
 */
export async function executePipeline<TEnv>(
  meta: SkillMeta,
  input: Record<string, unknown>,
  ctx: SkillContext<TEnv>,
): Promise<Record<string, unknown>> {
  if (!meta.pipeline || meta.pipeline.length === 0) {
    throw new Error(`Skill "${meta.name}" is composite but has no pipeline`)
  }

  // 检测是否有 depends 声明 → 切换 DAG 模式
  const hasDepends = meta.pipeline.some(s => s.depends !== undefined)

  if (hasDepends) {
    return executeDAG(meta, input, ctx)
  }

  return executeSequential(meta, input, ctx)
}

// ═══════════════════════════════════════════════════════════════
// 顺序执行（向后兼容）
// ═══════════════════════════════════════════════════════════════

async function executeSequential<TEnv>(
  meta: SkillMeta,
  input: Record<string, unknown>,
  ctx: SkillContext<TEnv>,
): Promise<Record<string, unknown>> {
  const steps: Record<string, Record<string, unknown>> = {}

  for (const step of meta.pipeline!) {
    await executeStep(step, input, steps, ctx)
  }

  return assembleOutput(meta, input, steps)
}

// ═══════════════════════════════════════════════════════════════
// DAG 并行调度
//
// 规则：
//   - depends: ["a", "b"] → 等待 a 和 b 都完成
//   - depends: []         → 无依赖，立即就绪
//   - 无 depends 字段     → 同 depends: []（立即就绪）
//   - 用户必须显式声明所有依赖，不做隐式推断
// ═══════════════════════════════════════════════════════════════

async function executeDAG<TEnv>(
  meta: SkillMeta,
  input: Record<string, unknown>,
  ctx: SkillContext<TEnv>,
): Promise<Record<string, unknown>> {
  const steps: Record<string, Record<string, unknown>> = {}
  const pipeline = meta.pipeline!

  // 校验：检查 depends 引用的步骤名是否存在
  const stepNames = new Set(pipeline.map(s => s.step))
  for (const step of pipeline) {
    for (const dep of step.depends || []) {
      if (!stepNames.has(dep)) {
        throw new Error(`[pipeline] 步骤 "${step.step}" 依赖不存在的步骤 "${dep}"`)
      }
    }
  }

  const completed = new Set<string>()
  const skipped = new Set<string>()
  const total = pipeline.length

  while (completed.size + skipped.size < total) {
    // 找出所有就绪步骤：依赖已全部完成
    const ready: PipelineStep[] = []
    for (const step of pipeline) {
      if (completed.has(step.step) || skipped.has(step.step)) continue
      const deps = step.depends || []
      const allDepsMet = deps.every(d => completed.has(d) || skipped.has(d))
      if (allDepsMet) ready.push(step)
    }

    if (ready.length === 0) {
      const remaining = pipeline
        .filter(s => !completed.has(s.step) && !skipped.has(s.step))
        .map(s => `${s.step}(depends:[${(s.depends || []).join(',')}])`)
      throw new Error(`[pipeline] DAG 死锁：${remaining.join(', ')}`)
    }

    // 并行执行所有就绪步骤
    await Promise.all(ready.map(async (step) => {
      try {
        await executeStep(step, input, steps, ctx)
        completed.add(step.step)
      } catch (err) {
        if (step.continueOnError) {
          steps[step.step] = {
            _error: err instanceof Error ? err.message : String(err),
            _failed: true,
          }
          completed.add(step.step)
          ctx.log(`[pipeline] 步骤 "${step.step}" 失败（已忽略）: ${err instanceof Error ? err.message : String(err)}`)
        } else {
          throw err
        }
      }
    }))
  }

  return assembleOutput(meta, input, steps)
}

// ═══════════════════════════════════════════════════════════════
// 单步执行（顺序 / DAG 共用）— 含 retry + timeout 包装
// ═══════════════════════════════════════════════════════════════

async function executeStep<TEnv>(
  step: PipelineStep,
  input: Record<string, unknown>,
  steps: Record<string, Record<string, unknown>>,
  ctx: SkillContext<TEnv>,
): Promise<void> {
  // 条件检查（在 retry 外面，只检查一次）
  if (step.condition) {
    const condResult = evaluateCondition(step.condition, { input, steps })
    if (!condResult) {
      ctx.log(`[pipeline] 跳过步骤 "${step.step}" — 条件不满足`)
      return
    }
  }

  const maxRetries = step.retry ?? 0
  const retryDelay = step.retryDelay ?? 1000
  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避：retryDelay × 2^(attempt-1)，上限 30s
      const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), 30000)
      ctx.log(`[pipeline] 步骤 "${step.step}" 第 ${attempt}/${maxRetries} 次重试（等待 ${delay}ms）`)
      await sleep(delay)
    }

    try {
      await executeStepCore(step, input, steps, ctx)
      return
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        ctx.log(`[pipeline] 步骤 "${step.step}" 失败 (attempt ${attempt + 1}/${maxRetries + 1}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  throw lastError
}

/** 核心执行逻辑（不含 retry），可被 timeout 包装 */
async function executeStepCore<TEnv>(
  step: PipelineStep,
  input: Record<string, unknown>,
  steps: Record<string, Record<string, unknown>>,
  ctx: SkillContext<TEnv>,
): Promise<void> {
  const run = async () => {
    if (step.foreach) {
      await executeStepForeach(step, input, steps, ctx)
    } else {
      await executeStepSingle(step, input, steps, ctx)
    }
  }

  if (step.timeout && step.timeout > 0) {
    await withTimeout(run(), step.timeout, step.step)
  } else {
    await run()
  }
}

/** 单次执行 */
async function executeStepSingle<TEnv>(
  step: PipelineStep,
  input: Record<string, unknown>,
  steps: Record<string, Record<string, unknown>>,
  ctx: SkillContext<TEnv>,
): Promise<void> {
  const stepInput = resolveInputTemplates(step.input, { input, steps })
  const result = await ctx.call<Record<string, unknown>>(step.skill, stepInput)
  steps[step.step] = result
}

/** 迭代执行（foreach） */
async function executeStepForeach<TEnv>(
  step: PipelineStep,
  input: Record<string, unknown>,
  steps: Record<string, Record<string, unknown>>,
  ctx: SkillContext<TEnv>,
): Promise<void> {
  const items = resolveTemplate(step.foreach!, { input, steps })
  if (!Array.isArray(items)) {
    ctx.log(`[pipeline] foreach 表达式 "${step.foreach}" 未返回数组，跳过`)
    return
  }

  // maxConcurrency 决定并行度：不设或 1 → 顺序，> 1 → 并行，0 → 不限
  const concurrency = step.maxConcurrency ?? 1
  const isParallel = concurrency !== 1 && items.length > 1

  if (isParallel) {
    const effectiveConcurrency = concurrency === 0 ? Infinity : concurrency
    const results = await executeConcurrent(
      items,
      async (item) => {
        const stepInput = resolveInputTemplates(step.input, { input, steps, item })
        return ctx.call<Record<string, unknown>>(step.skill, stepInput)
      },
      effectiveConcurrency,
      step.continueOnError ?? false,
      ctx,
    )
    steps[step.step] = { results }
  } else {
    // 顺序迭代
    const results: Record<string, unknown>[] = []
    for (const item of items) {
      const stepInput = resolveInputTemplates(step.input, { input, steps, item })
      try {
        const result = await ctx.call<Record<string, unknown>>(step.skill, stepInput)
        results.push(result)
      } catch (err) {
        if (step.continueOnError) {
          results.push({ _error: err instanceof Error ? err.message : String(err), _failed: true })
        } else {
          throw err
        }
      }
    }
    steps[step.step] = { results }
  }
}

// ═══════════════════════════════════════════════════════════════
// 超时包装器
// ═══════════════════════════════════════════════════════════════

function withTimeout(promise: Promise<void>, ms: number, stepName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[pipeline] 步骤 "${stepName}" 超时 (${ms}ms)`))
    }, ms)

    promise
      .then(() => { clearTimeout(timer); resolve() })
      .catch((err) => { clearTimeout(timer); reject(err) })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ═══════════════════════════════════════════════════════════════
// 并发执行器 — 带 maxConcurrency 限制的 Promise.all
// ═══════════════════════════════════════════════════════════════

async function executeConcurrent<T, TEnv>(
  items: unknown[],
  executor: (item: unknown) => Promise<T>,
  maxConcurrency: number,
  continueOnError: boolean,
  ctx: SkillContext<TEnv>,
): Promise<T[]> {
  if (items.length === 0) return []

  const results: T[] = new Array(items.length)

  if (maxConcurrency >= items.length) {
    const promises = items.map(async (item, idx) => {
      try {
        results[idx] = await executor(item)
      } catch (err) {
        if (continueOnError) {
          results[idx] = { _error: err instanceof Error ? err.message : String(err), _failed: true } as T
          ctx.log(`[pipeline] 并发项 #${idx} 失败（已忽略）: ${err instanceof Error ? err.message : String(err)}`)
        } else {
          throw err
        }
      }
    })
    await Promise.all(promises)
  } else {
    for (let i = 0; i < items.length; i += maxConcurrency) {
      const batch = items.slice(i, i + maxConcurrency)
      const promises = batch.map(async (item, batchIdx) => {
        try {
          results[i + batchIdx] = await executor(item)
        } catch (err) {
          if (continueOnError) {
            results[i + batchIdx] = { _error: err instanceof Error ? err.message : String(err), _failed: true } as T
            ctx.log(`[pipeline] 并发项 #${i + batchIdx} 失败（已忽略）: ${err instanceof Error ? err.message : String(err)}`)
          } else {
            throw err
          }
        }
      })
      await Promise.all(promises)
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════════
// 输出组装
// ═══════════════════════════════════════════════════════════════

function assembleOutput(
  meta: SkillMeta,
  input: Record<string, unknown>,
  steps: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (meta.outputMapping) {
    return resolveOutputMapping(meta.outputMapping, { input, steps })
  }
  const stepNames = Object.keys(steps)
  return stepNames.length > 0 ? steps[stepNames[stepNames.length - 1]] : {}
}

// ═══════════════════════════════════════════════════════════════
// 模板解析
// ═══════════════════════════════════════════════════════════════

interface TemplateContext {
  input: Record<string, unknown>
  steps: Record<string, Record<string, unknown>>
  item?: unknown
}

function resolveTemplate(template: string, ctx: TemplateContext): unknown {
  const match = template.match(/^\{\{(.+?)\}\}$/)
  if (!match) return template

  const expr = match[1].trim()
  const parts = expr.split('|').map(p => p.trim())
  let value = resolvePathExpr(parts[0], ctx)

  for (let i = 1; i < parts.length; i++) {
    value = applyPipeOperator(value, parts[i])
  }

  return value
}

function resolvePathExpr(expr: string, ctx: TemplateContext): unknown {
  const comparison = expr.match(/^(.+?)\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
  if (comparison) {
    const left = resolvePathExpr(comparison[1].trim(), ctx)
    const right = parseValueLiteral(comparison[3].trim())
    return compareValues(left, comparison[2], right)
  }

  const segments = expr.split('.')

  if (segments[0] === 'input') {
    return getNestedValue(ctx.input, segments.slice(1))
  }
  if (segments[0] === 'steps') {
    const stepName = segments[1]
    const stepResult = ctx.steps[stepName]
    if (!stepResult) return undefined
    return segments.length > 2 ? getNestedValue(stepResult, segments.slice(2)) : stepResult
  }
  if (segments[0] === 'item') {
    if (segments.length === 1) return ctx.item
    if (typeof ctx.item === 'object' && ctx.item !== null) {
      return getNestedValue(ctx.item as Record<string, unknown>, segments.slice(1))
    }
    return undefined
  }

  return expr
}

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function parseValueLiteral(str: string): unknown {
  if (str === 'true') return true
  if (str === 'false') return false
  if (str === 'null') return null
  const num = Number(str)
  if (!isNaN(num)) return num
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1)
  }
  return str
}

function compareValues(left: unknown, op: string, right: unknown): boolean {
  switch (op) {
    case '>': return Number(left) > Number(right)
    case '<': return Number(left) < Number(right)
    case '>=': return Number(left) >= Number(right)
    case '<=': return Number(left) <= Number(right)
    case '==': return left === right
    case '!=': return left !== right
    default: return false
  }
}

function resolveInputTemplates(
  inputSpec: Record<string, unknown>,
  ctx: TemplateContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(inputSpec)) {
    if (typeof value === 'string' && value.includes('{{')) {
      result[key] = resolveTemplate(value, ctx)
    } else {
      result[key] = value
    }
  }
  return result
}

function resolveOutputMapping(
  mapping: Record<string, string>,
  ctx: TemplateContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, template] of Object.entries(mapping)) {
    const orParts = template.split('||').map(p => p.trim())
    let value: unknown = undefined
    for (const part of orParts) {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        value = resolveTemplate(part, ctx)
      } else if (part.startsWith("'") && part.endsWith("'")) {
        value = part.slice(1, -1)
      } else {
        value = part
      }
      if (value !== undefined && value !== null && value !== '') break
    }
    result[key] = value
  }
  return result
}

function evaluateCondition(condition: string, ctx: TemplateContext): boolean {
  const result = resolveTemplate(condition, ctx)
  return !!result
}

// ─── 管道操作符 ───

function applyPipeOperator(value: unknown, operator: string): unknown {
  const [op, ...args] = operator.split(':')

  switch (op) {
    case 'pluck': {
      if (!Array.isArray(value)) return value
      const field = args[0]
      return value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return (item as Record<string, unknown>)[field]
        }
        return undefined
      })
    }
    case 'join': {
      if (!Array.isArray(value)) return value
      const sep = (args[0] || ',').replace(/\\n/g, '\n')
      return value.join(sep)
    }
    case 'slice': {
      if (!Array.isArray(value)) return value
      const start = parseInt(args[0] || '0', 10)
      const end = args[1] ? parseInt(args[1], 10) : undefined
      return value.slice(start, end)
    }
    case 'default': {
      return (value === undefined || value === null || value === '') ? args[0] : value
    }
    case 'json': {
      return JSON.stringify(value)
    }
    case 'format_skills': {
      if (!Array.isArray(value)) return String(value)
      return value.map((s: any) => {
        let line = `- **${s.name}** [${s.category}]: ${s.description}`
        const input = s.input as Record<string, { type: string; description?: string; required: boolean }> | undefined
        if (input && Object.keys(input).length > 0) {
          const fields = Object.entries(input).map(([key, info]) => {
            const req = info.required ? '必填' : '可选'
            const desc = info.description ? ` — ${info.description}` : ''
            return `${key}(${info.type}, ${req})${desc}`
          })
          line += `\n  输入: ${fields.join('; ')}`
        }
        return line
      }).join('\n')
    }
    default:
      return value
  }
}
