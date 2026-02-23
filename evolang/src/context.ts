// ═══════════════════════════════════════════════════════════════
// evolang/src/context.ts — SkillContextImpl 执行上下文
// ═══════════════════════════════════════════════════════════════

import type {
  SkillContext,
  SkillRegistry,
  MemoryManager,
  RunEvent,
  Logger,
  LLMProvider,
  LLMMessage,
  RegisteredSkill,
} from './types'
import { validateSchema } from './validator'
import { SkillNotFoundError, SkillDepthError, SkillValidationError } from './errors'
import { resolveInputs, resolveOutputs, type ResolverContext } from './system-functions'
import { loadSkillsFromDir as _loadSkillsFromDir } from './loader'

export class SkillContextImpl<TEnv> implements SkillContext<TEnv> {
  constructor(
    public registry: SkillRegistry,
    public memory: MemoryManager,
    public env: TEnv,
    public scratch: Map<string, unknown>,
    private _emit: (event: RunEvent) => void,
    private _logger: Logger,
    private _llm: LLMProvider,
    private _defaultModel: { model: string; providerId: string },
    public depth: number,
    public maxDepth: number,
    public parentSkill: string | undefined,
    public taskId: string,
    private _resolverCtx?: ResolverContext,
  ) {}

  async call<T = Record<string, unknown>>(name: string, input: Record<string, unknown>): Promise<T> {
    if (this.depth >= this.maxDepth) {
      throw new SkillDepthError(name, this.depth, this.maxDepth)
    }

    const skill = this.registry.get(name)
    if (!skill) throw new SkillNotFoundError(name)

    // ═══ 系统函数自动注入 ═══
    // 根据 skill.meta.input 中的 $resolve 声明，自动填充未提供的参数
    let resolvedInput = input
    if (this._resolverCtx) {
      resolvedInput = await resolveInputs(skill.meta.input, input, this._resolverCtx, skill.meta.skillDir)
    }

    // ═══ Gate 1: 输入校验 ═══
    const inputViolations = validateSchema(resolvedInput, skill.meta.input)
    if (inputViolations.length > 0) {
      throw new SkillValidationError(name, 'input', inputViolations, `Skill "${name}" 输入校验失败`)
    }

    const startTime = Date.now()
    this._emit({
      type: 'skill_call', skill: name, input: resolvedInput,
      depth: this.depth + 1, timestamp: startTime,
    })

    // fork 子上下文（新栈帧）— memory 共享，ResolverContext 也继承
    const childCtx = new SkillContextImpl<TEnv>(
      this.registry, this.memory, this.env, this.scratch,
      this._emit, this._logger, this._llm, this._defaultModel,
      this.depth + 1, this.maxDepth, name, this.taskId,
      this._resolverCtx,
    )

    // 执行（LLM 模式内部已有 Gate 2 自修复循环）
    let output = await skill.execute(resolvedInput, childCtx)

    // ═══ Gate 2: 输出校验（仅 code 模式直接报错） ═══
    if (skill.meta.mode === 'code') {
      const outputViolations = validateSchema(output, skill.meta.output)
      if (outputViolations.length > 0) {
        throw new SkillValidationError(name, 'output', outputViolations,
          `Skill "${name}" 输出校验失败（code 模式）`)
      }
    }

    // ═══ 输出后处理: $returnSkill → 可调用 Skill 包装 ═══
    if (this._resolverCtx) {
      output = resolveOutputs(skill.meta.output, output, this._resolverCtx)
    }

    const duration = Date.now() - startTime
    this._emit({
      type: 'skill_result', skill: name, output,
      duration, timestamp: Date.now(),
    })

    return output as T
  }

  async llm(options: {
    system?: string
    prompt: string
    model?: string
    providerId?: string
    maxTokens?: number
    temperature?: number
  }): Promise<string> {
    const messages: LLMMessage[] = []
    if (options.system) messages.push({ role: 'system', content: options.system })
    messages.push({ role: 'user', content: options.prompt })

    let result = ''
    for await (const event of this._llm.chat(messages, {
      model: options.model || this._defaultModel.model,
      providerId: options.providerId || this._defaultModel.providerId,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    })) {
      if (event.type === 'done') result = event.fullResponse || ''
      if (event.type === 'error') throw new Error(event.error)
    }
    return result
  }

  emit(event: RunEvent): void {
    this._emit(event)
  }

  async loadSkillsFromDir(dir: string): Promise<RegisteredSkill[]> {
    return _loadSkillsFromDir(dir)
  }

  log(message: string): void {
    this._logger.info(`[Skill:${this.parentSkill || 'root'}:d${this.depth}] ${message}`)
  }
}
