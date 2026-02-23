# OpenEvo Agent Framework — 设计文档

> **核心隐喻：Agent = 对象，Context = 变量，Skill = 函数**

---

## 1. 设计哲学

我们把整个智能体看作一个**运行时对象**。就像面向对象编程一样：

```
class Agent {
  // 变量 — 上下文状态
  memory: Memory
  config: Config
  session: Session
  env: Environment

  // 函数 — 能力
  search(query): Results
  store(text): void
  summarize(text): Summary
  codeReview(code): Review

  // 调用另一个函数
  analyze(task) {
    const context = this.search(task.query)
    const review = this.codeReview(context.code)
    return this.summarize(review)
  }
}
```

### 为什么不是 OpenClaw 的 SKILL.md？

| 维度 | OpenClaw SKILL.md | OpenEvo Skill-as-Function |
|------|-------------------|--------------------------|
| 本质 | 被动提示词模板 | 可执行的类型化函数 |
| 输入 | 无 schema，纯文本注入 | JSON Schema 定义的类型化输入 |
| 输出 | 无约束，LLM 自由输出 | 类型化输出（可结构化） |
| 组合 | 无法互调，只能嵌套 SubAgent | `ctx.call('skillB', input)` 直接调用 |
| 递归 | 需要启动新 LLM 会话 | 同一运行时内函数调用，带深度控制 |
| 执行模式 | 只有 LLM 驱动 | 纯代码 / LLM 驱动 / 混合三种 |

---

## 2. Agent — 对象模型

Agent 是整个系统的顶层容器，持有所有上下文变量和技能函数。

```typescript
interface Agent {
  // --- 身份 ---
  id: string
  name: string               // "OpenEvo Assistant"
  version: string

  // --- 变量（上下文） ---
  ctx: AgentContext

  // --- 函数（技能） ---
  skills: SkillRegistry

  // --- 生命周期 ---
  init(): Promise<void>       // 启动时初始化上下文
  dispose(): Promise<void>    // 退出时清理资源

  // --- 执行入口 ---
  run(input: RunInput): AsyncGenerator<RunEvent>
}
```

### 生命周期

```
创建 Agent
  │
  ├─ init()
  │   ├─ 加载 Config
  │   ├─ 初始化 Memory（SQLite + 索引）
  │   ├─ 注册内置 Skills
  │   └─ 恢复 Session（如果有）
  │
  ├─ run(input) ← 用户发送消息，可多次调用
  │   ├─ 构建 Context Snapshot
  │   ├─ LLM 推理 + Skill 调用循环
  │   └─ 更新 Context（记忆、日志等）
  │
  └─ dispose()
      ├─ 持久化 Session
      ├─ 关闭 Memory DB
      └─ 清理资源
```

---

## 3. Context — 变量系统

Context 是 Agent 的全部状态，就像对象的成员变量。分为四类：

```typescript
interface AgentContext {
  // --- 持久变量（跨会话存在） ---
  memory: MemoryContext        // 长期记忆 + 向量索引
  config: ConfigContext        // 用户配置 + 供应商认证

  // --- 会话变量（单次会话生命周期） ---
  session: SessionContext      // 当前对话历史 + 任务状态

  // --- 环境变量（只读，描述运行环境） ---
  env: EnvironmentContext      // 平台、版本、时间等

  // --- 临时变量（单次 run 生命周期） ---
  scratch: Map<string, unknown>  // Skill 之间传递的中间结果
}
```

### 3.1 持久变量 — Memory

```typescript
interface MemoryContext {
  // 长期记忆（MEMORY.md）
  longTerm: string

  // 每日日志
  dailyLogs: {
    today: string
    yesterday: string
  }

  // 搜索
  search(query: string, limit?: number): Promise<SearchResult[]>

  // 存储
  store(text: string, category?: string): Promise<void>

  // 遗忘
  forget(query: string): Promise<number>
}
```

### 3.2 持久变量 — Config

```typescript
interface ConfigContext {
  // 供应商
  activeProvider: { providerId: string; model: string } | null
  providers: ProviderStatus[]

  // 用户偏好
  get(key: string): unknown
  set(key: string, value: unknown): void
}
```

### 3.3 会话变量 — Session

```typescript
interface SessionContext {
  id: string
  startedAt: number

  // 对话历史（当前会话的所有消息）
  messages: ChatMessage[]

  // 当前任务状态
  tasks: Map<string, TaskState>

  // Transcript 持久化（JSONL）
  transcript: TranscriptWriter
}
```

### 3.4 环境变量 — Environment

```typescript
interface EnvironmentContext {
  platform: 'darwin' | 'win32' | 'linux'
  appVersion: string
  electronVersion: string
  now(): Date
  locale: string
}
```

### 3.5 临时变量 — Scratch

技能之间传递中间数据的共享空间。每次 `run()` 调用时重置。

```typescript
// Skill A 写入
ctx.scratch.set('searchResults', results)

// Skill B 读取
const results = ctx.scratch.get('searchResults') as SearchResult[]
```

---

## 4. Skill — 函数系统

### 4.1 核心定义

每个 Skill 就是一个**类型化的函数**：有明确的输入、输出和执行逻辑。

```typescript
interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  // --- 身份 ---
  name: string                          // 函数名，如 "memory_search"
  description: string                   // 给 LLM 看的描述
  category: string                      // 分组，如 "记忆"、"代码"、"搜索"

  // --- 类型签名 ---
  input: JSONSchema                     // 输入 schema（对应函数参数）
  output: JSONSchema                    // 输出 schema（对应返回值）

  // --- 执行模式 ---
  mode: 'code' | 'llm' | 'composite'

  // --- 实现 ---
  execute: (input: TInput, ctx: SkillContext) => Promise<TOutput>
}
```

### 4.2 三种执行模式

#### Mode 1: `code` — 纯代码函数

不调用 LLM，纯 TypeScript 执行。快速、确定性。

```typescript
const memorySearch: SkillDefinition<
  { query: string; limit?: number },
  { results: SearchResult[] }
> = {
  name: 'memory_search',
  description: '搜索用户的长期记忆和日志',
  category: '记忆',
  mode: 'code',
  input: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
  output: {
    type: 'object',
    properties: {
      results: { type: 'array' },
    },
  },
  execute: async (input, ctx) => {
    const results = await ctx.memory.search(input.query, input.limit)
    return { results }
  },
}
```

#### Mode 2: `llm` — LLM 驱动函数

本身会发起一次 LLM 调用。相当于一个有自己 system prompt 的子 Agent。

```typescript
const summarize: SkillDefinition<
  { text: string; maxLength?: number },
  { summary: string }
> = {
  name: 'summarize',
  description: '总结给定文本',
  category: '文本',
  mode: 'llm',
  input: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      maxLength: { type: 'number' },
    },
    required: ['text'],
  },
  output: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
    },
  },
  execute: async (input, ctx) => {
    const result = await ctx.llm({
      system: '你是一个摘要助手。用中文简洁总结以下内容。',
      prompt: input.text,
      maxTokens: input.maxLength || 500,
    })
    return { summary: result }
  },
}
```

#### Mode 3: `composite` — 组合函数

通过 `ctx.call()` 调用其他 Skill，构建工作流。

```typescript
const researchAndSummarize: SkillDefinition<
  { topic: string },
  { summary: string; sources: SearchResult[] }
> = {
  name: 'research_and_summarize',
  description: '搜索记忆并总结相关内容',
  category: '工作流',
  mode: 'composite',
  input: {
    type: 'object',
    properties: { topic: { type: 'string' } },
    required: ['topic'],
  },
  output: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      sources: { type: 'array' },
    },
  },
  execute: async (input, ctx) => {
    // 调用 memory_search
    const { results } = await ctx.call('memory_search', {
      query: input.topic,
      limit: 10,
    })

    if (results.length === 0) {
      return { summary: '未找到相关内容', sources: [] }
    }

    // 调用 summarize
    const text = results.map(r => r.snippet).join('\n\n')
    const { summary } = await ctx.call('summarize', { text })

    return { summary, sources: results }
  },
}
```

### 4.3 SkillContext — 函数的运行时上下文

每个 Skill 执行时都会收到一个 `SkillContext`，这是它与 Agent 交互的唯一接口。

```typescript
interface SkillContext {
  // --- 访问 Agent 变量 ---
  memory: MemoryContext
  config: ConfigContext
  session: SessionContext
  env: EnvironmentContext
  scratch: Map<string, unknown>

  // --- 调用其他 Skill（函数调用） ---
  call<T = unknown>(skillName: string, input: unknown): Promise<T>

  // --- 调用 LLM（仅 mode: 'llm' 使用） ---
  llm(options: LLMCallOptions): Promise<string>

  // --- 日志 ---
  log(message: string): void

  // --- 事件通知（发送到前端） ---
  emit(event: string, data?: unknown): void

  // --- 执行元信息 ---
  depth: number                // 当前调用深度（防无限递归）
  maxDepth: number             // 最大调用深度（默认 10）
  parentSkill?: string         // 调用方 Skill 名称
  taskId: string               // 当前任务 ID
}
```

### 4.4 递归与调用栈

Skill 可以通过 `ctx.call()` 互相调用，形成调用栈：

```
run("分析这个项目的技术栈")
  └─ LLM 决定调用 research_and_summarize({ topic: "技术栈" })
       ├─ ctx.call('memory_search', { query: "技术栈" })       depth=1
       │    └─ execute → hybridSearch → return results          depth=2
       └─ ctx.call('summarize', { text: "..." })                depth=1
            └─ ctx.llm({ prompt: "..." })                       depth=2
                 └─ LLM 推理 → return summary
```

**深度控制**：

```typescript
async call(skillName: string, input: unknown): Promise<unknown> {
  if (this.depth >= this.maxDepth) {
    throw new SkillDepthError(
      `调用深度超限 (${this.depth}/${this.maxDepth}): ${skillName}`
    )
  }

  const skill = this.registry.get(skillName)
  const childCtx = this.fork({ depth: this.depth + 1, parentSkill: this.currentSkill })
  return skill.execute(input, childCtx)
}
```

---

## 5. 双重执行模型

Skill 有两种被调用的方式：

### 5.1 LLM 驱动（Tool Use）

LLM 在推理过程中决定调用哪些 Skill。这是主要的交互模式。

```
用户消息 → LLM 推理
  → LLM 输出 tool_use: memory_search({ query: "..." })
    → SkillRegistry.execute("memory_search", { query: "..." })
      → 返回结果给 LLM
  → LLM 继续推理，可能再次调用 tool
  → LLM 输出最终文本
```

**与现有 Tool Use 的关系**：现有的 `ToolDefinition` / `ToolCall` / `ToolResult` 是 Skill 在 LLM 驱动模式下的**传输协议**。Skill 的 `input` schema 直接映射为 `ToolDefinition.parameters`，Skill 的输出序列化为 `ToolResult.content`。

### 5.2 程序化调用（Workflow）

直接在代码中调用 Skill，不经过 LLM。用于构建确定性工作流。

```typescript
// 自动记忆流水线 — 不需要 LLM 决策
async function autoMemoryPipeline(message: string, response: string, ctx: SkillContext) {
  // 判断是否值得记录
  const { shouldCapture } = await ctx.call('should_capture', { message })
  if (!shouldCapture) return

  // 提取关键信息
  const { facts } = await ctx.call('extract_facts', { text: response })

  // 去重并存储
  for (const fact of facts) {
    await ctx.call('memory_store', { text: fact, category: 'fact' })
  }
}
```

---

## 6. SkillRegistry — 函数注册表

升级现有的 `ToolRegistry`，统一管理所有 Skill。

```typescript
class SkillRegistry {
  private skills = new Map<string, SkillDefinition>()

  // --- 注册 ---
  register(skill: SkillDefinition): void
  registerMany(skills: SkillDefinition[]): void
  unregister(name: string): void

  // --- 查询 ---
  get(name: string): SkillDefinition | undefined
  list(): SkillDefinition[]
  listByCategory(category: string): SkillDefinition[]
  categories(): string[]
  has(name: string): boolean
  get size(): number

  // --- LLM 交互 ---
  // 转换为 ToolDefinition[]（传给 LLM 的 tools 参数）
  toToolDefinitions(): ToolDefinition[]

  // 生成 system prompt 中的工具说明
  toSystemPrompt(): string

  // --- 执行 ---
  async execute(name: string, input: unknown, ctx: SkillContext): Promise<unknown>
}
```

### 与现有 ToolRegistry 的映射

```
现有 ToolRegistry           →  新 SkillRegistry
─────────────────────────────────────────────
RegisteredTool.definition   →  SkillDefinition (input/output schema)
RegisteredTool.executor     →  SkillDefinition.execute
RegisteredTool.category     →  SkillDefinition.category
getDefinitions()            →  toToolDefinitions()
getToolInstructions()       →  toSystemPrompt()
execute(toolCall)           →  execute(name, input, ctx)
```

---

## 7. 运行流程 — 完整的 `run()` 执行

```typescript
async *run(input: RunInput): AsyncGenerator<RunEvent> {
  // 1. 准备上下文快照
  const ctx = this.createSkillContext(input.taskId)

  // 2. 前置 Hook: auto-recall
  const memories = await ctx.call('auto_recall', { query: input.message })
  ctx.scratch.set('relevantMemories', memories)

  // 3. 构建 system prompt
  const systemPrompt = this.buildSystemPrompt(ctx)

  // 4. LLM 推理 + Skill 调用循环
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input.message },
  ]

  for await (const event of this.llmLoop(messages, ctx)) {
    yield event  // 流式输出: token / tool_call / tool_result / done
  }

  // 5. 后置 Hook: auto-capture + transcript
  await ctx.call('auto_capture', {
    message: input.message,
    response: ctx.scratch.get('finalResponse'),
  })

  ctx.session.transcript.append({
    role: 'assistant',
    content: ctx.scratch.get('finalResponse'),
  })
}
```

---

## 8. 内置 Skill 清单

### 第一期 — 记忆系统（已实现，需迁移）

| Skill | Mode | 描述 |
|-------|------|------|
| `memory_search` | code | 混合搜索记忆（向量 + BM25） |
| `memory_store` | code | 存储记忆（去重 + 索引） |
| `memory_forget` | code | 删除记忆 |
| `auto_recall` | code | 对话前自动搜索相关记忆 |
| `auto_capture` | code | 对话后自动提取可记忆内容 |
| `should_capture` | code | 判断是否值得记录 |

### 第二期 — 文本处理

| Skill | Mode | 描述 |
|-------|------|------|
| `summarize` | llm | 总结文本 |
| `translate` | llm | 翻译 |
| `extract_facts` | llm | 从文本中提取关键事实 |

### 第三期 — 外部能力

| Skill | Mode | 描述 |
|-------|------|------|
| `web_search` | code | 网络搜索 |
| `code_exec` | code | 沙盒代码执行 |
| `file_read` | code | 读取本地文件 |
| `file_write` | code | 写入本地文件 |

### 第四期 — 组合工作流

| Skill | Mode | 描述 |
|-------|------|------|
| `research_and_summarize` | composite | 搜索 + 总结 |
| `code_review` | composite | 读取代码 + LLM 审查 |
| `daily_digest` | composite | 搜索今日记忆 + 总结 |

---

## 9. 文件结构规划

```
desktop/main/
├── agent/
│   ├── index.ts               # Agent 类（顶层对象）
│   ├── context.ts             # AgentContext（变量容器）
│   └── runner.ts              # run() 执行引擎
├── skills/
│   ├── registry.ts            # SkillRegistry（升级自 tools/registry.ts）
│   ├── context.ts             # SkillContext 工厂
│   ├── types.ts               # SkillDefinition, SkillContext 等类型
│   ├── memory/                # 记忆类 Skill
│   │   ├── search.ts
│   │   ├── store.ts
│   │   ├── forget.ts
│   │   ├── auto-recall.ts
│   │   └── auto-capture.ts
│   ├── text/                  # 文本处理类 Skill
│   │   ├── summarize.ts
│   │   └── translate.ts
│   └── system/                # 系统类 Skill
│       ├── web-search.ts
│       └── code-exec.ts
├── memory/                    # 记忆基础设施（不变）
│   ├── db.ts
│   ├── search.ts
│   ├── indexer.ts
│   ├── store.ts
│   └── ...
└── providers/                 # LLM 供应商（不变）
    ├── llm-client.ts
    ├── types.ts
    └── ...
```

---

## 10. 与现有代码的迁移路径

### Phase 1: 定义类型

新建 `skills/types.ts`，定义 `SkillDefinition`, `SkillContext`, `SkillRegistry` 接口。不改动现有代码。

### Phase 2: 升级 Registry

将 `tools/registry.ts` 的 `ToolRegistry` 升级为 `skills/registry.ts` 的 `SkillRegistry`。保持向后兼容——`toToolDefinitions()` 生成与原 `getDefinitions()` 相同的输出。

### Phase 3: 迁移现有 Memory Tools

将 `memory/tools.ts` 中的 3 个工具（memory_search/store/forget）改写为 `SkillDefinition` 格式，注册到 SkillRegistry。

### Phase 4: 实现 SkillContext

新建 `skills/context.ts`，实现 `ctx.call()`, `ctx.llm()`, `ctx.memory.*` 等方法。

### Phase 5: 构建 Agent

新建 `agent/index.ts`，将 `ipc.ts` 中的 `task:create` 逻辑抽象到 `Agent.run()`。IPC 变成薄层，只负责序列化/反序列化。

---

## 11. 设计原则

1. **Skill 是最小执行单元**。不管多复杂的任务，最终都分解为 Skill 调用。
2. **Context 是唯一的状态来源**。Skill 不维护私有状态，所有状态通过 Context 访问。
3. **类型安全优先**。每个 Skill 的输入输出都有 JSON Schema，运行时校验。
4. **渐进式采用**。现有代码可以不改动就继续运行，新 Skill 按新规范注册即可。
5. **LLM 是调度器而非控制器**。LLM 负责选择调用哪些 Skill，但 Skill 的执行是确定性的。
6. **深度可控**。`ctx.call()` 带深度计数器，防止无限递归。默认最大深度 10。
7. **可观测**。每次 Skill 调用都通过 `ctx.emit()` 发送事件，前端可实时展示调用栈。

---

## 12. 后续讨论点

- [ ] **Skill 发现机制**：是否支持从文件系统动态加载 Skill？（类似插件）
- [ ] **权限控制**：某些 Skill（如 file_write）是否需要用户确认？
- [ ] **并行执行**：`ctx.call()` 是否支持 `ctx.callParallel([...])`？
- [ ] **流式 Skill**：Skill 的 `execute` 是否支持 `AsyncGenerator` 以流式返回中间结果？
- [ ] **Skill 版本管理**：同名 Skill 是否支持多版本共存？
- [ ] **跨 Agent Skill 共享**：多个 Agent 实例是否共享 SkillRegistry？
