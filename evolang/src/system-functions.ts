// ═══════════════════════════════════════════════════════════════
// evolang/src/system-functions.ts — 系统内置函数注册表 + 解析器
//
// Skill 在 skill.json 的 input.properties 中可以用 "$resolve" 声明
// 需要哪些系统函数自动注入的数据。运行时在执行 Skill 前自动解析填充。
//
// $resolve 支持三种形式：
//   1. 字符串 — 系统内置函数，如 "input.message"、"skills.list"
//   2. 对象   — 脚本配置，如 { type: "script", path: "./resolve.js", params: {...} }
//   3. 对象   — Skill 配置，如 { type: "skill", name: "text.summarize", params: {...} }
//
// 规则：
//   - 如果调用方已经传了值，不覆盖（providedInput 优先于 $resolve）
//   - 未知的系统函数名称会被跳过（不报错）
//   - 脚本/Skill params 中的值支持 "$resolve:xxx" 引用系统函数
//   - 脚本/Skill params 中的值支持 "$skill:xxx" 注入 Skill 可调用函数
// ═══════════════════════════════════════════════════════════════

import * as path from 'path'
import type { SkillRegistry, SkillMeta, RunInput } from './types'

/** $resolve 解析器执行时所需的上下文 */
export interface ResolverContext {
  input: RunInput                        // 当前用户输入
  registry: SkillRegistry                // Skill 注册表
  env: Record<string, unknown>           // 环境（含 relevantMemories 等）
  scratch: Map<string, unknown>          // 中间结果（如 intent 结果）
  /** 调用已注册的 Skill（高阶函数支持） */
  callSkill?: <T = Record<string, unknown>>(name: string, input: Record<string, unknown>) => Promise<T>
}

/** 脚本类型的 $resolve 配置 */
export interface ScriptResolveConfig {
  type: 'script'
  /** 脚本文件路径（相对于 Skill 目录或绝对路径） */
  path: string
  /** 传给脚本的参数，值可以是 "$resolve:xxx" 引用系统函数 */
  params?: Record<string, unknown>
}

/** Skill 类型的 $resolve 配置 — 调用已注册的 Skill 获取结果 */
export interface SkillResolveConfig {
  type: 'skill'
  /** 要调用的 Skill 名称 */
  name: string
  /** 传给 Skill 的参数，值可以是 "$resolve:xxx" 引用系统函数，"$skill:xxx" 注入 Skill 可调用函数 */
  params?: Record<string, unknown>
}

/** $resolve 的值类型：字符串（系统函数）、对象（脚本配置/Skill 配置） */
export type ResolveValue = string | ScriptResolveConfig | SkillResolveConfig

/** 单个系统函数定义 */
interface SystemFunctionDef {
  name: string
  description: string
  resolve: (ctx: ResolverContext) => unknown
}

// ─── Skill 摘要（供 intent_recognize 等路由引擎使用） ───

/** 提取 Skill 的关键信息，包含 input schema 让路由引擎生成正确的参数 */
function summarizeSkill(meta: SkillMeta): Record<string, unknown> {
  const inputSchema = meta.input as Record<string, unknown> | undefined
  const properties = (inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = (inputSchema?.required ?? []) as string[]

  // 只提取 LLM 需要的信息：参数名、类型、描述、是否必填
  const inputFields: Record<string, { type: string; description?: string; required: boolean }> = {}
  for (const [key, prop] of Object.entries(properties)) {
    // 跳过 $resolve 注入的字段 — 这些由系统自动填充，LLM 不需要管
    if (prop.$resolve) continue
    inputFields[key] = {
      type: (prop.type as string) || 'unknown',
      description: prop.description as string | undefined,
      required: required.includes(key),
    }
  }

  return {
    name: meta.name,
    description: meta.description,
    category: meta.category,
    input: inputFields,
  }
}

// ─── 内置系统函数注册表 ───

const SYSTEM_FUNCTIONS: SystemFunctionDef[] = [
  // === input 命名空间 — 当前请求信息 ===
  {
    name: 'input.message',
    description: '当前用户消息',
    resolve: (ctx) => ctx.input.message,
  },
  {
    name: 'input.taskId',
    description: '当前任务 ID',
    resolve: (ctx) => ctx.input.taskId,
  },
  {
    name: 'input.model',
    description: '当前使用的模型',
    resolve: (ctx) => ctx.input.model || '',
  },
  {
    name: 'input.providerId',
    description: '当前使用的供应商 ID',
    resolve: (ctx) => ctx.input.providerId || '',
  },

  // === skills 命名空间 — Skill 注册表 ===
  {
    name: 'skills.list',
    description: '可用 Skill 列表（不含 system 类别，含 input schema）',
    resolve: (ctx) => ctx.registry.list()
      .filter(s => s.meta.category !== 'system')
      .map(s => summarizeSkill(s.meta)),
  },
  {
    name: 'skills.listAll',
    description: '所有 Skill 列表（含 system 类别，含 input schema）',
    resolve: (ctx) => ctx.registry.list()
      .map(s => summarizeSkill(s.meta)),
  },

  // === memory 命名空间 — 记忆数据 ===
  {
    name: 'memory.relevantMemories',
    description: '预取的相关记忆（Agent 统一检索，所有 Skill 共享）',
    resolve: (ctx) => (ctx.env as Record<string, unknown>).relevantMemories || '',
  },
]

// 构建查找表
const functionMap = new Map<string, SystemFunctionDef>(
  SYSTEM_FUNCTIONS.map(f => [f.name, f])
)

/**
 * 解析单个系统函数
 * 支持 scratch.* 动态路径（如 "scratch.intent"）
 */
export function resolveSystemFunction(name: string, ctx: ResolverContext): unknown {
  // 直接匹配
  const fn = functionMap.get(name)
  if (fn) return fn.resolve(ctx)

  // scratch.* 动态匹配
  if (name.startsWith('scratch.')) {
    const key = name.slice('scratch.'.length)
    return ctx.scratch.get(key)
  }

  return undefined
}

/**
 * 解析脚本类型的 $resolve
 *
 * 脚本文件需导出 resolve 函数或 default 函数：
 *   module.exports = async function(params, ctx) { return value }
 *   // 或
 *   export default async function(params, ctx) { return value }
 *   // 或
 *   export async function resolve(params, ctx) { return value }
 */
async function resolveScript(
  config: ScriptResolveConfig,
  ctx: ResolverContext,
  skillDir?: string,
): Promise<unknown> {
  // 解析脚本路径
  let scriptPath = config.path
  if (!path.isAbsolute(scriptPath) && skillDir) {
    scriptPath = path.resolve(skillDir, scriptPath)
  }

  // 解析 params 中的 "$resolve:xxx" 引用
  const resolvedParams = resolveParams(config.params || {}, ctx)

  // 动态加载脚本
  try {
    const mod = await import(scriptPath)
    const fn = mod.resolve || mod.default || mod
    if (typeof fn !== 'function') {
      console.warn(`[system-functions] 脚本 ${scriptPath} 未导出 resolve/default 函数`)
      return undefined
    }
    return await fn(resolvedParams, ctx)
  } catch (err) {
    console.warn(`[system-functions] 脚本执行失败 ${scriptPath}:`, err)
    return undefined
  }
}

/**
 * 解析 Skill 类型的 $resolve
 *
 * 调用已注册的 Skill，将返回值作为参数注入。
 * 需要 ResolverContext 中提供 callSkill 函数。
 */
async function resolveSkill(
  config: SkillResolveConfig,
  ctx: ResolverContext,
): Promise<unknown> {
  if (!ctx.callSkill) {
    console.warn(`[system-functions] callSkill 未提供，无法解析 Skill "${config.name}"`)
    return undefined
  }

  // 解析 params 中的引用
  const resolvedParams = resolveParams(config.params || {}, ctx)

  try {
    return await ctx.callSkill(config.name, resolvedParams)
  } catch (err) {
    console.warn(`[system-functions] Skill "${config.name}" 调用失败:`, err)
    return undefined
  }
}

/**
 * 解析 params 中的引用
 *
 * 支持两种引用：
 *   - "$resolve:xxx" → 系统函数返回值
 *   - "$skill:xxx"   → Skill 可调用函数包装器（高阶函数）
 *
 * 其他值保持原样。
 */
function resolveParams(
  params: Record<string, unknown>,
  ctx: ResolverContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$resolve:')) {
      const fnName = value.slice('$resolve:'.length)
      resolved[key] = resolveSystemFunction(fnName, ctx)
    } else if (typeof value === 'string' && value.startsWith('$skill:')) {
      // $skill:xxx → 注入一个可调用的 Skill 函数包装器
      const skillName = value.slice('$skill:'.length)
      resolved[key] = createSkillCallable(skillName, ctx)
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

/**
 * 创建 Skill 可调用函数包装器
 *
 * 返回一个 async 函数，脚本可以像调用普通函数一样调用 Skill：
 *   const result = await params.summarizer({ text: "..." })
 */
function createSkillCallable(
  skillName: string,
  ctx: ResolverContext,
): (input: Record<string, unknown>) => Promise<Record<string, unknown>> {
  return async (input: Record<string, unknown>) => {
    if (!ctx.callSkill) {
      throw new Error(`callSkill 未提供，无法调用 Skill "${skillName}"`)
    }
    return ctx.callSkill(skillName, input)
  }
}

/**
 * 根据 Skill 的 input schema 中的 $resolve 声明，自动解析填充参数
 *
 * $resolve 支持三种形式：
 *   1. 字符串 — 系统内置函数名，如 "input.message"
 *   2. 对象   — 脚本配置，如 { type: "script", path: "./resolve.js", params: {...} }
 *   3. 对象   — Skill 配置，如 { type: "skill", name: "text.summarize", params: {...} }
 *
 * @param inputSchema - skill.meta.input（JSONSchema 格式）
 * @param providedInput - 调用方传入的参数
 * @param ctx - 解析上下文
 * @param skillDir - Skill 目录路径（用于解析脚本相对路径）
 * @returns 合并后的完整参数（providedInput 优先）
 */
export async function resolveInputs(
  inputSchema: Record<string, unknown>,
  providedInput: Record<string, unknown>,
  ctx: ResolverContext,
  skillDir?: string,
): Promise<Record<string, unknown>> {
  const resolved = { ...providedInput }
  const properties = (inputSchema?.properties || {}) as Record<string, Record<string, unknown>>

  for (const [key, schema] of Object.entries(properties)) {
    // 调用方已经传了值 → 不覆盖
    if (resolved[key] !== undefined) continue

    const resolveConfig = schema.$resolve as ResolveValue | undefined
    if (!resolveConfig) continue

    if (typeof resolveConfig === 'string') {
      // 字符串形式 → 系统内置函数
      const value = resolveSystemFunction(resolveConfig, ctx)
      if (value !== undefined) {
        resolved[key] = value
      }
    } else if (typeof resolveConfig === 'object' && resolveConfig.type === 'script') {
      // 对象形式 → 脚本类型
      const value = await resolveScript(resolveConfig, ctx, skillDir)
      if (value !== undefined) {
        resolved[key] = value
      }
    } else if (typeof resolveConfig === 'object' && resolveConfig.type === 'skill') {
      // 对象形式 → Skill 类型（调用已注册的 Skill）
      const value = await resolveSkill(resolveConfig, ctx)
      if (value !== undefined) {
        resolved[key] = value
      }
    }
  }

  return resolved
}

// ═══════════════════════════════════════════════════════════════
// 输出侧 — $returnSkill 后处理
//
// Skill 的 output schema 中，属性可以声明 "$returnSkill": true
// 表示该属性的值是一个 Skill 名称字符串，运行时自动包装为可调用函数。
//
// 示例 skill.json：
//   "output": {
//     "properties": {
//       "processor": { "$returnSkill": true },
//       "result": { "type": "string" }
//     }
//   }
//
// Skill 执行返回: { processor: "text.summarize", result: "hello" }
// 经 resolveOutputs 后: { processor: async (input) => ..., result: "hello" }
// ═══════════════════════════════════════════════════════════════

/**
 * 根据 Skill 的 output schema 中的 $returnSkill 声明，
 * 将输出中的 Skill 名称字符串包装为可调用函数。
 *
 * @param outputSchema - skill.meta.output（JSONSchema 格式）
 * @param rawOutput - Skill 执行后的原始输出
 * @param ctx - 解析上下文（需要 callSkill）
 * @returns 处理后的输出（$returnSkill 属性被替换为可调用函数）
 */
export function resolveOutputs(
  outputSchema: Record<string, unknown>,
  rawOutput: Record<string, unknown>,
  ctx: ResolverContext,
): Record<string, unknown> {
  if (!ctx.callSkill) return rawOutput

  const properties = (outputSchema?.properties || {}) as Record<string, Record<string, unknown>>
  let hasSkillRef = false

  // 先检查是否有 $returnSkill 声明，避免不必要的拷贝
  for (const schema of Object.values(properties)) {
    if (schema.$returnSkill) { hasSkillRef = true; break }
  }
  if (!hasSkillRef) return rawOutput

  const resolved = { ...rawOutput }
  for (const [key, schema] of Object.entries(properties)) {
    if (!schema.$returnSkill) continue

    const value = resolved[key]
    if (typeof value === 'string') {
      // 值是 Skill 名称字符串 → 包装为可调用函数
      resolved[key] = createSkillCallable(value, ctx)
    } else if (Array.isArray(value)) {
      // 值是 Skill 名称数组 → 每个都包装
      resolved[key] = value.map(v =>
        typeof v === 'string' ? createSkillCallable(v, ctx) : v
      )
    }
  }

  return resolved
}

/** 获取所有可用的系统函数名（供文档/调试用） */
export function listSystemFunctions(): Array<{ name: string; description: string }> {
  return SYSTEM_FUNCTIONS.map(f => ({ name: f.name, description: f.description }))
}
