// ═══════════════════════════════════════════════════════════════
// evolang/src/loader.ts — Skill 加载器 + LLM 执行器生成（带自修复）
// ═══════════════════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import type {
  SkillMeta, SkillExecutor, RegisteredSkill,
  SkillContext, ValidationReport,
} from './types'
import { validateSchema, formatReportForLLM, extractJSON } from './validator'
import { SkillValidationError } from './errors'
import { executePipeline } from './pipeline'

/**
 * 从目录递归扫描 skill.json，加载为 RegisteredSkill 列表
 */
export async function loadSkillsFromDir<TEnv>(dir: string): Promise<RegisteredSkill<TEnv>[]> {
  const results: RegisteredSkill<TEnv>[] = []

  if (!fs.existsSync(dir)) return results

  // 如果 dir 本身就是一个 Skill 目录（直接包含 skill.json），直接加载它
  // 这支持 hotLoadSkill 传入单个 Skill 目录的场景
  const selfMetaPath = path.join(dir, 'skill.json')
  if (fs.existsSync(selfMetaPath)) {
    try {
      const rawMeta = JSON.parse(fs.readFileSync(selfMetaPath, 'utf-8'))
      const meta = normalizeSkillMeta(rawMeta)
      meta.skillDir = dir
      const execute = await createExecutor<TEnv>(meta, dir)
      results.push({ meta, execute })
    } catch (err) {
      console.warn(`[loader] Failed to load skill from ${dir}:`, err)
    }
    return results
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillDir = path.join(dir, entry.name)
    const metaPath = path.join(skillDir, 'skill.json')

    if (!fs.existsSync(metaPath)) {
      // 可能是分类目录（如 text/summarize/），递归搜索
      const nested = await loadSkillsFromDir<TEnv>(skillDir)
      results.push(...nested)
      continue
    }

    try {
      const rawMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      const meta = normalizeSkillMeta(rawMeta)
      meta.skillDir = skillDir  // 记录 Skill 目录，供 $resolve script 解析相对路径
      const execute = await createExecutor<TEnv>(meta, skillDir)
      results.push({ meta, execute })
    } catch (err) {
      console.warn(`[loader] Failed to load skill from ${skillDir}:`, err)
    }
  }

  return results
}

/**
 * 根据 mode 创建执行器
 */
async function createExecutor<TEnv>(meta: SkillMeta, skillDir: string): Promise<SkillExecutor<TEnv>> {
  switch (meta.mode) {
    case 'code': {
      // 优先加载编译后的 .js（.ts 在 Node.js 运行时无法直接 import）
      const indexJsPath = path.join(skillDir, 'index.js')
      const indexTsPath = path.join(skillDir, 'index.ts')
      const modPath = fs.existsSync(indexJsPath) ? indexJsPath : indexTsPath
      if (!fs.existsSync(modPath)) {
        throw new Error(`Skill "${meta.name}" (code) missing index.js or index.ts in ${skillDir}`)
      }
      const mod = await import(modPath)
      if (typeof mod.execute !== 'function') {
        throw new Error(`Skill "${meta.name}" (code) must export an execute function`)
      }
      return mod.execute
    }

    case 'llm': {
      const promptPath = path.join(skillDir, 'prompt.md')
      if (!fs.existsSync(promptPath)) {
        throw new Error(`Skill "${meta.name}" (llm) requires prompt.md`)
      }
      const promptTemplate = fs.readFileSync(promptPath, 'utf-8')
      return createLLMExecutor<TEnv>(meta, promptTemplate)
    }

    case 'composite': {
      // 优先加载 .js，回退 .ts
      const indexJsPath = path.join(skillDir, 'index.js')
      const indexTsPath = path.join(skillDir, 'index.ts')
      if (fs.existsSync(indexJsPath) || fs.existsSync(indexTsPath)) {
        const modPath = fs.existsSync(indexJsPath) ? indexJsPath : indexTsPath
        const mod = await import(modPath)
        if (typeof mod.execute === 'function') return mod.execute
      }
      return createCompositeExecutor<TEnv>(meta)
    }

    default:
      throw new Error(`Skill "${meta.name}" has unknown mode: ${meta.mode}`)
  }
}

/**
 * LLM 模式执行器 — 带 Gate 2 输出校验自修复循环
 */
function createLLMExecutor<TEnv>(meta: SkillMeta, promptTemplate: string): SkillExecutor<TEnv> {
  const maxAttempts = Math.min((meta.retry || 0) + 1, 3)

  return async (input, ctx) => {
    const compiledPrompt = compileTemplate(promptTemplate, { input })
    let lastReport: ValidationReport | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 追加校验反馈
      let finalPrompt = compiledPrompt
      if (lastReport) {
        finalPrompt += `\n\n─── 校验反馈（第 ${attempt} 次尝试）───\n`
        finalPrompt += formatReportForLLM(lastReport)
        finalPrompt += `\n请严格按照要求修正后重新输出 JSON。`
      }

      const rawOutput = await ctx.llm({
        system: `你是 ${meta.name} 技能的执行器。严格按照指定的 JSON 格式输出，不要输出 JSON 以外的文字。`,
        prompt: finalPrompt,
        temperature: attempt === 1 ? 0.3 : 0.1,
        maxTokens: 2000,
      })

      // 解析 JSON
      let parsed: Record<string, unknown>
      try {
        parsed = extractJSON(rawOutput)
      } catch {
        lastReport = {
          skillName: meta.name, direction: 'output', attempt, maxAttempts,
          violations: [{
            path: '(root)', rule: 'format',
            expected: '合法的 JSON 对象', actual: rawOutput.slice(0, 200),
            suggestion: '输出必须是纯 JSON，不要包含 markdown 代码块或其他文字',
          }],
        }
        ctx.log(`[${meta.name}] JSON 解析失败 (${attempt}/${maxAttempts})`)
        continue
      }

      // ═══ Gate 2: 输出校验 ═══
      const violations = validateSchema(parsed, meta.output)

      if (violations.length === 0) {
        if (attempt > 1) ctx.log(`[${meta.name}] 自修复成功（第 ${attempt} 次）`)
        return parsed
      }

      lastReport = {
        skillName: meta.name, direction: 'output',
        attempt, maxAttempts, violations,
      }
      ctx.log(`[${meta.name}] 输出校验失败 (${attempt}/${maxAttempts}): ${violations.length} 项违规`)

      ctx.emit({
        type: 'skill_validation_retry',
        skill: meta.name, attempt, maxAttempts,
        violations: violations.length, timestamp: Date.now(),
      })
    }

    throw new SkillValidationError(
      meta.name, 'output', lastReport!.violations,
      `输出校验在 ${maxAttempts} 次尝试后仍失败`,
    )
  }
}

/**
 * composite 模式执行器 — 委托 pipeline.ts
 */
function createCompositeExecutor<TEnv>(meta: SkillMeta): SkillExecutor<TEnv> {
  return async (input, ctx) => {
    return executePipeline(meta, input, ctx)
  }
}

// ─── 模板编译 ───

/**
 * 简单模板编译：替换 {{input.xxx}} 为实际值
 * 支持 {{#if}} 条件块
 */
function compileTemplate(template: string, context: { input: Record<string, unknown> }): string {
  let result = template

  // 处理 {{#if input.xxx}} ... {{/if}} 条件块
  result = result.replace(
    /\{\{#if\s+(.+?)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condition: string, content: string) => {
      const value = resolveSimplePath(condition.trim(), context)
      return value ? content : ''
    },
  )

  // 处理 {{input.xxx}} 变量替换
  result = result.replace(
    /\{\{(.+?)\}\}/g,
    (_match, expr: string) => {
      const parts = expr.trim().split('|').map(p => p.trim())
      let value: unknown = resolveSimplePath(parts[0], context)

      // 管道操作
      for (let i = 1; i < parts.length; i++) {
        value = applySimplePipe(value, parts[i])
      }

      if (value === undefined || value === null) return ''
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    },
  )

  return result
}

function resolveSimplePath(expr: string, context: { input: Record<string, unknown> }): unknown {
  const segments = expr.split('.')
  if (segments[0] === 'input') {
    let current: unknown = context.input
    for (const seg of segments.slice(1)) {
      if (typeof current !== 'object' || current === null) return undefined
      current = (current as Record<string, unknown>)[seg]
    }
    return current
  }
  return undefined
}

function applySimplePipe(value: unknown, operator: string): unknown {
  const [op, ...args] = operator.split(':')
  switch (op) {
    case 'format_skills': {
      if (!Array.isArray(value)) return String(value)
      return value.map((s: any) => formatSkillEntry(s)).join('\n')
    }
    case 'json': return JSON.stringify(value)
    case 'default': return (value === undefined || value === null || value === '') ? args[0] : value
    default: return value
  }
}

/** 格式化单个 Skill 条目（含 input schema） */
function formatSkillEntry(s: Record<string, unknown>): string {
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
}

// ─── skill.json 规范化 ───

function normalizeSkillMeta(raw: Record<string, unknown>): SkillMeta {
  return {
    name: raw.name as string,
    description: raw.description as string,
    category: raw.category as string,
    input: (raw.input || {}) as Record<string, unknown>,
    output: (raw.output || {}) as Record<string, unknown>,
    mode: raw.mode as 'code' | 'llm' | 'composite',
    calls: (raw.calls || []) as string[],
    pipeline: raw.pipeline as any,
    outputMapping: raw.outputMapping as any,
    version: (raw.version || '1.0.0') as string,
    tags: (raw.tags || []) as string[],
    author: raw.author as string | undefined,
    timeout: (raw.timeout || 30000) as number,
    retry: (raw.retry || 0) as number,
  }
}
