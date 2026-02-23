# 执行器改造分析

> 对照 EvoLang 语言规范，逐项分析现有执行器的差距和改造方案。

---

## 1. 现状：执行器长什么样

现在的"执行器"就是 `ipc.ts` 里的 `task:create` handler——一个 170 行的 IPC 回调函数。所有逻辑全部写在这一个函数里：

```
ipc.ts → task:create（170 行，承担了全部职责）
│
├── 解析 provider + model          ← 应该是 Agent 的职责
├── autoRecall(message)            ← 应该是前置 Skill
├── buildSystemPrompt()            ← 应该是 Agent.compilePrompt()
├── 构建 messages 数组              ← 应该是 Session 的职责
├── appendTranscript()             ← 应该是 Session 的职责
├── 定义 toolExecutor 闭包         ← 应该是 SkillContext.execute()
│   ├── sender.send('tool_call')   ← 混入了 IPC 通信
│   ├── appendTranscript()         ← 混入了持久化
│   ├── toolRegistry.execute()     ← 实际执行
│   ├── sender.send('tool_result') ← 混入了 IPC 通信
│   └── appendTranscript()         ← 混入了持久化
├── llmClient.chatWithTools()      ← LLM 循环
├── 流式事件 → sender.send()       ← 混入了 IPC 通信
├── appendTranscript()             ← 混入了持久化
├── appendToDailyLog()             ← 混入了持久化
├── processAutoSave()              ← 应该是后置 Skill
└── autoCapture()                  ← 应该是后置 Skill
```

### 问题一览

| # | 问题 | 现状 | EvoLang 要求 |
|---|------|------|-------------|
| 1 | **没有 Agent 对象** | 逻辑散落在 ipc.ts 中 | Agent 是顶层容器，持有 ctx + skills |
| 2 | **没有 Context** | memory/config/session 通过散装 import 访问 | 统一的 `ctx` 对象，三级作用域 |
| 3 | **没有 SkillContext** | toolExecutor 是临时闭包，捕获 sender/taskId | Skill 通过 `ctx.call()` / `ctx.llm()` 交互 |
| 4 | **Skill 不能调 Skill** | 只有 LLM 能触发 tool call | `ctx.call('memory_search', input)` 直接调用 |
| 5 | **没有 output schema** | ToolResult 只有 string content | 每个 Skill 有类型化的 output |
| 6 | **没有输入校验** | ToolCall.arguments 直接传给 executor | input schema 运行时校验 |
| 7 | **没有深度控制** | 无递归保护 | depth 计数器，最大 10 层 |
| 8 | **IPC 和执行混在一起** | sender.send() 散落在执行逻辑各处 | Agent.run() yield 事件，IPC 层只转发 |
| 9 | **没有 Skill 加载** | 硬编码注册 memory tools | 从 skill.json 文件系统加载 |
| 10 | **前后置 Hook 是硬编码** | autoRecall/autoCapture 直接调用 | 作为 Skill 注册，可配置、可替换 |

---

## 2. 目标：执行器应该长什么样

```
ipc.ts（薄层，只做 IPC 转发）
│
└── agent.run(message)
      │
      ├── 1. 构建 Context 快照
      │     ctx.memory ← loadMemory() + dailyLogs
      │     ctx.config ← activeProvider, model
      │     ctx.session ← messages history
      │     ctx.scratch ← new Map()
      │
      ├── 2. 前置 Skill（可配置）
      │     ctx.call('auto_recall', { query: message })
      │
      ├── 3. 编译 system prompt
      │     agent.compilePrompt(ctx)
      │     → 记忆 + 日志 + relevant-memories + Skill 列表
      │
      ├── 4. LLM 推理循环
      │     ┌──────────────────────────────────────────┐
      │     │ LLM 输出 token → yield { type: 'token' } │
      │     │ LLM 输出 skill_call →                     │
      │     │   validate input against schema            │
      │     │   skill.execute(input, childCtx)           │
      │     │     childCtx.depth = parentCtx.depth + 1   │
      │     │     childCtx.call() → 可递归调用其他 Skill  │
      │     │   validate output against schema           │
      │     │   yield { type: 'skill_call' }             │
      │     │   yield { type: 'skill_result' }           │
      │     │   → 结果返回 LLM，继续推理                  │
      │     └──────────────────────── 最多 N 轮 ─────────┘
      │
      ├── 5. 后置 Skill（可配置）
      │     ctx.call('auto_capture', { message, response })
      │
      ├── 6. 持久化
      │     ctx.session.transcript.append(...)
      │
      └── yield { type: 'done' }
```

---

## 3. 具体改造清单

### 3.1 新建 `agent/types.ts` — 运行时事件

```typescript
/** Agent.run() yield 的事件 */
interface RunEvent {
  type: 'token' | 'skill_call' | 'skill_result' | 'error' | 'done'
  timestamp: number
  // token
  content?: string
  fullResponse?: string
  // skill_call
  skill?: string
  input?: unknown
  depth?: number
  // skill_result
  output?: unknown
  duration?: number
  isError?: boolean
  // error
  error?: string
}
```

这取代现在的 `sender.send('task:stream', ...)` 散落各处的做法。Agent 只 yield 事件，IPC 层决定怎么发给 renderer。

### 3.2 新建 `skills/context.ts` — SkillContext

```typescript
class SkillContextImpl implements SkillContext {
  constructor(
    private registry: SkillRegistry,
    private agentCtx: AgentContext,
    private emitter: (event: RunEvent) => void,
    public depth: number,
    public maxDepth: number,
    public parentSkill: string | undefined,
    public taskId: string,
  ) {}

  // 变量访问
  get memory() { return this.agentCtx.memory }
  get config() { return this.agentCtx.config }
  get session() { return this.agentCtx.session }
  get scratch() { return this.agentCtx.scratch }

  // 调用其他 Skill（核心能力）
  async call<T>(name: string, input: unknown): Promise<T> {
    if (this.depth >= this.maxDepth) {
      throw new SkillDepthError(name, this.depth, this.maxDepth)
    }

    const skill = this.registry.get(name)
    if (!skill) throw new SkillNotFoundError(name)

    // 输入校验
    validate(input, skill.input)

    // 发射 skill_call 事件
    const startTime = Date.now()
    this.emitter({
      type: 'skill_call',
      skill: name,
      input,
      depth: this.depth + 1,
      timestamp: startTime,
    })

    // 创建子 context（深度 +1）
    const childCtx = this.fork(name)

    // 执行
    const output = await skill.execute(input, childCtx)

    // 输出校验
    validate(output, skill.output)

    // 发射 skill_result 事件
    this.emitter({
      type: 'skill_result',
      skill: name,
      output,
      depth: this.depth + 1,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })

    return output as T
  }

  // 调用 LLM（给 mode: 'llm' 的 Skill 用）
  async llm(options: LLMCallOptions): Promise<string> {
    // 复用 llmClient.chat()，但不走 tool 循环
    // ...
  }

  // 创建子 context
  private fork(skillName: string): SkillContext {
    return new SkillContextImpl(
      this.registry,
      this.agentCtx,
      this.emitter,
      this.depth + 1,
      this.maxDepth,
      skillName,
      this.taskId,
    )
  }
}
```

**这解决了现在最大的缺失**：Skill 之间可以通过 `ctx.call()` 互调，每次调用自动递增 depth。

### 3.3 升级 `skills/registry.ts` — 替代 tools/registry.ts

```
现在 ToolRegistry                    升级为 SkillRegistry
──────────────────────────────────────────────────────────
RegisteredTool {                     RegisteredSkill {
  definition: ToolDefinition           definition: SkillDefinition ← 含 input + output schema
  executor: (ToolCall) => ToolResult   execute: (input, ctx) => output ← 接收 SkillContext
  category: string                     category: string
}                                      mode: 'code' | 'llm' | 'composite'
                                     }

execute(toolCall: ToolCall)          execute(name, input, ctx)
  ↓                                    ↓
  直接调 executor(toolCall)             校验 input → 创建子 ctx → skill.execute(input, ctx) → 校验 output
  返回 ToolResult { content: string }   返回类型化的 output 对象

getDefinitions()                     toToolDefinitions()
  → ToolDefinition[]                   → ToolDefinition[]（只传 name + description + input 给 LLM）
```

关键变化：
- executor 的签名从 `(ToolCall) => ToolResult` 变成 `(input, ctx) => output`
- 不再返回 string content，而是返回类型化的对象
- ToolResult 的序列化（对象 → string）推迟到 LLM 交互层

### 3.4 新建 `agent/index.ts` — Agent 类

从 ipc.ts task:create 中抽出的核心逻辑：

```typescript
class Agent {
  private skills: SkillRegistry
  private ctx: AgentContext

  async *run(input: { taskId: string; message: string }): AsyncGenerator<RunEvent> {
    // 1. 准备 scratch
    this.ctx.scratch = new Map()

    // 2. 前置 Skill
    try {
      const memories = await this.callSkill('auto_recall', { query: input.message })
      this.ctx.scratch.set('relevantMemories', memories)
    } catch {}

    // 3. 编译 system prompt
    const systemPrompt = this.compilePrompt()

    // 4. 记录 user 消息
    this.ctx.session.transcript.append(/* user message */)

    // 5. LLM 推理循环
    const skillExecutor = (name: string, args: unknown) => {
      return this.callSkill(name, args)
    }
    for await (const event of this.llmLoop(systemPrompt, input.message, skillExecutor)) {
      yield event
    }

    // 6. 后置 Skill
    try {
      await this.callSkill('auto_capture', {
        message: input.message,
        response: this.ctx.scratch.get('finalResponse'),
      })
    } catch {}

    // 7. 记录 assistant 消息
    this.ctx.session.transcript.append(/* assistant message */)

    yield { type: 'done', fullResponse: this.ctx.scratch.get('finalResponse'), timestamp: Date.now() }
  }
}
```

### 3.5 改造 `ipc.ts` — 变成薄转发层

```typescript
// 之前: 170 行的 task:create handler
// 之后: 10 行

ipcMain.handle('task:create', async (event, taskId, message, providerId, model) => {
  const sender = event.sender

  for await (const runEvent of agent.run({ taskId, message, providerId, model })) {
    sender.send('task:stream', { taskId, ...runEvent })
  }
})
```

IPC 只做一件事：**把 Agent 的 RunEvent 转发给 renderer**。

### 3.6 改造 `llm-client.ts` — 解耦 toolExecutor

```
现在 chatWithTools(messages, options, toolExecutor)
  ↓ toolExecutor 签名是 (ToolCall) → ToolResult
  ↓ 内部直接调用 toolExecutor，混合了 IPC 通信

改为 chatWithTools(messages, options, skillExecutor)
  ↓ skillExecutor 签名是 (name, input) → output
  ↓ 内部：ToolCall → 提取 name + arguments → skillExecutor(name, arguments) → 序列化为 ToolResult
```

变化：
- `toolExecutor` 不再接收底层的 `ToolCall` 对象，而是接收语义化的 `(name, input)`
- LLM client 负责 ToolCall ↔ Skill 之间的格式转换
- 执行器不再关心 Anthropic/OpenAI 的协议差异

### 3.7 Skill 加载器 `skills/loader.ts`

```typescript
async function loadSkills(dir: string): Promise<SkillDefinition[]> {
  // 扫描 dir 下所有 skill.json
  // 每个 skill.json → SkillDefinition
  // mode: 'code' → require(dir + '/index.ts').execute
  // mode: 'llm' → readFile(dir + '/prompt.md') → 生成 execute 包装
  // mode: 'composite' → 解析 pipeline → 生成 execute 包装
}
```

---

## 4. 改造顺序

```
Phase 1: 类型定义（不改现有代码，纯新增）
  ├── skills/types.ts        SkillDefinition, SkillContext, RunEvent
  └── agent/types.ts         AgentContext 接口

Phase 2: SkillRegistry（替代 ToolRegistry，保持兼容）
  └── skills/registry.ts     新 Registry + 兼容层 toToolDefinitions()

Phase 3: SkillContext（核心：ctx.call() 能力）
  └── skills/context.ts      实现 call(), llm(), 变量访问, depth 控制

Phase 4: Agent 类（抽出 ipc.ts 的执行逻辑）
  ├── agent/index.ts         Agent.run() 主循环
  └── agent/context.ts       AgentContext 实现

Phase 5: IPC 瘦身（task:create → 10 行转发）
  └── ipc.ts                 for await (agent.run()) → sender.send()

Phase 6: 迁移现有 Skills（memory tools → skill.json 格式）
  ├── skills/memory/search/skill.json + index.ts
  ├── skills/memory/store/skill.json + index.ts
  └── skills/memory/forget/skill.json + index.ts

Phase 7: Skill 加载器（从文件系统加载 skill.json）
  └── skills/loader.ts
```

**Phase 1-3 是纯新增**，不动现有代码，可以安全做。
**Phase 4-5 是重构**，把 ipc.ts 的逻辑搬到 Agent，IPC 变薄。
**Phase 6-7 是迁移**，现有功能用新格式重新注册。

---

## 5. 关键决策

### Q1: llm-client.ts 要不要改？

**不大改**。`LLMClient` 负责的是 LLM 通信协议（Anthropic/OpenAI 格式转换 + 流式解析），这是底层基础设施。

但需要小改 `chatWithTools` 的 toolExecutor 签名：

```typescript
// 现在
toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>

// 改为
skillExecutor: (name: string, input: unknown) => Promise<{ output: unknown; isError?: boolean }>
```

LLM client 内部负责：
- ToolCall → `{ name, arguments }` → skillExecutor
- skillExecutor 返回 → 序列化为 ToolResult content

### Q2: 现有的 memory/tools.ts 怎么办？

**Phase 6 迁移为 skill.json 格式**。但在迁移前，通过 SkillRegistry 的兼容层保持运行：

```typescript
// 兼容层：把旧的 RegisteredTool 包装成 SkillDefinition
function wrapLegacyTool(tool: RegisteredTool): RegisteredSkill {
  return {
    definition: {
      ...tool.definition,
      output: { type: 'object' },  // 无 output schema，自由输出
      mode: 'code',
      calls: [],
    },
    execute: async (input, ctx) => {
      const toolCall = { id: crypto.randomUUID(), name: tool.definition.name, arguments: input }
      const result = await tool.executor(toolCall)
      return { content: result.content, isError: result.isError }
    },
  }
}
```

### Q3: RunEvent 怎么发到前端？

```
Agent.run() → yield RunEvent → ipc.ts 转发 → sender.send('task:stream') → useTasks.ts
```

RunEvent 的 type 和现有 task:stream 的 type 对齐：

```
RunEvent.type        →  task:stream type
──────────────────────────────────
'token'              →  'token'
'skill_call'         →  'tool_call'（或升级为 'skill_call'）
'skill_result'       →  'tool_result'（或升级为 'skill_result'）
'error'              →  'error'
'done'               →  'done'
```
