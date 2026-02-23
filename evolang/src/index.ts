// ═══════════════════════════════════════════════════════════════
// evolang/src/index.ts — 公开 API
// ═══════════════════════════════════════════════════════════════

// 类型
export type {
  // 指令集
  SkillMeta, SkillExecutor, RegisteredSkill, SkillContext, PipelineStep, JSONSchema,
  // 进程
  RunEvent, RunInput, AgentOptions,
  // CPU 接口
  LLMProvider, LLMMessage, LLMEvent, LLMOptions, ContentBlock, ToolDefinition, SkillOutput,
  // 记忆子系统
  StorageBackend, MemoryManager, MemoryEntry,
  // 其他
  PromptCompiler, ContextBudget, Logger,
  // 校验
  ValidationViolation, ValidationReport,
  // 意图识别
  IntentResult,
  // Registry 接口
  SkillRegistry,
} from './types'

// 类
export { Agent } from './agent'
export { SkillRegistryImpl } from './registry'
export { SkillContextImpl } from './context'

// 工具
export { loadSkillsFromDir } from './loader'
export { validateSchema, formatReportForLLM, extractJSON } from './validator'
export { executePipeline } from './pipeline'

// 系统内置函数
export type { ResolverContext, ScriptResolveConfig, SkillResolveConfig, ResolveValue } from './system-functions'
export { resolveInputs, resolveOutputs, resolveSystemFunction, listSystemFunctions } from './system-functions'

// 异常
export {
  SkillNotFoundError, SkillDepthError,
  SkillValidationError, SkillTimeoutError,
} from './errors'
