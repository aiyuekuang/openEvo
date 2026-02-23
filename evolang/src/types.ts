// ═══════════════════════════════════════════════════════════════
// evolang/src/types.ts — EvoLang 所有核心类型定义
// ═══════════════════════════════════════════════════════════════

// ─── 基础类型 ───

export type JSONSchema = Record<string, unknown>

// ─── CPU 接口 — LLMProvider ───

export interface LLMProvider {
  chat(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<LLMEvent>

  chatWithTools(
    messages: LLMMessage[],
    options: LLMOptions & { tools: ToolDefinition[] },
    skillExecutor: (name: string, input: Record<string, unknown>) => Promise<SkillOutput>,
  ): AsyncGenerator<LLMEvent>
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface LLMOptions {
  model: string
  providerId: string
  maxTokens?: number
  temperature?: number
}

export interface LLMEvent {
  type: 'token' | 'done' | 'error' | 'tool_call'
  content?: string
  fullResponse?: string
  error?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
}

export interface SkillOutput {
  output: Record<string, unknown>
  isError?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// ─── 固件加载器 — PromptCompiler ───

export interface PromptCompiler {
  compile(ctx: {
    skills: ToolDefinition[]
    env: Record<string, unknown>
    scratch: Map<string, unknown>
    memory?: {
      longTerm: string
      dailyLog: string
    }
    budget?: ContextBudget
  }): string | Promise<string>
}

export interface ContextBudget {
  maxTokens: number
  reservedForResponse: number
  usedByMessage: number
}

// ─── 日志 ───

export interface Logger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

// ─── 记忆子系统 ───

export interface StorageBackend {
  dataDir: string
  embed?: (text: string) => Promise<number[]>
}

export interface MemoryEntry {
  id: string
  text: string
  score: number
  category?: string
  createdAt: number
  metadata?: Record<string, unknown>
}

export interface MemoryManager {
  search(query: string, limit?: number): Promise<MemoryEntry[]>
  store(text: string, category?: string): Promise<{ stored: boolean; reason: string }>
  forget(query: string): Promise<{ deleted: number }>
  appendDailyLog(entry: string): void
  loadDailyLog(dateStr?: string): string
  loadLongTerm(): string
  recall(query: string): Promise<MemoryEntry[]>
  capture(message: string, response: string): Promise<{ captured: number; entries: string[] }>
  registerSkills(registry: SkillRegistry): void
}

// ─── 指令类型 — Skill ───

export interface SkillMeta {
  name: string
  description: string
  category: string
  input: JSONSchema
  output: JSONSchema
  mode: 'code' | 'llm' | 'composite'
  calls: string[]
  pipeline?: PipelineStep[]
  outputMapping?: Record<string, string>
  version: string
  tags: string[]
  author?: string
  timeout: number
  retry: number
  /** Skill 所在目录的绝对路径（loader 自动设置，供 $resolve script 解析相对路径） */
  skillDir?: string
}

export interface PipelineStep {
  step: string
  skill: string
  input: Record<string, unknown>
  condition?: string
  foreach?: string

  // ─── 并行控制 ───

  /**
   * DAG 依赖：列出必须先完成的步骤名。
   * - 有任何步骤声明 depends → 整个 pipeline 切换为 DAG 并行调度
   * - DAG 模式下，未声明 depends 的步骤视为 depends: []（无依赖，立即就绪）
   *   → 用户必须显式声明所有依赖关系，避免隐式推断导致错误
   */
  depends?: string[]

  /**
   * 最大并发数（配合 foreach 使用）
   * - 不设或 1 → foreach 顺序迭代
   * - > 1 → foreach 并行迭代，限制并发数
   * - 0 → 不限并发（等价于 Infinity）
   */
  maxConcurrency?: number

  // ─── 错误处理 ───

  /** 失败时不中断 pipeline（默认 false）。失败步骤结果为 { _error, _failed: true } */
  continueOnError?: boolean
  /** 步骤级重试次数（默认 0，不重试）。所有重试耗尽后再由 continueOnError 决定是否中断 */
  retry?: number
  /** 重试退避基数（毫秒，默认 1000）。实际延迟 = retryDelay × 2^(attempt-1)，上限 30s */
  retryDelay?: number
  /** 步骤级超时（毫秒，每次 attempt 独立计时）。超时视为失败，进入重试或 continueOnError 流程 */
  timeout?: number
}

export type SkillExecutor<TEnv = Record<string, unknown>> = (
  input: Record<string, unknown>,
  ctx: SkillContext<TEnv>,
) => Promise<Record<string, unknown>>

export interface RegisteredSkill<TEnv = Record<string, unknown>> {
  meta: SkillMeta
  execute: SkillExecutor<TEnv>
}

// ─── 执行上下文 — SkillContext ───

export interface SkillContext<TEnv = Record<string, unknown>> {
  memory: MemoryManager
  env: TEnv
  scratch: Map<string, unknown>
  /** Skill 注册表（code 模式 Skill 可用于热加载新 Skill） */
  registry: SkillRegistry
  call<T = Record<string, unknown>>(name: string, input: Record<string, unknown>): Promise<T>
  /** 从目录加载 Skills 并注册到 registry（供热加载使用） */
  loadSkillsFromDir(dir: string): Promise<RegisteredSkill[]>
  llm(options: {
    system?: string
    prompt: string
    model?: string
    providerId?: string
    maxTokens?: number
    temperature?: number
  }): Promise<string>
  emit(event: RunEvent): void
  log(message: string): void
  depth: number
  maxDepth: number
  parentSkill: string | undefined
  taskId: string
}

// ─── 进程类型 — Agent.run() ───

export interface RunEvent {
  type: 'token' | 'skill_call' | 'skill_result' | 'error' | 'done'
      | 'skill_validation_retry'
  timestamp: number
  content?: string
  fullResponse?: string
  skill?: string
  input?: Record<string, unknown>
  depth?: number
  output?: Record<string, unknown>
  duration?: number
  isError?: boolean
  error?: string
  attempt?: number
  maxAttempts?: number
  violations?: number
}

export interface RunInput {
  taskId: string
  message: string
  model?: string
  providerId?: string
  /** 实时事件推送回调 — 绕过 generator yield，立即送达调用方（解决嵌套 Skill 事件缓冲问题） */
  onEvent?: (event: RunEvent) => void
}

export interface AgentOptions<TEnv = Record<string, unknown>> {
  llm: LLMProvider
  storage: StorageBackend
  prompt: PromptCompiler
  logger?: Logger
  createEnv?: (input: RunInput) => TEnv | Promise<TEnv>
  maxDepth?: number
  maxLLMRounds?: number
  memoryOptions?: {
    autoRecall?: boolean
    autoCapture?: boolean
    deduplicationThreshold?: number
  }
  validation?: {
    maxInputRetries?: number
    maxOutputRetries?: number
    fallbackStrategy?: 'throw' | 'return_raw' | 'return_partial'
  }
  intentRecognition?: boolean
  beforeSkills?: string[]
  afterSkills?: string[]
}

// ─── 校验报告 ───

export interface ValidationViolation {
  path: string
  rule: 'type' | 'required' | 'enum' | 'minimum' | 'maximum'
       | 'minLength' | 'maxLength' | 'pattern' | 'format'
  expected: string
  actual: unknown
  suggestion: string
}

export interface ValidationReport {
  skillName: string
  direction: 'input' | 'output'
  attempt: number
  maxAttempts: number
  violations: ValidationViolation[]
}

// ─── 意图识别结果 ───

export interface IntentResult {
  intents: Array<{
    name: string
    confidence: number
    description?: string
  }>
  entities: Record<string, unknown>
  routing: {
    strategy: 'direct_answer' | 'single_skill' | 'multi_skill' | 'pipeline' | 'clarify'
    skills?: Array<{
      name: string
      input?: Record<string, unknown>
      reason: string
    }>
    direct_response?: string
    clarification?: string
  }
}

// ─── 前向引用（避免循环依赖） ───

export interface SkillRegistry {
  register(skill: RegisteredSkill<any>): void
  unregister(name: string): void
  get(name: string): RegisteredSkill<any> | undefined
  has(name: string): boolean
  list(): RegisteredSkill<any>[]
  listByCategory(category: string): RegisteredSkill<any>[]
  readonly size: number
  toToolDefinitions(): ToolDefinition[]
}
