// ═══════════════════════════════════════════════════════════════
// evolang/src/agent.ts — Agent 运行时（操作系统）
//
// Agent 只负责：
//   1. 管理 Skill 注册表
//   2. 管理执行生命周期（记忆预取 → LLM 循环 → 回写）
//   3. 提供校验自修复机制（Gate 1 + Gate 2）—— 语言核心能力
//
// Agent 不负责：
//   - 业务逻辑路由（由 LLM 或 Skill 自行决定）
//
// 语言内置行为：
//   - intent_recognize 是语言层固定的第一个 Skill 调用（若已注册）
// ═══════════════════════════════════════════════════════════════

import type {
  AgentOptions, RunInput, RunEvent, RegisteredSkill,
  SkillOutput, SkillRegistry, LLMMessage, IntentResult,
  MemoryManager, ValidationReport, ToolDefinition,
} from './types'
import { SkillRegistryImpl } from './registry'
import { SkillContextImpl } from './context'
import { loadSkillsFromDir } from './loader'
import {
  validateSchema, formatReportForLLM,
  validatePipelineInterface, buildFieldMapping, applyFieldMapping,
  resolvePipelineInput,
} from './validator'
import type { ResolverContext } from './system-functions'

export class Agent<TEnv = Record<string, unknown>> {
  private registry: SkillRegistryImpl = new SkillRegistryImpl()
  // TODO Phase 2: private memoryManager: MemoryManager

  constructor(private options: AgentOptions<TEnv>) {
    // TODO Phase 2: 内核初始化记忆子系统
    // this.memoryManager = new MemoryManagerImpl(options.storage, options.memoryOptions)
    // this.memoryManager.registerSkills(this.registry)
  }

  /** 安装指令（业务 Skill） */
  register(skill: RegisteredSkill<TEnv>): void {
    this.registry.register(skill)
  }

  /** 从目录批量加载业务指令集 */
  async loadSkills(dir: string): Promise<void> {
    const skills = await loadSkillsFromDir<TEnv>(dir)
    for (const skill of skills) this.registry.register(skill)
  }

  /**
   * 三层加载：按优先级从低到高依次加载，同名 Skill 后者覆盖前者
   * @param dirs 目录数组，索引越大优先级越高（如 [builtin, project, user]）
   * @returns 每层加载的 Skill 名称
   */
  async loadSkillsLayered(dirs: string[]): Promise<{ layer: string; skills: string[] }[]> {
    const result: { layer: string; skills: string[] }[] = []
    for (const dir of dirs) {
      const skills = await loadSkillsFromDir<TEnv>(dir)
      const names: string[] = []
      for (const skill of skills) {
        this.registry.register(skill)
        names.push(skill.meta.name)
      }
      result.push({ layer: dir, skills: names })
    }
    return result
  }

  /** 获取 SkillRegistry */
  getRegistry(): SkillRegistry {
    return this.registry
  }

  /**
   * 执行一个进程
   *
   * 生命周期：
   *   1. 创建环境 + 记忆预取
   *   2. intent_recognize（语言层固定，若已注册）
   *   3. beforeSkills（用户自定义的前置 Skill）
   *   4. 编译 system prompt
   *   5. chatWithTools 循环（含 Gate 1 输入校验自修复）
   *   6. afterSkills
   *   7. 回写 + 进程退出
   *
   * 校验自修复是语言机制，内置于此。
   * 意图识别是语言层固定行为，始终第一个执行。
   */
  async *run(input: RunInput): AsyncGenerator<RunEvent> {
    const events: RunEvent[] = []
    // 实时推送标记 — 已通过 onEvent 推送的事件不再通过 generator yield
    const realTimeSent = new WeakSet<RunEvent>()
    const emit = (e: RunEvent) => {
      events.push(e)
      // 如果提供了实时回调，立即推送（不等 generator yield）
      if (input.onEvent) {
        input.onEvent(e)
        realTimeSent.add(e)
      }
    }
    const logger = this.options.logger || console as any

    // 1. 创建环境
    const env = this.options.createEnv
      ? await this.options.createEnv(input)
      : ({} as TEnv)
    const scratch = new Map<string, unknown>()

    const defaultModel = {
      model: input.model || '',
      providerId: input.providerId || '',
    }

    // 临时 MemoryManager stub（Phase 2 替换）
    const memoryStub = createMemoryStub()

    // ═══ 构建系统函数解析上下文 ═══
    // Skill 在 skill.json 中用 $resolve 声明的参数，由此上下文自动填充
    // callSkill 在 ctx 创建后设置（因为需要 ctx.call）
    const resolverCtx: ResolverContext = {
      input,
      registry: this.registry,
      env: env as Record<string, unknown>,
      scratch,
    }

    const ctx = new SkillContextImpl<TEnv>(
      this.registry, memoryStub, env, scratch, emit, logger,
      this.options.llm, defaultModel,
      0, this.options.maxDepth || 10, undefined, input.taskId,
      resolverCtx,
    )

    // 注入 callSkill — 使 $resolve 支持 { type: "skill" } 和 $skill:xxx
    resolverCtx.callSkill = ctx.call.bind(ctx)

    // ═══ 记忆预取 — 系统级记忆检索 ═══
    // 在所有 Skill 执行前统一检索相关记忆，结果存入 env.relevantMemories
    // 所有 Skill 通过 $resolve: "memory.relevantMemories" 共享此数据
    if (this.registry.has('memory_search')) {
      try {
        const memories = await ctx.call<Record<string, unknown>>('memory_search', {
          query: input.message,
        })
        ;(env as Record<string, unknown>).relevantMemories = memories
        logger.info('[Agent] 记忆预取完成:', JSON.stringify(memories).slice(0, 200))
      } catch (err) {
        logger.warn('[Agent] 记忆预取失败（跳过）:', err)
        ;(env as Record<string, unknown>).relevantMemories = ''
      }
    }

    // 2. intent_recognize — 语言层固定的第一个 Skill（含置信分阈值重试）
    //    message、available_skills、relevant_memories 均由 $resolve 自动注入
    const INTENT_CONFIDENCE_THRESHOLD = 0.6
    if (this.registry.has('intent_recognize')) {
      try {
        let intentResult = await ctx.call<Record<string, unknown>>('intent_recognize', {})
        const topConfidence = getTopConfidence(intentResult)
        const strategy = getStrategy(intentResult)

        // 置信分不足且不是 clarify 策略 → 重试一次
        if (topConfidence < INTENT_CONFIDENCE_THRESHOLD && strategy !== 'clarify') {
          logger.info(`[Agent] intent_recognize 置信分 ${topConfidence.toFixed(2)} < ${INTENT_CONFIDENCE_THRESHOLD}，重试...`)
          intentResult = await ctx.call<Record<string, unknown>>('intent_recognize', {
            retry_feedback: `上次结果置信分仅 ${topConfidence.toFixed(2)}，最高意图: ${getTopIntentName(intentResult)}。请重新仔细分析用户输入 "${input.message}"，给出更准确的判断。如果确实无法确定，请使用 clarify 策略。`,
          })
          const retryConfidence = getTopConfidence(intentResult)
          logger.info(`[Agent] intent_recognize 重试结果: 置信分 ${retryConfidence.toFixed(2)}`)
        }

        scratch.set('intent', intentResult)
        logger.info('[Agent] intent_recognize 完成:', JSON.stringify(intentResult))
      } catch (err) {
        logger.warn('[Agent] intent_recognize 失败（跳过）:', err)
      }
      for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }
    }

    // 2.5 ═══ 路由执行 — 根据 intent_recognize 的 routing 结果分发 ═══
    //
    // intent_recognize 只做分类和路由，不执行。Agent 负责根据路由结果：
    //   - direct_answer → 短路返回（无需 LLM 循环）
    //   - clarify → 短路返回追问
    //   - single_skill / multi_skill / pipeline → 执行路由到的 Skill，结果注入后续 LLM 上下文
    //
    const intentResult = scratch.get('intent') as Record<string, unknown> | undefined
    if (intentResult) {
      const routing = intentResult.routing as IntentResult['routing'] | undefined

      // 诊断日志 — 确认路由结构
      logger.info(`[Agent] 路由检查: routing=${routing ? JSON.stringify(routing).slice(0, 200) : 'undefined'}, keys=${Object.keys(intentResult).join(',')}`)

      if (!routing) {
        logger.warn('[Agent] intent_recognize 输出无 routing 字段，跳过路由执行')
      }

      if (routing) {
        const strategy = routing.strategy
        const direct_response = routing.direct_response
        const clarification = routing.clarification
        // 防御性处理：skills 可能在 routing 内部，也可能被 LLM 放在顶层
        const routedSkills = routing.skills
          || (intentResult.skills as IntentResult['routing']['skills'])
          || undefined

        logger.info(`[Agent] 路由策略: ${strategy}, skills=${routedSkills?.length ?? 0}个`)

        // ── direct_answer: 简单问候/闲聊/常识 → 直接返回 ──
        if (strategy === 'direct_answer' && direct_response) {
          logger.info(`[Agent] direct_answer 短路返回`)
          yield { type: 'token', content: direct_response, fullResponse: direct_response, timestamp: Date.now() }
          yield { type: 'done', fullResponse: direct_response, timestamp: Date.now() }
          return
        }

        // ── clarify: 意图模糊 → 追问用户 ──
        if (strategy === 'clarify' && clarification) {
          logger.info(`[Agent] clarify 短路返回`)
          yield { type: 'token', content: clarification, fullResponse: clarification, timestamp: Date.now() }
          yield { type: 'done', fullResponse: clarification, timestamp: Date.now() }
          return
        }

        // ── 执行路由到的 Skills ──
        if (routedSkills?.length) {
          const routingResults: Array<{ name: string; result: unknown; error?: string }> = []

          if (strategy === 'multi_skill' && routedSkills.length > 1) {
            // ── multi_skill: 各 Skill 无数据依赖 → 并行执行 ──
            logger.info(`[Agent] 并行执行路由 Skills: ${routedSkills.map(s => s.name).join(' + ')}`)

            const results = await Promise.all(routedSkills.map(async (skillRoute) => {
              try {
                logger.info(`[Agent] 路由执行 → ${skillRoute.name}(${JSON.stringify(skillRoute.input || {}).slice(0, 100)})`)
                const result = await ctx.call(skillRoute.name, skillRoute.input || {})
                logger.info(`[Agent] 路由执行 ${skillRoute.name} 完成`)
                return { name: skillRoute.name, result } as { name: string; result: unknown; error?: string }
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                logger.warn(`[Agent] 路由执行 ${skillRoute.name} 失败:`, err)
                return { name: skillRoute.name, result: null, error: errorMsg }
              }
            }))
            routingResults.push(...results)
            for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }
          } else {
            // ── single_skill / pipeline: 串行执行（pipeline 有数据依赖） ──
            logger.info(`[Agent] 串行执行路由 Skills: ${routedSkills.map(s => s.name).join(' → ')}`)
            let prevResult: unknown = null
            let prevSkillName: string | null = null

            for (const skillRoute of routedSkills) {
              try {
                let skillInput: Record<string, unknown>
                if (strategy === 'pipeline' && prevResult && typeof prevResult === 'object') {
                  // ═══ Gate 3: 深度字段提取 + 接口映射 ═══
                  // 先用 resolvePipelineInput 从上游输出中智能提取下游需要的字段
                  // 然后用 Gate 3 名称映射补充遗漏字段
                  const downstreamSkill = this.registry.get(skillRoute.name)
                  if (downstreamSkill) {
                    skillInput = resolvePipelineInput(
                      prevResult as Record<string, unknown>,
                      downstreamSkill.meta.input,
                    )
                    logger.info(`[Agent] Pipeline 深度提取 (${prevSkillName} → ${skillRoute.name}): ${JSON.stringify(skillInput).slice(0, 200)}`)

                    // 补充：Gate 3 名称映射（处理 resolvePipelineInput 未覆盖的情况）
                    const upstreamSkill = prevSkillName ? this.registry.get(prevSkillName) : null
                    if (upstreamSkill) {
                      const mismatches = validatePipelineInterface(upstreamSkill.meta.output, downstreamSkill.meta.input)
                      if (mismatches.length > 0) {
                        const mapping = buildFieldMapping(mismatches)
                        if (Object.keys(mapping).length > 0) {
                          skillInput = applyFieldMapping(skillInput, mapping)
                        }
                      }
                    }
                  } else {
                    skillInput = { ...(prevResult as Record<string, unknown>) }
                  }
                } else {
                  skillInput = (skillRoute.input || {}) as Record<string, unknown>
                }

                logger.info(`[Agent] 路由执行 → ${skillRoute.name}(${JSON.stringify(skillInput).slice(0, 100)})`)
                const result = await ctx.call(skillRoute.name, skillInput)
                routingResults.push({ name: skillRoute.name, result })
                prevResult = result
                prevSkillName = skillRoute.name
                logger.info(`[Agent] 路由执行 ${skillRoute.name} 完成`)
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                routingResults.push({ name: skillRoute.name, result: null, error: errorMsg })
                logger.warn(`[Agent] 路由执行 ${skillRoute.name} 失败:`, err)
                // pipeline 中一步失败，后续步骤仍可尝试（prevResult 保持上一个成功的结果）
              }
              for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }
            }
          }

          scratch.set('routingResults', routingResults)
          logger.info(`[Agent] 路由执行完成，${routingResults.filter(r => !r.error).length}/${routingResults.length} 成功`)

          // ═══ 二次路由：task_planner 开发新 Skills 后，重新路由执行 ═══
          // task_planner 只负责规划和开发 Skills，不执行。
          // 当 task_planner 返回 ready=true 时，新 Skills 已热加载到注册表。
          // 重新运行 intent_recognize，让它基于更新后的 Skill 列表重新路由。
          const plannerResult = routingResults.find(r =>
            r.name === 'task_planner' && !r.error &&
            (r.result as Record<string, unknown>)?.ready === true
          )
          if (plannerResult && this.registry.has('intent_recognize')) {
            logger.info('[Agent] task_planner 已就绪，启动二次路由...')
            try {
              const secondIntent = await ctx.call<Record<string, unknown>>('intent_recognize', {})
              const secondRouting = (secondIntent as Record<string, unknown>)?.routing as IntentResult['routing'] | undefined
              for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }

              const secondSkills = secondRouting?.skills
              if (secondRouting && secondSkills?.length && secondRouting.strategy !== 'clarify' && secondRouting.strategy !== 'direct_answer') {
                logger.info(`[Agent] 二次路由: ${secondRouting.strategy}, skills=${secondSkills.map(s => s.name).join(' → ')}`)

                const secondResults: Array<{ name: string; result: unknown; error?: string }> = []
                let prevResult2: unknown = null
                let prevSkillName2: string | null = null

                for (const skillRoute of secondSkills) {
                  // 跳过 task_planner 自身，避免无限循环
                  if (skillRoute.name === 'task_planner') continue

                  try {
                    let skillInput: Record<string, unknown>
                    if (secondRouting.strategy === 'pipeline' && prevResult2 && typeof prevResult2 === 'object') {
                      // ═══ 深度字段提取 + Gate 3 接口映射（与一次路由一致） ═══
                      const downSkill = this.registry.get(skillRoute.name)
                      if (downSkill) {
                        skillInput = resolvePipelineInput(
                          prevResult2 as Record<string, unknown>,
                          downSkill.meta.input,
                        )
                        logger.info(`[Agent] 二次路由深度提取 (${prevSkillName2} → ${skillRoute.name}): ${JSON.stringify(skillInput).slice(0, 200)}`)

                        // 补充：Gate 3 名称映射
                        const upSkill = prevSkillName2 ? this.registry.get(prevSkillName2) : null
                        if (upSkill) {
                          const mismatches = validatePipelineInterface(upSkill.meta.output, downSkill.meta.input)
                          if (mismatches.length > 0) {
                            const mapping = buildFieldMapping(mismatches)
                            if (Object.keys(mapping).length > 0) {
                              logger.info(`[Agent] 二次路由字段映射 (${prevSkillName2} → ${skillRoute.name}): ${JSON.stringify(mapping)}`)
                              skillInput = applyFieldMapping(skillInput, mapping)
                            }
                          }
                        }
                      } else {
                        skillInput = { ...(prevResult2 as Record<string, unknown>) }
                      }
                    } else {
                      skillInput = (skillRoute.input || {}) as Record<string, unknown>
                    }

                    logger.info(`[Agent] 二次路由执行 → ${skillRoute.name}(${JSON.stringify(skillInput).slice(0, 100)})`)
                    const result = await ctx.call(skillRoute.name, skillInput)
                    secondResults.push({ name: skillRoute.name, result })
                    prevResult2 = result
                    prevSkillName2 = skillRoute.name
                    logger.info(`[Agent] 二次路由执行 ${skillRoute.name} 完成`)
                  } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err)
                    secondResults.push({ name: skillRoute.name, result: null, error: errorMsg })
                    logger.warn(`[Agent] 二次路由执行 ${skillRoute.name} 失败:`, err)
                  }
                  for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }
                }

                if (secondResults.length > 0) {
                  // 用二次路由结果替换（或追加）原始路由结果
                  routingResults.push(...secondResults)
                  scratch.set('routingResults', routingResults)
                  logger.info(`[Agent] 二次路由完成，${secondResults.filter(r => !r.error).length}/${secondResults.length} 成功`)
                }
              } else {
                logger.info('[Agent] 二次路由未产生新的 Skill 执行计划')
              }
            } catch (err) {
              logger.warn('[Agent] 二次路由失败（跳过）:', err)
            }
          }
        } else {
          logger.warn(`[Agent] 路由策略 ${strategy} 但无 skills 列表，跳过`)
        }
      }
    } else {
      logger.info('[Agent] 无 intent 结果，跳过路由执行')
    }

    // 3. beforeSkills — 用户自定义的前置 Skill
    //    参数由各 Skill 的 $resolve 声明自动注入
    for (const name of this.options.beforeSkills || []) {
      if (name === 'intent_recognize') continue // 已在上一步固定执行，跳过
      if (this.registry.has(name)) {
        try {
          const result = await ctx.call(name, {})
          scratch.set(`beforeSkill:${name}`, result)
        } catch (err) {
          logger.warn(`[Agent] beforeSkill ${name} failed:`, err)
        }
      }
    }
    for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }

    // 4. 编译 system prompt
    const systemPrompt = await this.options.prompt.compile({
      skills: this.registry.toToolDefinitions(),
      env: env as Record<string, unknown>,
      scratch,
    })

    // 5. ═══ chatWithTools 循环（语言核心 — 含 Gate 1 校验自修复） ═══
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.message },
    ]

    // 注入路由执行结果到 LLM 上下文 — 让 LLM 基于 Skill 结果回答用户
    const routingResults = scratch.get('routingResults') as Array<{ name: string; result: unknown; error?: string }> | undefined
    if (routingResults?.length) {
      const resultsText = routingResults.map(r => {
        if (r.error) return `**${r.name}** 执行失败: ${r.error}`
        return `**${r.name}** 执行结果:\n${JSON.stringify(r.result, null, 2)}`
      }).join('\n\n')

      messages.push({
        role: 'user',
        content: `[系统消息] 以下 Skill 已根据意图分析自动执行完成，请基于这些结果回答我的问题:\n\n${resultsText}`,
      })
    }

    let finalResponse = ''
    const hasSuccessfulRouting = routingResults?.some(r => !r.error)

    if (hasSuccessfulRouting) {
      // ═══ 路由已成功 → 用 chat()（无 tools）总结结果 ═══
      // 路由 Skills 已执行完毕，LLM 只需基于结果回答用户
      // 不发送 tool 定义，兼容不支持 function calling 的模型
      try {
        for await (const llmEvent of this.options.llm.chat(
          messages,
          { model: input.model || '', providerId: input.providerId || '' },
        )) {
          for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }

          if (llmEvent.type === 'token') {
            finalResponse = llmEvent.fullResponse || ''
            yield {
              type: 'token', content: llmEvent.content,
              fullResponse: llmEvent.fullResponse, timestamp: Date.now(),
            }
          } else if (llmEvent.type === 'error') {
            yield { type: 'error', error: llmEvent.error, timestamp: Date.now() }
            return
          } else if (llmEvent.type === 'done') {
            finalResponse = llmEvent.fullResponse || finalResponse
          }
        }
      } catch (chatErr) {
        // chat() 也失败 → 直接使用路由结果降级
        finalResponse = composeFallbackFromRouting(routingResults!)
        logger.warn(`[Agent] chat() 总结失败，使用路由结果降级: ${(chatErr as Error).message}`)
        yield { type: 'token', content: finalResponse, fullResponse: finalResponse, timestamp: Date.now() }
      }
    } else {
      // ═══ 无路由结果 → chatWithTools 循环（语言核心 — 含 Gate 1 校验自修复） ═══
      // skillExecutor — 带 Gate 1 输入校验自修复
      const skillExecutor = async (name: string, args: Record<string, unknown>): Promise<SkillOutput> => {
        const skill = this.registry.get(name)
        if (!skill) {
          return { output: { error: `未知 Skill: ${name}` }, isError: true }
        }

        // ═══ Gate 1: 输入校验 ═══
        const inputViolations = validateSchema(args, skill.meta.input)
        if (inputViolations.length > 0) {
          const report: ValidationReport = {
            skillName: name, direction: 'input',
            attempt: 1,
            maxAttempts: this.options.validation?.maxInputRetries || 3,
            violations: inputViolations,
          }
          return {
            output: {
              error: 'input_validation_failed',
              message: formatReportForLLM(report),
            },
            isError: true,
          }
        }

        try {
          const output = await ctx.call(name, args)
          return { output }
        } catch (err) {
          return {
            output: { error: err instanceof Error ? err.message : String(err) },
            isError: true,
          }
        }
      }

      for await (const llmEvent of this.options.llm.chatWithTools(
        messages,
        { model: input.model || '', providerId: input.providerId || '', tools: this.registry.toToolDefinitions() },
        skillExecutor,
      )) {
        for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }

        if (llmEvent.type === 'token') {
          finalResponse = llmEvent.fullResponse || ''
          yield {
            type: 'token', content: llmEvent.content,
            fullResponse: llmEvent.fullResponse, timestamp: Date.now(),
          }
        } else if (llmEvent.type === 'error') {
          yield { type: 'error', error: llmEvent.error, timestamp: Date.now() }
          return
        } else if (llmEvent.type === 'done') {
          finalResponse = llmEvent.fullResponse || finalResponse
        }
      }
    }

    scratch.set('finalResponse', finalResponse)

    // 6. afterSkills
    for (const name of this.options.afterSkills || []) {
      if (this.registry.has(name)) {
        try {
          await ctx.call(name, { message: input.message, response: finalResponse })
        } catch (err) {
          logger.warn(`[Agent] afterSkill ${name} failed:`, err)
        }
      }
    }
    for (const e of events.splice(0)) { if (!realTimeSent.has(e)) yield e }

    // ═══ 回写 ═══
    // TODO Phase 2: memoryManager.capture(input.message, finalResponse)

    // 7. 进程退出
    yield { type: 'done', fullResponse: finalResponse, timestamp: Date.now() }
  }
}

// ─── intent_recognize 置信分提取辅助函数 ───

function getTopConfidence(result: Record<string, unknown>): number {
  const intents = result?.intents as Array<{ confidence?: number }> | undefined
  if (!intents?.length) return 0
  return intents[0].confidence ?? 0
}

function getTopIntentName(result: Record<string, unknown>): string {
  const intents = result?.intents as Array<{ name?: string }> | undefined
  if (!intents?.length) return 'unknown'
  return intents[0].name ?? 'unknown'
}

function getStrategy(result: Record<string, unknown>): string {
  const routing = result?.routing as { strategy?: string } | undefined
  return routing?.strategy ?? ''
}

// ─── chatWithTools 降级响应组合 ───

/**
 * 从路由执行结果中提取最终响应文本
 * 优先使用最后一个成功步骤的 formatted_text / summary / text 等文本字段
 * 否则 JSON 序列化最后一个结果
 */
function composeFallbackFromRouting(
  routingResults: Array<{ name: string; result: unknown; error?: string }>,
): string {
  const successResults = routingResults.filter(r => !r.error)
  if (successResults.length === 0) return '所有路由步骤均失败'

  // 取最后一个成功的结果（pipeline 的最终输出）
  const last = successResults[successResults.length - 1]
  const obj = last.result as Record<string, unknown> | null

  if (obj && typeof obj === 'object') {
    // 优先使用人类可读的文本字段
    for (const key of ['formatted_text', 'summary', 'text', 'content', 'result', 'message']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).length > 0) {
        return obj[key] as string
      }
    }
    return JSON.stringify(obj, null, 2)
  }

  return String(last.result)
}

// ─── 临时 MemoryManager Stub（Phase 2 替换） ───

function createMemoryStub(): MemoryManager {
  return {
    async search() { return [] },
    async store() { return { stored: false, reason: 'Memory not implemented yet' } },
    async forget() { return { deleted: 0 } },
    appendDailyLog() {},
    loadDailyLog() { return '' },
    loadLongTerm() { return '' },
    async recall() { return [] },
    async capture() { return { captured: 0, entries: [] } },
    registerSkills() {},
  }
}
