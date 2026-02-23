# EvoLang 实现蓝图

> 唯一实现依据。语言核心独立于任何宿主应用。

---

## 0. 计算模型 — EvoLang 是一台计算机

EvoLang 不只是"用 LLM 做编程"。它的设计基于一个核心洞察：

> **LLM 就是 CPU，记忆就是硬盘和内存。**

这不是比喻，而是字面意义上的体系结构映射。EvoLang 是一台**以 LLM 为处理器的计算机**。

### 0.1 体系结构映射

```
┌─────────────────────────────────────────────────────────────────┐
│                     EvoLang 计算机                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  CPU（LLM）                                          │       │
│  │    ├── 指令集（ISA）    = Skill Registry              │       │
│  │    ├── 程序计数器（PC） = Agent 推理循环               │       │
│  │    ├── 寄存器           = scratch（最快，指令级生命周期）│       │
│  │    └── 运算单元（ALU）  = LLM 推理能力                │       │
│  └────────┬───────────────────────────┬─────────────────┘       │
│           │ 指令总线                   │ 数据总线                 │
│  ┌────────▼───────────────────────────▼─────────────────┐       │
│  │  内存（RAM）= Context Window                          │       │
│  │    ├── 容量有限（token limit）                         │       │
│  │    ├── 易失性（会话结束即丢失）                         │       │
│  │    ├── system prompt = 固件/ROM（启动时加载）           │       │
│  │    ├── 对话历史 = 工作内存                             │       │
│  │    └── 预取结果 = 从磁盘加载的热数据                    │       │
│  └────────┬───────────────────────────────────────────┐ │       │
│  ┌────────▼───────────────────────────────────────────▼─┐       │
│  │  磁盘（Disk）= 持久存储                                │       │
│  │    ├── SSD（索引存储）= SQLite + Embedding 索引         │       │
│  │    ├── HDD（冷存储）  = MEMORY.md、daily logs、raw files│       │
│  │    └── I/O 操作       = memory_search / memory_store    │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│  操作系统 = Agent（资源管理 + 进程调度）                          │
│  进程     = run()（一次完整的执行生命周期）                       │
│  系统调用 = ctx.call()（请求操作系统服务）                        │
│  中断     = RunEvent（可观测的信号）                              │
│  DMA      = auto_recall（磁盘→内存 自动预取）                    │
│  回写     = auto_capture（内存→磁盘 自动持久化）                  │
└─────────────────────────────────────────────────────────────────┘
```

### 0.2 完整映射表

| 计算机硬件 | EvoLang | 特征 |
|-----------|---------|------|
| **CPU** | LLM | 非确定性处理器，输入相同输出可能不同 |
| **指令集 (ISA)** | Skill Registry | CPU 能执行的全部指令 |
| **单条指令** | Skill | 有类型签名的原子操作 |
| **程序计数器** | Agent 推理循环 | CPU 决定下一条执行什么 |
| **寄存器** | scratch | 最快，当前指令周期内有效 |
| **RAM** | Context Window | 有限容量，易失，快速访问 |
| **ROM / 固件** | System Prompt | 启动时加载，定义 CPU 行为模式 |
| **SSD** | SQLite 索引 | 持久，需要 I/O，有索引加速 |
| **HDD** | 文件系统（.md） | 持久，最慢，原始存储 |
| **DMA 预取** | auto_recall | 自动把磁盘数据搬到内存 |
| **回写策略** | auto_capture | 自动把内存数据存到磁盘 |
| **操作系统** | Agent | 管理资源、调度进程 |
| **进程** | run() | 一次执行生命周期 |
| **系统调用** | ctx.call() | 进程请求 OS 服务 |
| **中断/信号** | RunEvent | 可观测的异步事件 |
| **I/O 总线** | LLMProvider 接口 | CPU ↔ 外设通信 |
| **程序** | Pipeline | 预编译的指令序列 |
| **动态链接** | LLM Function Calling | 运行时决定调哪个函数 |

### 0.3 设计推论

这个映射不是事后贴标签。它直接指导设计决策：

**推论 1：内存管理是核心问题**

Context Window（RAM）容量有限。你不能把所有记忆都塞进去。必须有：
- **预取策略**（auto_recall）— 预测 CPU 需要什么数据，提前从磁盘搬到内存
- **淘汰策略** — 内存满了，哪些数据可以丢弃
- **分层存储** — 热数据在快速层，冷数据在慢速层

**推论 2：Skill 是指令，不是程序**

每个 Skill 应该是原子操作。复杂逻辑由 LLM（CPU）在运行时编排，或由 Pipeline（程序）预定义。Skill 本身应该小而快。

**推论 3：Agent 是操作系统，不是应用程序**

Agent 不做业务逻辑。它：
- 管理内存层级（什么时候预取、什么时候淘汰、什么时候持久化）
- 调度 Skill 执行（深度控制、超时、重试）
- 提供系统调用（ctx.call、ctx.llm）
- 产生中断（RunEvent）

**推论 4：CPU 不需要知道磁盘的实现细节**

LLM（CPU）通过系统调用（Skill）访问存储。它不知道底层是 SQLite 还是文件系统。这就是为什么 evolang 核心是零依赖——CPU 设计不绑定具体的存储硬件。

### 0.4 存储层级详解

```
访问速度    生命周期         实现
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────┐
│ 寄存器   │ scratch         单次 Skill 执行          Map<string, unknown>
│ O(1)    │                 指令完成即可覆写
├─────────┤
│ L1 缓存  │ Pipeline steps  单次 Pipeline 执行       steps: Record<string, Result>
│ O(1)    │                 pipeline 完成即丢弃
├─────────┤
│ RAM     │ Context Window  单次 run() / 会话         LLM messages[]
│ O(1)    │                 会话结束即丢失            受 token 上限约束
│ 有限容量 │                                         需要淘汰策略
├─────────┤
│ SSD     │ 索引存储         跨会话持久               SQLite + Embedding
│ O(search)│                 语义搜索，毫秒级          宿主实现
├─────────┤
│ HDD     │ 文件存储         跨会话持久               MEMORY.md, daily logs
│ O(n)    │                 全文扫描，最慢            宿主实现
└─────────┘
```

这个层级是**自动管理**的：
- **auto_recall**（DMA 预取）：run() 开始时，根据用户消息的语义，从 SSD 搜索相关数据，加载到 RAM
- **auto_capture**（回写）：run() 结束后，检查对话中是否产生了值得持久化的数据，写回 SSD/HDD
- **PromptCompiler**（固件加载器）：把 RAM 中的数据编译为 system prompt，加载到 CPU

---

## 1. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  desktop/                    宿主应用（Electron Demo）    │
│    ├── adapters/             硬件驱动（LLM SDK、存储后端） │
│    ├── skills/               业务 Skill（text、code…）   │
│    └── ipc.ts                IPC 转发                    │
├─────────────────────────────────────────────────────────┤
│  evolang/                    语言核心（大脑）              │
│    ├── types.ts              所有类型定义                 │
│    ├── registry.ts           SkillRegistry               │
│    ├── context.ts            SkillContext 实现            │
│    ├── agent.ts              Agent 运行时                │
│    ├── memory/               记忆子系统（OS 内核）         │
│    │   ├── types.ts          MemoryProvider 接口          │
│    │   ├── manager.ts        MemoryManager 存储调度       │
│    │   ├── auto-recall.ts    DMA 预取                    │
│    │   ├── auto-capture.ts   回写                        │
│    │   └── skills/           内置记忆 Skill               │
│    ├── loader.ts             skill.json 加载器           │
│    ├── validator.ts          JSON Schema 校验            │
│    ├── pipeline.ts           composite 流水线执行器       │
│    └── errors.ts             错误类型                    │
└─────────────────────────────────────────────────────────┘
```

### 1.1 核心原则：记忆属于语言，不属于应用

传统编程语言不管你的数据——你想存就手动写文件，想读就手动查数据库。运行时只管执行指令。

**EvoLang 不是传统语言。它的运行时是一个智能体。**

智能体的核心能力是**记忆**。你跟一个智能体说过的话，它应该自己记住。下次对话时，它应该自己想起来。业务层不需要：
- 手动存储数据（"帮我把这段对话存到数据库"）
- 手动加载数据（"帮我从数据库查上次的对话"）
- 管理存储生命周期（"什么时候清理过期数据"）

**业务层只管"说话"**——把上下文通过变量或函数传给语言层。语言层自己决定记什么、忘什么、什么时候想起来。这就是智能和工具的根本区别。

```
传统语言:
  业务代码 → "把 x 存到 Redis" → Redis
  业务代码 → "从 Redis 读 x"   → 拿到数据
  （业务层负责所有存储逻辑）

EvoLang:
  业务层 → "用户说了这段话" → Agent
  Agent 自动决定：这段话里有什么值得记住的？→ 记忆系统自动存储
  下次对话 → Agent 自动想起来 → 注入上下文
  （业务层完全不感知存储的存在）
```

### 1.2 依赖原则

`evolang/` 不 import Electron、不 import 任何 LLM SDK。但它**可以依赖存储基础设施**（如 better-sqlite3），因为记忆系统是语言内核的一部分，就像 Python 标准库自带 `sqlite3` 一样。

宿主只需要提供两样东西：
1. **CPU 驱动**（LLMProvider） — 告诉 evolang 怎么调用 LLM
2. **存储后端**（StorageBackend） — 告诉 evolang 数据存在哪里（目录路径 / 数据库连接）

其余的一切——搜索、索引、预取、回写、去重、淘汰——都是语言内核自己管理的。

---

## 2. 目录结构

```
openclaw-cn/
├── evolang/                          ← 语言核心包（大脑）
│   ├── src/
│   │   ├── index.ts                  # 公开 API 导出
│   │   ├── types.ts                  # 所有类型定义
│   │   ├── errors.ts                 # 错误类
│   │   ├── registry.ts              # SkillRegistry
│   │   ├── context.ts               # SkillContextImpl
│   │   ├── agent.ts                 # Agent 类
│   │   ├── loader.ts                # skill.json 文件加载
│   │   ├── validator.ts             # JSON Schema 校验
│   │   ├── pipeline.ts              # composite pipeline 执行
│   │   │
│   │   └── memory/                   # ═══ 记忆子系统（OS 内核） ═══
│   │       ├── types.ts              # MemoryProvider + StorageBackend 接口
│   │       ├── manager.ts            # MemoryManager — 五级存储调度
│   │       ├── auto-recall.ts        # DMA 预取（run 开始时自动执行）
│   │       ├── auto-capture.ts       # 回写（run 结束时自动执行）
│   │       └── skills/               # 内置记忆 Skill（暴露给 LLM 的系统调用）
│   │           ├── search/           skill.json + index.ts
│   │           ├── store/            skill.json + index.ts
│   │           └── forget/           skill.json + index.ts
│   │
│   ├── package.json                  # 依赖: better-sqlite3（可选）
│   └── tsconfig.json
│
├── desktop/                          ← 宿主应用（Electron Demo）
│   ├── main/
│   │   ├── index.ts                  # Electron 入口，创建 Agent
│   │   ├── ipc.ts                    # IPC 薄层，agent.run() → sender.send()
│   │   │
│   │   ├── adapters/                 # 硬件驱动
│   │   │   ├── llm.ts               # LLMProvider → Anthropic/OpenAI SDK
│   │   │   └── storage.ts           # StorageBackend → 本地文件系统路径
│   │   │
│   │   ├── skills/                   # 业务 Skill（不含 memory — 已在 evolang 内）
│   │   │   ├── text/
│   │   │   │   └── summarize/        skill.json + prompt.md
│   │   │   └── code/
│   │   │       └── review/           skill.json + prompt.md
│   │   │
│   │   ├── providers/                # LLM SDK（不变）
│   │   └── config/                   # 配置存储（不变）
│   │
│   ├── preload/
│   ├── renderer/
│   └── electron.vite.config.ts
│
└── docs/
```

**关键变化**：`memory/` 整体从 `desktop/` 移入 `evolang/`。记忆 Skill（search、store、forget）是语言内置的系统调用，不是宿主提供的业务功能。宿主只需告诉 evolang "数据存在 `~/.openevo/memory/` 这个目录下"，其余全部由语言内核管理。

---

## 3. evolang 核心类型 — `evolang/src/types.ts`

### 3.1 CPU 接口 — LLMProvider

```typescript
/**
 * CPU 接口 — 宿主提供的 LLM 驱动
 *
 * evolang 通过此接口向 CPU 发送指令。
 * 具体是 Anthropic、OpenAI 还是本地模型，由宿主决定。
 */
export interface LLMProvider {
  /** 单次 CPU 运算（流式输出） */
  chat(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<LLMEvent>

  /**
   * 带系统调用循环的 CPU 运算
   *
   * CPU 运算 → 发现需要 I/O → 触发系统调用 → 系统调用返回 → CPU 继续运算 → ...
   * 这个循环由宿主实现，evolang 只定义接口。
   */
  chatWithTools(
    messages: LLMMessage[],
    options: LLMOptions & { tools: ToolDefinition[] },
    skillExecutor: (name: string, input: Record<string, unknown>) => Promise<SkillOutput>,
  ): AsyncGenerator<LLMEvent>
}

/** CPU 指令格式（通用，不绑定具体 CPU 型号） */
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** CPU 运算参数 */
export interface LLMOptions {
  model: string
  providerId: string
  maxTokens?: number
  temperature?: number
}

/** CPU 运算输出事件 */
export interface LLMEvent {
  type: 'token' | 'done' | 'error' | 'tool_call'
  content?: string
  fullResponse?: string
  error?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
}

/** 系统调用返回值 */
export interface SkillOutput {
  output: Record<string, unknown>
  isError?: boolean
}

/** 指令定义（传给 CPU 的格式，告诉 CPU 有哪些系统调用可用） */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}
```

### 3.2 固件加载器 — PromptCompiler

```typescript
/**
 * 固件加载器 — 宿主实现
 *
 * 负责在每次 run() 开始时，把存储中的数据"加载到 RAM"：
 * - 长期记忆 → system prompt 的记忆段
 * - 今日日志 → system prompt 的日志段
 * - Skill 说明 → system prompt 的指令集说明段
 * - 预取结果 → system prompt 的相关记忆段
 *
 * PromptCompiler 需要感知 RAM 容量（token budget），
 * 做出取舍决定（哪些数据加载，哪些省略）。
 */
export interface PromptCompiler {
  compile(ctx: {
    /** 可用指令集 */
    skills: ToolDefinition[]
    /** 存储层数据（宿主的 env） */
    env: Record<string, unknown>
    /** 寄存器（scratch） */
    scratch: Map<string, unknown>
    /** RAM 预算（可选，如果宿主提供） */
    budget?: ContextBudget
  }): string | Promise<string>
}

/**
 * RAM 容量预算
 *
 * Context Window 就是 RAM — 容量有限，必须管理。
 * 宿主可以提供 budget 信息，PromptCompiler 据此决定加载多少数据。
 */
export interface ContextBudget {
  /** RAM 总容量（tokens） */
  maxTokens: number
  /** 为 CPU 输出保留的空间 */
  reservedForResponse: number
  /** 用户消息已占用的空间（估算） */
  usedByMessage: number
}
```

### 3.3 日志接口

```typescript
/** 日志 — 宿主实现（相当于主板上的调试串口） */
export interface Logger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
```

### 3.4 记忆子系统 — Memory

```typescript
/**
 * StorageBackend — 存储后端接口
 *
 * 这是 evolang 唯一需要宿主提供的存储相关信息。
 * 不是"记忆怎么搜索/怎么存储"，而是"数据文件放在哪个目录"。
 *
 * 类比：操作系统不需要用户告诉它怎么管理文件系统，
 * 但需要知道硬盘挂载在哪里（/dev/sda → /mnt/data）。
 */
export interface StorageBackend {
  /** 数据目录根路径（如 ~/.openevo/memory/） */
  dataDir: string
  /** 可选：自定义 embedding 函数（默认使用内置实现） */
  embed?: (text: string) => Promise<number[]>
}

/**
 * MemoryEntry — 记忆条目
 */
export interface MemoryEntry {
  id: string
  text: string
  score: number
  category?: string
  createdAt: number
  metadata?: Record<string, unknown>
}

/**
 * MemoryManager — 记忆管理器（OS 内核组件）
 *
 * 这不是接口，而是 evolang 内部实现的类。
 * 业务层完全不接触这个类 — 它由 Agent 在内部创建和管理。
 *
 * 职责：
 * 1. 管理五级存储层级（寄存器 → L1 → RAM → SSD → HDD）
 * 2. 自动预取（DMA）— run() 开始时，根据用户消息搜索相关记忆
 * 3. 自动回写（Capture）— run() 结束时，提取值得记住的信息并持久化
 * 4. 去重 — 存储前检查相似度，避免重复记忆
 * 5. 暴露 Skill — 自动注册 memory_search/store/forget 到 SkillRegistry
 */
export interface MemoryManager {
  /** 语义搜索 — Skill 和内核都可调用 */
  search(query: string, limit?: number): Promise<MemoryEntry[]>
  /** 存储（带去重）— Skill 和内核都可调用 */
  store(text: string, category?: string): Promise<{ stored: boolean; reason: string }>
  /** 删除 — Skill 可调用 */
  forget(query: string): Promise<{ deleted: number }>
  /** 追加日志 — 内核调用 */
  appendDailyLog(entry: string): void
  /** 加载日志 — 内核调用 */
  loadDailyLog(dateStr?: string): string
  /** 加载长期记忆 — PromptCompiler 调用 */
  loadLongTerm(): string

  /** DMA 预取 — Agent.run() 开始时自动调用 */
  recall(query: string): Promise<MemoryEntry[]>
  /** 回写 — Agent.run() 结束时自动调用 */
  capture(message: string, response: string): Promise<{ captured: number; entries: string[] }>

  /** 注册内置记忆 Skill 到指令表 */
  registerSkills(registry: SkillRegistry): void
}
```

**设计哲学**：

```
传统框架:
  宿主实现 MemoryProvider → 注入 Agent → Skill 通过 ctx.env.memory 访问
  （记忆是外部服务，语言只是转发）

EvoLang:
  Agent 创建 MemoryManager(storageBackend) → 内核自己管理一切
  （记忆是大脑的一部分，不是外部硬盘）
```

业务层传入的数据（通过 `env`）是"感知输入"——就像眼睛看到的东西。但**是否记住、怎么记住、什么时候想起来**，是大脑自己的事，不需要眼睛来操心。

### 3.5 指令类型 — Skill

```typescript
export type JSONSchema = Record<string, unknown>

/**
 * SkillMeta — skill.json 的 TypeScript 映射
 *
 * 一条指令的完整规格说明。
 * 就像 x86 手册中对一条指令的描述：操作码、操作数格式、行为定义。
 */
export interface SkillMeta {
  name: string                          // 指令助记符 /^[a-z][a-z0-9_]*$/
  description: string                   // 指令说明
  category: string                      // 指令分类（memory / text / code / ...）
  input: JSONSchema                     // 操作数格式（输入 schema）
  output: JSONSchema                    // 结果格式（输出 schema）
  mode: 'code' | 'llm' | 'composite'   // 执行模式

  calls: string[]                       // 依赖的其他指令
  pipeline?: PipelineStep[]             // 微程序（composite 模式的指令序列）
  outputMapping?: Record<string, string>// 微程序输出映射

  version: string
  tags: string[]
  author?: string
  timeout: number                       // 超时 ms，默认 30000
  retry: number                         // 重试次数，默认 0
}

/** 微程序步骤（Pipeline 中的一步） */
export interface PipelineStep {
  step: string                          // 步骤名（相当于标签）
  skill: string                         // 要执行的指令
  input: Record<string, unknown>        // 操作数映射 {{input.xxx}} {{steps.xxx.yyy}}
  condition?: string                    // 条件执行
  foreach?: string                      // 向量化（对数组中每个元素执行）
}

/** 指令执行函数签名 */
export type SkillExecutor<TEnv = Record<string, unknown>> = (
  input: Record<string, unknown>,
  ctx: SkillContext<TEnv>,
) => Promise<Record<string, unknown>>

/** 注册到指令表的完整指令 */
export interface RegisteredSkill<TEnv = Record<string, unknown>> {
  meta: SkillMeta
  execute: SkillExecutor<TEnv>
}
```

### 3.6 执行上下文 — SkillContext

```typescript
/**
 * SkillContext — 指令执行时的上下文
 *
 * 对应 CPU 执行上下文（execution context）：
 * - memory        = 内核存储系统（一等公民，不是外设）
 * - env（TEnv）  = I/O 端口，访问宿主特有的外设（config 等，不含 memory）
 * - scratch       = 寄存器文件，指令间传数据
 * - call()        = 系统调用，请求 OS 执行另一条指令
 * - llm()         = 协处理器调用，请求 CPU 做一次推理运算
 * - emit()        = 触发中断
 * - depth         = 调用栈深度
 *
 * TEnv 是泛型：宿主特有的外设（非存储）。evolang 不知道外设长什么样。
 */
export interface SkillContext<TEnv = Record<string, unknown>> {
  /** ═══ 内核存储系统 ═══ */
  /** 记忆管理器 — OS 内核组件，所有 Skill 可读写 */
  memory: MemoryManager

  /** I/O 端口 — 访问宿主特有的外设（config、session 等，不含 memory） */
  env: TEnv

  /** 寄存器 — 指令间传递数据，单次 run() 生命周期 */
  scratch: Map<string, unknown>

  /** 系统调用 — 请求执行另一条指令 */
  call<T = Record<string, unknown>>(name: string, input: Record<string, unknown>): Promise<T>

  /** 协处理器调用 — 请求 CPU 做一次独立运算 */
  llm(options: {
    system?: string
    prompt: string
    model?: string
    providerId?: string
    maxTokens?: number
    temperature?: number
  }): Promise<string>

  /** 触发中断 */
  emit(event: RunEvent): void

  /** 调试日志 */
  log(message: string): void

  /** 调用栈深度 */
  depth: number
  maxDepth: number
  parentSkill: string | undefined
  taskId: string
}
```

**与之前的区别**：`memory` 从 `env.memory`（宿主注入的外设）提升为 `ctx.memory`（内核组件）。Skill 代码从 `ctx.env.memory.search(...)` 变为 `ctx.memory.search(...)`。

### 3.7 进程类型 — Agent.run()

```typescript
/**
 * 中断事件 — Agent.run() yield 的事件
 *
 * 每个事件就是一个硬件中断，前端（显示器）可以监听并渲染。
 */
export interface RunEvent {
  type: 'token' | 'skill_call' | 'skill_result' | 'error' | 'done'
  timestamp: number

  // token — CPU 输出
  content?: string
  fullResponse?: string

  // skill_call — 系统调用发起
  skill?: string
  input?: Record<string, unknown>
  depth?: number

  // skill_result — 系统调用返回
  output?: Record<string, unknown>
  duration?: number
  isError?: boolean

  // error — 异常中断
  error?: string
}

/** 进程输入 — 启动 run() 时的参数 */
export interface RunInput {
  taskId: string
  message: string
  model?: string
  providerId?: string
}

/**
 * 操作系统配置 — Agent 构造参数
 *
 * Agent 是操作系统。这些参数定义了 OS 的硬件配置和启动策略。
 */
export interface AgentOptions<TEnv = Record<string, unknown>> {
  /** CPU 驱动（宿主提供） */
  llm: LLMProvider
  /** 存储后端（宿主提供） — 只需告诉内核"硬盘在哪里" */
  storage: StorageBackend
  /** 固件加载器（宿主提供） */
  prompt: PromptCompiler
  /** 调试串口（宿主提供，可选） */
  logger?: Logger
  /** 外设工厂 — 宿主特有的 I/O（config 等，不含 memory） */
  createEnv?: (input: RunInput) => TEnv | Promise<TEnv>

  /** 最大系统调用嵌套深度（防止栈溢出） */
  maxDepth?: number                     // default: 10
  /** CPU 推理循环最大轮次 */
  maxLLMRounds?: number                 // default: 10

  /** 记忆配置（可选，有合理默认值） */
  memoryOptions?: {
    /** 自动预取 — 默认 true */
    autoRecall?: boolean
    /** 自动回写 — 默认 true */
    autoCapture?: boolean
    /** 去重相似度阈值 — 默认 0.92 */
    deduplicationThreshold?: number
  }

  /** 启动时额外执行的 Skill（记忆预取由内核自动处理，无需在此配置） */
  beforeSkills?: string[]
  /** 关机前额外执行的 Skill（记忆回写由内核自动处理，无需在此配置） */
  afterSkills?: string[]
}
```

---

## 4. skill.json 规范 — 指令编码格式

### 4.1 字段总览

| 字段 | 类型 | 必填 | 默认值 | 计算机类比 |
|------|------|------|--------|-----------|
| `name` | `string` | 是 | — | 指令助记符 |
| `description` | `string` | 是 | — | 指令说明 |
| `category` | `string` | 是 | — | 指令分类 |
| `input` | `JSONSchema` | 是 | — | 操作数格式 |
| `output` | `JSONSchema` | 是 | — | 结果格式 |
| `mode` | `"code" \| "llm" \| "composite"` | 是 | — | 执行模式 |
| `calls` | `string[]` | 否 | `[]` | 依赖的指令 |
| `pipeline` | `PipelineStep[]` | 否 | — | 微程序 |
| `outputMapping` | `object` | 否 | — | 微程序输出映射 |
| `version` | `string` | 否 | `"1.0.0"` | 版本 |
| `tags` | `string[]` | 否 | `[]` | 标签 |
| `author` | `string` | 否 | — | 作者 |
| `timeout` | `number` | 否 | `30000` | 超时 |
| `retry` | `number` | 否 | `0` | 重试 |

### 4.2 字段详细说明

#### `name` — 指令助记符

- **类型**：`string`
- **必填**：是
- **格式约束**：`/^[a-z][a-z0-9_]*$/`（小写字母开头，只含小写字母、数字、下划线）
- **说明**：Skill 的唯一标识符。直接映射为 LLM Function Calling 的 `tool.name`。LLM 在推理时通过此名称发起"系统调用"。
- **设计要求**：
  - 全局唯一，不可重名
  - 建议用 `领域_动作` 命名（如 `memory_search`、`code_review`）
  - 避免过长（LLM token 消耗）和过短（语义不清）

```json
"name": "memory_search"       // ✅ 清晰：领域_动作
"name": "ms"                  // ❌ 太短，LLM 无法理解
"name": "searchUserMemory"    // ❌ 违反命名格式（camelCase）
```

#### `description` — 指令说明

- **类型**：`string`
- **必填**：是
- **说明**：面向 LLM 的自然语言描述。**这是 LLM 决定是否调用此 Skill 的最关键信息**。直接映射为 `tool.description`。
- **设计要求**：
  - **说清楚"什么时候该用"**，而不只是"这个函数做什么"
  - 用中文或英文皆可，取决于目标 LLM 的主要语言
  - 简洁但信息充分，建议 1-3 句话
  - 包含触发场景（When to use）和不该用的场景（When NOT to use）效果更好

```json
// ✅ 好的 description — 说清楚何时使用
"description": "搜索用户的长期记忆和日志。当用户问到之前讨论过的内容、或需要回忆历史信息时使用。"

// ❌ 差的 description — 只描述功能，不说何时用
"description": "搜索记忆"
```

#### `category` — 指令分类

- **类型**：`string`
- **必填**：是
- **说明**：Skill 所属的功能域。用于 SkillRegistry 的分类查询（`listByCategory()`），也用于 system prompt 中对 Skill 进行分组展示。
- **预设分类**：

| category | 含义 | 示例 Skill |
|----------|------|-----------|
| `memory` | 记忆 I/O（磁盘读写） | `memory_search`, `memory_store`, `memory_forget` |
| `text` | 文本处理（CPU 运算） | `summarize`, `translate`, `extract_keywords` |
| `code` | 代码相关 | `code_review`, `code_explain`, `code_generate` |
| `workflow` | 组合编排 | `research_and_summarize`, `deep_analyze` |
| `system` | 内部/自动（不暴露给用户） | `auto_recall`, `auto_capture` |

- 不限于以上分类，宿主可以自由定义新分类

#### `input` — 操作数格式（输入 Schema）

- **类型**：`JSONSchema`（JSON Schema Draft 7）
- **必填**：是
- **说明**：定义 Skill 接受的输入参数结构。在执行前由 `validator.ts` 校验，不合格直接抛出 `SkillValidationError`。同时映射为 `tool.input_schema` / `function.parameters` 传给 LLM。
- **支持的 Schema 特性**：

| 特性 | 说明 | 示例 |
|------|------|------|
| `type` | 值类型 | `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"` |
| `properties` | 对象的属性定义 | `{ "query": { "type": "string" } }` |
| `required` | 必填属性列表 | `["query"]` |
| `description` | 属性说明（LLM 可见） | `"搜索查询（自然语言）"` |
| `default` | 默认值 | `5` |
| `enum` | 枚举约束 | `["critical", "high", "medium", "all"]` |
| `items` | 数组元素类型 | `{ "type": "string" }` |
| `minimum` / `maximum` | 数值范围 | `{ "type": "number", "minimum": 1, "maximum": 100 }` |
| `minLength` / `maxLength` | 字符串长度 | `{ "type": "string", "minLength": 1 }` |

- **设计要求**：
  - `properties` 内每个属性都应提供 `description`（LLM 需要理解每个参数的含义）
  - `required` 只列真正必填的字段，给 LLM 灵活性
  - 使用 `default` 减少 LLM 必须填写的参数数量

```json
"input": {
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "搜索查询（自然语言）"
    },
    "limit": {
      "type": "number",
      "default": 5,
      "description": "最大返回数量",
      "minimum": 1,
      "maximum": 50
    }
  },
  "required": ["query"]
}
```

#### `output` — 结果格式（输出 Schema）

- **类型**：`JSONSchema`（JSON Schema Draft 7）
- **必填**：是（但内容可以是宽松的 `{}`）
- **说明**：定义 Skill 返回值的结构。用途：
  1. **运行时校验**：`validator.ts` 在 Skill 执行后校验输出是否合规
  2. **composite 类型推断**：Pipeline 步骤间通过 output schema 理解数据结构
  3. **mode: llm 约束输出**：LLM 模式下，output schema 指导 LLM 生成结构化 JSON
- **注意**：output schema **不传给 LLM 的 Function Calling**（CPU 不需要知道返回格式），但在 `mode: llm` 时会编译到 prompt 中指导 LLM 输出。

```json
"output": {
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "snippet": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    },
    "count": { "type": "number" }
  }
}
```

#### `mode` — 执行模式

- **类型**：`"code" | "llm" | "composite"`
- **必填**：是
- **说明**：决定 Skill 的函数体（实现）来自哪里、怎么执行。

| mode | 类比 | 函数体来源 | 确定性 | 何时用 |
|------|------|-----------|--------|--------|
| `code` | 硬件指令 | `index.ts` 导出 `execute` 函数 | ✅ 确定性 | 需要精确控制的操作：I/O、计算、API 调用 |
| `llm` | CPU 运算 | `prompt.md`（提示词作为微码） | ❌ 非确定性 | 需要理解、生成、判断的操作：总结、审查、分类 |
| `composite` | 微程序 | `pipeline` 字段（或 `index.ts`） | 取决于子步骤 | 组合多个 Skill 的工作流：搜索→总结、分析→报告 |

- **与实现文件的关系**：

```
mode: "code"       → 必须有 index.ts，导出 execute 函数
mode: "llm"        → 必须有 prompt.md（或 skill.json 内嵌 prompt 字段）
mode: "composite"  → 必须有 pipeline 字段，或 index.ts 中用 ctx.call() 手动编排
```

#### `calls` — 依赖声明

- **类型**：`string[]`
- **必填**：否
- **默认值**：`[]`
- **说明**：声明此 Skill 会调用（`ctx.call()`）的其他 Skill 名称。用途：
  1. **依赖检查**：`loader.ts` 在加载时验证依赖是否注册
  2. **调用图可视化**：前端可展示 Skill 之间的调用关系
  3. **循环检测**：配合 `depth` 机制防止无限递归
- **注意**：这是**声明式的**——即使不写 `calls`，代码里也能 `ctx.call()` 任意 Skill（只要已注册）。`calls` 是元数据，用于静态分析，不做运行时强制限制。

```json
"calls": ["memory_search"]                  // 写入前先搜索去重
"calls": ["memory_search", "summarize"]     // 搜索然后总结
"calls": []                                 // 不依赖其他 Skill
```

#### `pipeline` — 微程序（composite 模式步骤定义）

- **类型**：`PipelineStep[]`
- **必填**：仅 `mode: "composite"` 时必填（若不用 index.ts 手动编排）
- **说明**：声明式的步骤序列，定义 composite Skill 的执行流程。每一步是一次 Skill 调用。

**PipelineStep 字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `step` | `string` | 是 | 步骤名（标签），后续步骤通过 `{{steps.<step>.<field>}}` 引用其结果 |
| `skill` | `string` | 是 | 要执行的 Skill 名称 |
| `input` | `object` | 是 | 传给 Skill 的输入，支持模板语法引用上游数据 |
| `condition` | `string` | 否 | 条件表达式，为 false 时跳过此步骤 |
| `foreach` | `string` | 否 | 迭代器表达式，对数组每个元素执行一次此步骤 |

**模板语法**：

| 语法 | 含义 | 示例 |
|------|------|------|
| `{{input.xxx}}` | 引用 Pipeline 的输入参数 | `{{input.topic}}` |
| `{{steps.<step>.<field>}}` | 引用上游步骤的输出字段 | `{{steps.search.results}}` |
| `{{item}}` / `{{item.xxx}}` | foreach 循环中的当前元素 | `{{item.snippet}}` |
| `\|` 管道操作符 | 数据转换 | `{{steps.search.results \| pluck:snippet \| join:\\n}}` |

```json
"pipeline": [
  {
    "step": "search",
    "skill": "memory_search",
    "input": { "query": "{{input.topic}}", "limit": "{{input.limit}}" }
  },
  {
    "step": "summarize",
    "skill": "summarize",
    "input": { "text": "{{steps.search.results | pluck:snippet | join:\\n\\n}}" },
    "condition": "{{steps.search.count > 0}}"
  }
]
```

#### `outputMapping` — 微程序输出映射

- **类型**：`Record<string, string>`（键 = 输出字段名，值 = 模板表达式）
- **必填**：否（仅 `mode: "composite"` 时有意义）
- **说明**：定义 composite Skill 最终输出如何从各步骤结果中组装。支持与 `pipeline.input` 相同的模板语法。
- 如果省略，默认返回最后一步的完整输出。

```json
"outputMapping": {
  "summary": "{{steps.summarize.summary || '未找到相关内容'}}",
  "sources": "{{steps.search.results}}",
  "count": "{{steps.search.count}}"
}
```

#### `version` — 版本号

- **类型**：`string`（语义化版本 SemVer）
- **必填**：否
- **默认值**：`"1.0.0"`
- **说明**：Skill 的版本号。遵循 SemVer 规范 `MAJOR.MINOR.PATCH`：
  - `MAJOR`：input/output schema 不兼容变更
  - `MINOR`：新增可选参数、新功能（向后兼容）
  - `PATCH`：Bug 修复、prompt 优化

#### `tags` — 标签

- **类型**：`string[]`
- **必填**：否
- **默认值**：`[]`
- **说明**：自由标签，用于 Skill 发现和过滤。与 `category`（单值分类）互补，`tags` 支持多维度标注。
- **常见标签**：

| 标签 | 含义 |
|------|------|
| `internal` | 内部使用，不暴露给用户交互（如 `auto_recall`） |
| `auto` | 自动触发（beforeSkills / afterSkills） |
| `destructive` | 有副作用，会修改或删除数据 |
| `readonly` | 只读操作，无副作用 |
| `slow` | 执行时间较长（提示前端展示 loading） |

```json
"tags": ["memory", "auto", "internal"]    // 自动执行的内部记忆操作
"tags": ["code", "security", "quality"]   // 代码安全和质量审查
```

#### `author` — 作者

- **类型**：`string`
- **必填**：否
- **说明**：Skill 的创建者。未来 Skill 市场/分享场景使用。

```json
"author": "openevo-team"
```

#### `timeout` — 超时时间

- **类型**：`number`（毫秒）
- **必填**：否
- **默认值**：`30000`（30 秒）
- **说明**：单次 Skill 执行的最大允许时间。超时抛出 `SkillTimeoutError`，结果以 `isError: true` 返回给 LLM。
- **设计建议**：
  - `code` 模式（I/O 操作）：10000-30000ms
  - `llm` 模式（LLM 推理）：30000-120000ms（大模型推理耗时较长）
  - `composite` 模式：各子步骤超时之和，或设更宽裕的总超时
  - `auto_recall`（DMA 预取）：建议 10000ms（预取不该阻塞太久）

```json
"timeout": 10000     // auto_recall — 快速预取
"timeout": 30000     // memory_search — 普通 I/O（默认值）
"timeout": 60000     // code_review — LLM 推理，需要更长时间
```

#### `retry` — 重试次数

- **类型**：`number`
- **必填**：否
- **默认值**：`0`（不重试）
- **说明**：执行失败时的自动重试次数。重试由 Agent 在 `ctx.call()` 内部处理，对调用方透明。
- **注意**：
  - 仅对**临时性错误**（网络超时、数据库锁）有意义
  - `SkillValidationError`（类型错误）和 `SkillDepthError`（递归超限）**不会重试**
  - 每次重试间隔由 Agent 决定（建议指数退避）

```json
"retry": 0     // 默认不重试
"retry": 2     // 最多重试 2 次（共执行 3 次）
```

### 4.3 完整 skill.json 示例

```json
{
  "name": "memory_store",
  "description": "保存重要信息到长期记忆。只在用户明确要求记住或信息确实重要时使用。",
  "category": "memory",
  "input": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "要保存的内容" },
      "category": {
        "type": "string",
        "enum": ["preference", "fact", "decision", "entity", "other"],
        "description": "记忆分类"
      }
    },
    "required": ["text"]
  },
  "output": {
    "type": "object",
    "properties": {
      "stored": { "type": "boolean" },
      "reason": { "type": "string" }
    }
  },
  "mode": "code",
  "calls": ["memory_search"],
  "version": "1.0.0",
  "tags": ["memory", "store", "destructive"],
  "author": "openevo-team",
  "timeout": 30000,
  "retry": 1
}
```

### 4.4 三种执行模式

| mode | 类比 | 实现文件 | 特征 |
|------|------|---------|------|
| `code` | 硬件指令（确定性） | index.ts 导出 `execute` | 输入相同输出相同 |
| `llm` | CPU 运算（非确定性） | prompt.md 作为微码 | 每次输出可能不同 |
| `composite` | 微程序 / 宏指令 | pipeline 或 index.ts | 组合其他指令 |

### 4.5 目录约定

```
<skill-name>/
├── skill.json        ← 必须（指令规格书）
├── index.ts          ← mode: code / composite（指令实现）
└── prompt.md         ← mode: llm（CPU 微码）
```

---

## 5. Skill 示例

### 5.1 内置记忆 Skill（evolang 内核提供）

记忆 Skill 是 evolang 语言的**内置系统调用**，不是宿主业务代码。它们位于 `evolang/src/memory/skills/` 目录下，由 `MemoryManager.registerSkills()` 自动注册到 SkillRegistry。

**关键区别**：Skill 代码通过 `ctx.memory`（内核组件）访问存储，而不是 `ctx.env.memory`（外设端口）。

#### `memory_search` — 磁盘读（语义搜索）

```json
{
  "name": "memory_search",
  "description": "搜索用户的长期记忆和日志。当用户问到之前讨论过的内容时使用。",
  "category": "memory",
  "input": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "搜索查询（自然语言）" },
      "limit": { "type": "number", "default": 5, "description": "最大返回数量" }
    },
    "required": ["query"]
  },
  "output": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "text": { "type": "string" },
            "score": { "type": "number" },
            "category": { "type": "string" }
          }
        }
      },
      "count": { "type": "number" }
    }
  },
  "mode": "code",
  "calls": [],
  "version": "1.0.0",
  "tags": ["memory", "search", "builtin"]
}
```

```typescript
// evolang/src/memory/skills/search/index.ts
// 注意：这是 evolang 内部代码，不 import 宿主任何东西
import type { SkillExecutor } from '../../types'

export const execute: SkillExecutor = async (input, ctx) => {
  const query = input.query as string
  const limit = (input.limit as number) || 5
  // ctx.memory = 内核记忆管理器（不是 ctx.env.memory）
  const results = await ctx.memory.search(query, limit)
  return { results, count: results.length }
}
```

#### `memory_store` — 磁盘写（内核自动去重）

```json
{
  "name": "memory_store",
  "description": "保存重要信息到长期记忆。只在用户明确要求记住或信息确实重要时使用。",
  "category": "memory",
  "input": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "要保存的内容" },
      "category": { "type": "string", "enum": ["preference", "fact", "decision", "entity", "other"] }
    },
    "required": ["text"]
  },
  "output": {
    "type": "object",
    "properties": {
      "stored": { "type": "boolean" },
      "reason": { "type": "string" }
    }
  },
  "mode": "code",
  "calls": [],
  "version": "1.0.0",
  "tags": ["memory", "store", "builtin"]
}
```

```typescript
// evolang/src/memory/skills/store/index.ts
import type { SkillExecutor } from '../../types'

export const execute: SkillExecutor = async (input, ctx) => {
  const text = input.text as string
  const category = input.category as string | undefined
  // 去重逻辑在 MemoryManager.store() 内部处理 — Skill 不需要关心
  return ctx.memory.store(text, category)
}
```

#### `memory_forget` — 磁盘删除

```json
{
  "name": "memory_forget",
  "description": "删除记忆中的指定内容。当用户明确要求遗忘或删除某些信息时使用。",
  "category": "memory",
  "input": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "要删除的内容（模糊匹配）" }
    },
    "required": ["query"]
  },
  "output": {
    "type": "object",
    "properties": {
      "deleted": { "type": "number" }
    }
  },
  "mode": "code",
  "calls": [],
  "version": "1.0.0",
  "tags": ["memory", "delete", "builtin"]
}
```

### 5.2 DMA / 回写 — 内核函数（不再是 Skill）

auto_recall 和 auto_capture **不再是 Skill**。它们是 `MemoryManager` 的内核方法，由 Agent 在 `run()` 生命周期中自动调用。

```
之前（Skill 模式）：
  Agent.run() → beforeSkills: ['auto_recall'] → 当作普通 Skill 执行
  Agent.run() → afterSkills: ['auto_capture'] → 当作普通 Skill 执行
  问题：DMA 控制器不应该是"用户空间程序"

之后（内核模式）：
  Agent.run() → memoryManager.recall(message)  → 内核直接执行，无需 Skill 包装
  Agent.run() → memoryManager.capture(message, response) → 内核直接执行
  正确：DMA/回写是 OS 内核功能
```

详细实现见 Section 6.3 Agent 的 `run()` 方法。

### 5.3 CPU 运算指令（mode: llm）

#### `summarize` — 纯 CPU 运算

```json
{
  "name": "summarize",
  "description": "总结给定文本，返回简洁的中文摘要",
  "category": "text",
  "input": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "要总结的文本" },
      "maxLength": { "type": "number", "default": 500 }
    },
    "required": ["text"]
  },
  "output": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" }
    }
  },
  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["text", "summarize"]
}
```

**prompt.md**（CPU 微码）:
```markdown
你是一个摘要助手。用中文简洁总结用户提供的文本。

要求：
- 保留关键信息和核心观点
- 去除冗余和重复
- 按重要性排列要点

以 JSON 返回：{ "summary": "..." }
```

#### `code_review`

```json
{
  "name": "code_review",
  "description": "审查代码，检查安全漏洞、质量问题和最佳实践",
  "category": "code",
  "input": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "要审查的代码" },
      "language": { "type": "string" },
      "severity": { "type": "string", "enum": ["critical", "high", "medium", "all"], "default": "all" }
    },
    "required": ["code"]
  },
  "output": {
    "type": "object",
    "properties": {
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["critical", "high", "medium"] },
            "category": { "type": "string" },
            "line": { "type": "number" },
            "message": { "type": "string" },
            "suggestion": { "type": "string" }
          }
        }
      },
      "verdict": { "type": "string", "enum": ["pass", "warn", "block"] },
      "summary": { "type": "string" }
    }
  },
  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["code", "security", "quality"],
  "timeout": 60000
}
```

### 5.4 微程序指令（mode: composite）

#### `research_and_summarize` — I/O + CPU 组合

```json
{
  "name": "research_and_summarize",
  "description": "搜索记忆中的相关内容并总结",
  "category": "workflow",
  "input": {
    "type": "object",
    "properties": {
      "topic": { "type": "string" },
      "limit": { "type": "number", "default": 10 }
    },
    "required": ["topic"]
  },
  "output": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "sources": { "type": "array" },
      "count": { "type": "number" }
    }
  },
  "mode": "composite",
  "calls": ["memory_search", "summarize"],
  "pipeline": [
    {
      "step": "search",
      "skill": "memory_search",
      "input": { "query": "{{input.topic}}", "limit": "{{input.limit}}" }
    },
    {
      "step": "summarize",
      "skill": "summarize",
      "input": { "text": "{{steps.search.results | pluck:snippet | join:\\n\\n}}" },
      "condition": "{{steps.search.count > 0}}"
    }
  ],
  "outputMapping": {
    "summary": "{{steps.summarize.summary || '未找到相关内容'}}",
    "sources": "{{steps.search.results}}",
    "count": "{{steps.search.count}}"
  },
  "version": "1.0.0",
  "tags": ["workflow", "research"]
}
```

---

## 6. evolang 核心模块

### 6.1 SkillRegistry — 指令表

```typescript
class SkillRegistry {
  private skills = new Map<string, RegisteredSkill>()

  register(skill: RegisteredSkill): void
  unregister(name: string): void
  get(name: string): RegisteredSkill | undefined
  has(name: string): boolean
  list(): RegisteredSkill[]
  listByCategory(category: string): RegisteredSkill[]
  get size(): number

  /** 转为 CPU 可理解的指令列表 */
  toToolDefinitions(): ToolDefinition[]

  /** 生成指令集说明（注入固件/system prompt） */
  toSystemPrompt(): string
}
```

`toToolDefinitions()` 映射：
```
SkillMeta.name        → ToolDefinition.name
SkillMeta.description → ToolDefinition.description
SkillMeta.input       → ToolDefinition.parameters
SkillMeta.output      → （不传给 CPU — CPU 不需要知道返回格式）
```

### 6.2 SkillContextImpl — 执行上下文实现

```typescript
class SkillContextImpl<TEnv> implements SkillContext<TEnv> {
  constructor(
    private registry: SkillRegistry,
    public memory: MemoryManager,            // ═══ 内核存储系统 ═══
    public env: TEnv,                        // I/O 端口（宿主外设）
    public scratch: Map<string, unknown>,    // 寄存器
    private _emit: (event: RunEvent) => void, // 中断控制器
    private _logger: Logger,                 // 调试串口
    private _llm: LLMProvider,               // CPU 接口
    private _defaultModel: { model: string; providerId: string },
    public depth: number,                    // 调用栈深度
    public maxDepth: number,                 // 栈深度上限
    public parentSkill: string | undefined,  // 调用者
    public taskId: string,                   // 进程 ID
  ) {}

  async call<T>(name: string, input: Record<string, unknown>): Promise<T> {
    // 栈溢出检查
    if (this.depth >= this.maxDepth) {
      throw new SkillDepthError(name, this.depth, this.maxDepth)
    }

    const skill = this.registry.get(name)
    if (!skill) throw new SkillNotFoundError(name)

    // 操作数格式校验
    validateSchema(input, skill.meta.input, name, 'input')

    const startTime = Date.now()
    this._emit({ type: 'skill_call', skill: name, input, depth: this.depth + 1, timestamp: startTime })

    // fork 子上下文（新栈帧）— memory 共享同一个内核实例
    const childCtx = new SkillContextImpl(
      this.registry, this.memory, this.env, this.scratch, this._emit, this._logger,
      this._llm, this._defaultModel,
      this.depth + 1, this.maxDepth, name, this.taskId,
    )

    const output = await skill.execute(input, childCtx)

    // 结果格式校验
    validateSchema(output, skill.meta.output, name, 'output')

    const duration = Date.now() - startTime
    this._emit({ type: 'skill_result', skill: name, output, duration, timestamp: Date.now() })

    return output as T
  }

  async llm(options): Promise<string> {
    // 协处理器调用 — 请求 CPU 做一次独立运算
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

  emit(event: RunEvent) { this._emit(event) }
  log(msg: string) { this._logger.info(`[Skill:${this.parentSkill || 'root'}:d${this.depth}] ${msg}`) }
}
```

### 6.3 Agent — 操作系统

```typescript
class Agent<TEnv = Record<string, unknown>> {
  private registry = new SkillRegistry()
  private memoryManager: MemoryManager

  constructor(private options: AgentOptions<TEnv>) {
    // ═══ 内核初始化：创建记忆子系统 ═══
    this.memoryManager = new MemoryManagerImpl(options.storage, options.memoryOptions)
    // 自动注册内置记忆 Skill（memory_search, memory_store, memory_forget）
    this.memoryManager.registerSkills(this.registry)
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
   * 执行一个进程
   *
   * 完整的进程生命周期：
   * 1. 创建 I/O 环境（open 外设）
   * 2. 内核 DMA 预取（memoryManager.recall — 不是 Skill）
   * 3. 加载固件（PromptCompiler → system prompt）
   * 4. CPU fetch-decode-execute 循环（LLM 推理 + 系统调用）
   * 5. 内核回写（memoryManager.capture — 不是 Skill）
   * 6. 进程退出
   */
  async *run(input: RunInput): AsyncGenerator<RunEvent> {
    const events: RunEvent[] = []
    const emit = (e: RunEvent) => { events.push(e) }

    // 1. 打开外设（宿主特有的 I/O，不含 memory）
    const env = this.options.createEnv
      ? await this.options.createEnv(input)
      : ({} as TEnv)
    const scratch = new Map<string, unknown>()
    const logger = this.options.logger || console

    const defaultModel = {
      model: input.model || '',
      providerId: input.providerId || '',
    }

    // 创建根执行上下文 — memory 是内核组件，不是外设
    const ctx = new SkillContextImpl<TEnv>(
      this.registry, this.memoryManager, env, scratch, emit, logger,
      this.options.llm, defaultModel,
      0, this.options.maxDepth || 10, undefined, input.taskId,
    )

    // 2. ═══ 内核 DMA 预取 ═══
    //    不再是 beforeSkills 里的 Skill，而是 OS 内核直接执行
    if (this.options.memoryOptions?.autoRecall !== false) {
      try {
        const recalled = await this.memoryManager.recall(input.message)
        scratch.set('relevantMemories', recalled)
        logger.info(`[Agent] DMA recall: ${recalled.length} entries loaded`)
      } catch (err) {
        logger.warn(`[Agent] DMA recall failed:`, err)
      }
    }

    // 执行额外的 beforeSkills（如果有）
    for (const name of this.options.beforeSkills || []) {
      if (this.registry.has(name)) {
        try { await ctx.call(name, { query: input.message }) }
        catch (err) { logger.warn(`[Agent] beforeSkill ${name} failed:`, err) }
      }
    }
    for (const e of events.splice(0)) yield e

    // 3. 加载固件 — 编译 system prompt（RAM 初始化）
    //    PromptCompiler 可以从 scratch.relevantMemories 读取预取的记忆
    const systemPrompt = await this.options.prompt.compile({
      skills: this.registry.toToolDefinitions(),
      env: env as Record<string, unknown>,
      scratch,
      memory: {
        longTerm: this.memoryManager.loadLongTerm(),
        dailyLog: this.memoryManager.loadDailyLog(),
      },
    })

    // 4. CPU fetch-decode-execute 循环
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.message },
    ]

    let finalResponse = ''

    const flushEvents = function* () {
      const batch = events.splice(0)
      for (const e of batch) yield e
    }

    for await (const llmEvent of this.options.llm.chatWithTools(
      messages,
      { ...defaultModel, tools: this.registry.toToolDefinitions() },
      async (name, args) => {
        try {
          const output = await ctx.call(name, args)
          return { output }
        } catch (err) {
          return { output: { error: err instanceof Error ? err.message : String(err) }, isError: true }
        }
      },
    )) {
      yield* flushEvents()

      if (llmEvent.type === 'token') {
        finalResponse = llmEvent.fullResponse || ''
        yield { type: 'token' as const, content: llmEvent.content, fullResponse: llmEvent.fullResponse, timestamp: Date.now() }
      } else if (llmEvent.type === 'error') {
        yield { type: 'error' as const, error: llmEvent.error, timestamp: Date.now() }
        return
      } else if (llmEvent.type === 'done') {
        finalResponse = llmEvent.fullResponse || finalResponse
      }
    }

    scratch.set('finalResponse', finalResponse)

    // 5. ═══ 内核回写 ═══
    //    不再是 afterSkills 里的 Skill，而是 OS 内核直接执行
    if (this.options.memoryOptions?.autoCapture !== false) {
      try {
        const { captured, entries } = await this.memoryManager.capture(input.message, finalResponse)
        if (captured > 0) {
          logger.info(`[Agent] Writeback: captured ${captured} entries`, entries)
        }
      } catch (err) {
        logger.warn(`[Agent] Writeback failed:`, err)
      }
    }

    // 执行额外的 afterSkills（如果有）
    for (const name of this.options.afterSkills || []) {
      if (this.registry.has(name)) {
        try { await ctx.call(name, { message: input.message, response: finalResponse }) }
        catch (err) { logger.warn(`[Agent] afterSkill ${name} failed:`, err) }
      }
    }
    yield* flushEvents()

    // 6. 进程退出
    yield { type: 'done' as const, fullResponse: finalResponse, timestamp: Date.now() }
  }
}
```

### 6.4 公开 API — `evolang/src/index.ts`

```typescript
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
  // 其他硬件接口
  PromptCompiler, ContextBudget, Logger,
}

// 类
export { Agent } from './agent'
export { SkillRegistry } from './registry'
export { SkillContextImpl } from './context'
export { MemoryManagerImpl } from './memory/manager'

// 工具
export { loadSkillsFromDir } from './loader'
export { validateSchema } from './validator'

// 异常
export { SkillNotFoundError, SkillDepthError, SkillValidationError, SkillTimeoutError } from './errors'
```

---

## 7. 宿主侧 — desktop 怎么用 evolang

宿主的职责大幅简化。不再需要实现 memory 相关任何东西，只需提供：
1. **CPU 驱动**（LLMProvider）
2. **硬盘位置**（StorageBackend — 一个路径字符串）
3. **外设**（config 等宿主特有的功能）

### 7.1 `adapters/env.ts` — 宿主环境类型（不含 memory）

```typescript
/**
 * Desktop 宿主的外设 — 注意：memory 不再在这里！
 *
 * memory 已经是 evolang 内核的一部分，不需要宿主操心。
 * env 里只放宿主特有的非存储功能。
 */
export interface DesktopEnv {
  config: {
    activeProvider: { providerId: string; model: string } | null
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
  session: {
    id: string
    appendTranscript(entry: unknown): void
  }
}
```

### 7.2 `adapters/llm.ts` — LLMProvider 实现（不变）

```typescript
import type { LLMProvider } from 'evolang'
import { LLMClient } from '../providers/llm-client'

export function createLLMProvider(client: LLMClient): LLMProvider {
  return {
    async *chat(messages, options) {
      yield* client.chat(messages as any, options as any)
    },
    async *chatWithTools(messages, options, skillExecutor) {
      const toolExecutor = async (toolCall: any) => {
        const result = await skillExecutor(toolCall.name, toolCall.arguments)
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify(result.output),
          isError: result.isError,
        }
      }
      yield* client.chatWithTools(messages as any, options as any, toolExecutor)
    },
  }
}
```

### 7.3 `main/index.ts` — 组装 Agent

```typescript
import { Agent } from 'evolang'
import type { DesktopEnv } from './adapters/env'
import { createLLMProvider } from './adapters/llm'
import { llmClient } from './providers/llm-client'
import { desktopPromptCompiler } from './adapters/prompt'
import { app } from 'electron'
import path from 'path'

const agent = new Agent<DesktopEnv>({
  // CPU 驱动
  llm: createLLMProvider(llmClient),

  // 存储后端 — 只需告诉内核"硬盘在哪里"
  storage: {
    dataDir: path.join(app.getPath('userData'), 'memory'),
    // embed: 可选，不提供则用内置实现
  },

  // 固件加载器
  prompt: desktopPromptCompiler,

  // 外设（不含 memory — 内核自己管理）
  createEnv: (input) => ({
    config: { /* ... */ },
    session: { id: input.taskId, appendTranscript: () => {} },
  }),

  // 记忆配置（全部可选，有合理默认值）
  memoryOptions: {
    autoRecall: true,       // 自动预取（默认 true）
    autoCapture: true,      // 自动回写（默认 true）
    deduplicationThreshold: 0.92,
  },

  // 不再需要 beforeSkills: ['auto_recall'] — 内核自动处理
  // 不再需要 afterSkills: ['auto_capture'] — 内核自动处理
})

app.whenReady().then(async () => {
  // 只加载业务 Skill（text、code 等）
  // 记忆 Skill（memory_search、memory_store、memory_forget）已由内核自动注册
  await agent.loadSkills(path.join(__dirname, 'skills'))
  registerIpcHandlers(agent)
  createWindow()
})
```

### 7.4 `ipc.ts` — 瘦层（不变）

```typescript
import type { Agent } from 'evolang'
import type { DesktopEnv } from './adapters/env'

export function registerIpcHandlers(agent: Agent<DesktopEnv>) {
  ipcMain.handle('task:create', async (event, taskId, message, providerId?, model?) => {
    const sender = event.sender
    let lastResponse = ''

    for await (const e of agent.run({ taskId, message, providerId, model })) {
      sender.send('task:stream', { taskId, ...e })
      if (e.type === 'done') lastResponse = e.fullResponse || ''
      if (e.type === 'error') return { error: e.error }
    }

    return { reply: lastResponse }
  })

  // ... provider:*, config:* handlers 不变 ...
  // 注意：memory:* handlers 可以移除 — 记忆由 evolang 内核管理
}
```

---

## 8. 依赖关系图

```
evolang（核心 — 大脑）
  依赖: better-sqlite3（可选，记忆存储引擎）
  │
  ├── src/             语言核心（类型、Agent、Registry、Pipeline…）
  ├── src/memory/      记忆子系统（MemoryManager、auto-recall、auto-capture）
  └── src/memory/skills/  内置记忆 Skill（memory_search、memory_store、memory_forget）
  ↑
  │ import { Agent } from 'evolang'
  │ import type { StorageBackend, SkillExecutor, SkillContext } from 'evolang'
  │
desktop（宿主 — 躯壳）
  依赖: evolang + electron + @anthropic-ai/sdk + openai
  │
  ├── adapters/llm.ts       CPU 驱动（LLMProvider 实现）
  ├── adapters/storage.ts   存储后端（只提供 dataDir 路径）
  ├── adapters/prompt.ts    固件加载器（PromptCompiler 实现）
  ├── skills/               业务 Skill（text、code — 不含 memory）
  └── ipc.ts                for await (agent.run()) → sender.send()
```

**注意**：`better-sqlite3` 从 `desktop` 移到了 `evolang`。记忆存储引擎是语言内核的一部分。

Skill 的 import 模式（两种）：

```typescript
// ═══ evolang 内置 Skill（记忆相关） ═══
// 只 import evolang 内部类型，不依赖任何宿主代码
import type { SkillExecutor } from '../../types'
export const execute: SkillExecutor = async (input, ctx) => {
  return ctx.memory.search(input.query as string)  // 内核 API
}

// ═══ 宿主业务 Skill（text、code 等） ═══
// import evolang 类型 + 宿主环境类型
import type { SkillExecutor } from 'evolang'
import type { DesktopEnv } from '../../adapters/env'
export const execute: SkillExecutor<DesktopEnv> = async (input, ctx) => {
  // ctx.memory — 内核记忆（所有 Skill 都能访问）
  // ctx.env    — 宿主外设（config、session 等）
}
```

---

## 9. evolang 的 package.json

```json
{
  "name": "evolang",
  "version": "0.1.0",
  "description": "A programming language runtime for LLM agents — with built-in memory",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "optionalDependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "typescript": "^5.0.0"
  }
}
```

**依赖策略**：`better-sqlite3` 放在 `optionalDependencies`。如果宿主环境无法编译原生模块（如 Web 端），evolang 退化为纯文件存储。记忆是内核功能，但存储引擎可以降级。

---

## 10. 实施顺序

```
Phase 1: 体系结构定义（evolang 核心骨架）
  evolang/src/types.ts              ISA + 所有接口规范
  evolang/src/errors.ts             异常类型
  evolang/src/validator.ts          类型校验
  evolang/src/registry.ts           指令表
  evolang/src/context.ts            执行上下文（含 memory 字段）
  evolang/src/pipeline.ts           程序执行器
  evolang/src/loader.ts             指令加载器
  evolang/src/index.ts              公开 API
  evolang/package.json
  evolang/tsconfig.json

Phase 2: 记忆子系统（evolang 内核）  ← 新增，核心变化
  evolang/src/memory/types.ts           StorageBackend + MemoryEntry
  evolang/src/memory/manager.ts         MemoryManagerImpl（搜索、存储、去重）
  evolang/src/memory/auto-recall.ts     DMA 预取逻辑
  evolang/src/memory/auto-capture.ts    回写逻辑
  evolang/src/memory/skills/search/     内置 memory_search Skill
  evolang/src/memory/skills/store/      内置 memory_store Skill
  evolang/src/memory/skills/forget/     内置 memory_forget Skill

Phase 3: Agent 集成
  evolang/src/agent.ts              Agent（内置 MemoryManager + 自动预取/回写）

Phase 4: 硬件驱动（宿主适配）
  desktop/main/adapters/llm.ts       CPU 驱动
  desktop/main/adapters/storage.ts   存储后端（提供 dataDir）
  desktop/main/adapters/prompt.ts    固件加载器

Phase 5: 业务 Skill
  desktop/main/skills/text/summarize/   CPU 运算
  desktop/main/skills/code/review/      CPU 运算
  desktop/main/skills/...               更多业务 Skill

Phase 6: 系统集成
  desktop/main/index.ts      开机引导 — Agent({ storage, llm, prompt })
  desktop/main/ipc.ts        I/O 端口

Phase 7: 清理
  删除 desktop/main/memory/              旧记忆基础设施（已迁入 evolang）
  删除 desktop/main/tools/registry.ts    旧指令表
  删除 desktop/main/skills/memory/       旧记忆 Skill（已内置于 evolang）
```

---

## 11. Skill 执行机制与语法约定

### 11.1 设计哲学：显式意图识别 vs 隐式 Function Calling

OpenClaw（及大部分 Agent 框架）的做法：

```
用户输入 → 直接扔给 LLM + 全部 Tool 定义 → LLM 自己决定调哪个
```

这是 **隐式路由**——LLM 既是"裁判"又是"球员"。优点是简单，缺点是：
- **不可追踪**：不知道 LLM 为什么选了这个 Tool
- **不可优化**：无法对路由决策做缓存、统计、热路径优化
- **不可控制**：所有 Tool 暴露给 LLM，增加 token 消耗和选择错误

EvoLang 的做法——**显式意图识别**：

```
用户输入 → intent_recognize（CPU 轻量运算）→ 路由决策 → 针对性执行
```

类比计算机：
- **隐式路由** = 把所有外设驱动都加载到内存，CPU 自己猜该用哪个
- **显式路由** = 先查中断向量表（IVT），确定中断号，再跳转到对应的处理程序

### 11.2 执行流程总览

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Phase 0: 内核准备                                     │
│   ├── DMA 预取（memoryManager.recall）                │
│   └── 加载 Skill 注册表快照                            │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1: 意图识别（intent_recognize）                  │
│   输入: 用户消息 + 可用 Skill 列表 + 记忆上下文         │
│   输出: intents[] + entities{} + routing{}             │
│                                                       │
│   routing.strategy 决定 Phase 2 走哪条路:              │
│     ├── direct_answer  → 直接输出，不进 LLM 循环        │
│     ├── single_skill   → 调用指定 Skill → 格式化输出    │
│     ├── multi_skill    → 进入 chatWithTools（工具受限）  │
│     ├── pipeline       → 按序执行 Skill 链              │
│     └── clarify        → 追问用户                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2: 分支执行（按 routing.strategy）               │
│                                                       │
│   direct_answer:                                      │
│     yield token events → done                          │
│                                                       │
│   single_skill:                                       │
│     ctx.call(skill, input) → 用 LLM 格式化结果 → done  │
│                                                       │
│   multi_skill:                                        │
│     chatWithTools(filteredTools) → LLM 自主编排 → done  │
│                                                       │
│   pipeline:                                           │
│     for step in routing.skills:                        │
│       ctx.call(step.skill, step.input) → 串联         │
│     LLM 格式化最终结果 → done                          │
│                                                       │
│   clarify:                                            │
│     yield clarification message → done                 │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Phase 3: 内核收尾                                     │
│   ├── 回写（memoryManager.capture）                   │
│   └── 追加日志                                        │
└─────────────────────────────────────────────────────┘
```

### 11.3 与 OpenClaw 的对比

| 维度 | OpenClaw（隐式） | EvoLang（显式） |
|------|-----------------|----------------|
| **路由方式** | LLM 看全部 Tool，自行选择 | intent_recognize 先分类，再定向执行 |
| **Tool 暴露** | 所有 Tool 全部传给 LLM | 只传 routing 建议的 Skill |
| **Token 消耗** | 高（每次传全部 Tool schema） | 低（intent_recognize 轻量，后续精准） |
| **可追踪性** | 黑盒（不知为什么选这个 Tool） | 白盒（intents + routing 全部可记录） |
| **缓存优化** | 难（每次都是全新推理） | 容易（相同意图 → 相同路由，可缓存） |
| **Skill 发现** | 系统提示中列出 | intent_recognize 负责匹配 |
| **简单问题效率** | 也走完整 Tool loop | direct_answer 跳过 Tool loop |

### 11.4 Skill 加载与发现机制

```typescript
/**
 * Skill 加载器 — evolang/src/loader.ts
 *
 * 从目录递归扫描 skill.json，加载为 RegisteredSkill
 *
 * 加载顺序与优先级（高优先级覆盖低优先级）：
 *   1. evolang 内置 Skill（memory_search 等）— 由 MemoryManager 直接注册
 *   2. 宿主业务 Skill（text/summarize 等）— 由 agent.loadSkills(dir) 加载
 *   3. 用户自定义 Skill（未来支持）
 */
async function loadSkillsFromDir<TEnv>(dir: string): Promise<RegisteredSkill<TEnv>[]> {
  const results: RegisteredSkill<TEnv>[] = []

  // 递归扫描 skill.json
  for (const skillDir of await findSkillDirs(dir)) {
    const metaPath = path.join(skillDir, 'skill.json')
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as SkillMeta

    // 校验 skill.json
    validateSkillMeta(meta)

    // 加载执行器
    let execute: SkillExecutor<TEnv>

    switch (meta.mode) {
      case 'code': {
        // 加载 index.ts 导出的 execute 函数
        const mod = await import(path.join(skillDir, 'index'))
        execute = mod.execute
        break
      }
      case 'llm': {
        // 加载 prompt.md，生成 LLM 执行器
        const promptPath = path.join(skillDir, 'prompt.md')
        const promptTemplate = await fs.readFile(promptPath, 'utf-8')
        execute = createLLMExecutor(meta, promptTemplate)
        break
      }
      case 'composite': {
        // 使用 pipeline 生成复合执行器
        execute = createPipelineExecutor(meta)
        break
      }
    }

    results.push({ meta, execute })
  }

  return results
}

/**
 * LLM 模式执行器生成
 *
 * 将 prompt.md 编译为执行函数：
 * 1. 替换模板变量 {{input.xxx}}
 * 2. 调用 ctx.llm() 执行推理
 * 3. 解析 JSON 输出
 */
function createLLMExecutor<TEnv>(meta: SkillMeta, promptTemplate: string): SkillExecutor<TEnv> {
  return async (input, ctx) => {
    // 模板编译：替换 {{input.xxx}} 为实际值
    const compiledPrompt = compileTemplate(promptTemplate, { input })

    // 调用 CPU（LLM）做一次推理
    const rawOutput = await ctx.llm({
      system: `你是 ${meta.name} 技能的执行器。严格按照指定的 JSON 格式输出。`,
      prompt: compiledPrompt,
      temperature: 0.3,  // 低温度 = 更确定性的输出
    })

    // 解析 JSON 输出
    return parseJSONOutput(rawOutput, meta.output)
  }
}
```

### 11.5 模板语法规范

EvoLang 使用 `{{}}` 双大括号模板语法，适用于：
- `prompt.md`（LLM 模式提示词）
- `pipeline.input`（Pipeline 步骤参数映射）
- `outputMapping`（Pipeline 输出组装）

#### 变量引用

| 语法 | 含义 | 示例 |
|------|------|------|
| `{{input.xxx}}` | 引用 Skill 的输入参数 | `{{input.message}}` |
| `{{steps.<step>.<field>}}` | 引用 Pipeline 上游步骤的输出 | `{{steps.search.results}}` |
| `{{item}}` | foreach 循环中的当前元素 | `{{item.name}}` |
| `{{item.xxx}}` | 当前元素的属性 | `{{item.score}}` |
| `{{memory.longTerm}}` | 长期记忆内容 | — |
| `{{memory.relevant}}` | 预取的相关记忆 | — |

#### 管道操作符

```
{{expression | operator:arg1:arg2}}
```

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `pluck:field` | 从对象数组中提取指定字段 | `{{steps.search.results \| pluck:text}}` |
| `join:sep` | 数组拼接为字符串 | `{{items \| join:\\n}}` |
| `slice:start:end` | 数组切片 | `{{items \| slice:0:5}}` |
| `default:value` | 空值时使用默认值 | `{{input.limit \| default:5}}` |
| `json` | 序列化为 JSON 字符串 | `{{input.data \| json}}` |
| `format_skills` | 格式化 Skill 列表（内置） | `{{input.available_skills \| format_skills}}` |

#### 条件语法

```
{{#if condition}}
  ...content...
{{/if}}

{{#if input.conversation_summary}}
对话上下文：{{input.conversation_summary}}
{{/if}}
```

#### 循环语法（仅 Pipeline）

```json
{
  "step": "review_each",
  "skill": "code_review",
  "input": { "code": "{{item.content}}" },
  "foreach": "{{steps.search.results}}"
}
```

---

## 12. 第一个 Skill：`intent_recognize` — 意图识别

### 12.1 设计定位

`intent_recognize` 是 EvoLang 的**中断向量表查询指令**。每次用户输入到达时，Agent 首先执行此 Skill：

```
CPU 收到中断（用户输入）
  → 查中断向量表（intent_recognize）
  → 获得中断号（intent）+ 跳转地址（routing.skills）
  → 跳转到对应中断处理程序（执行 Skill）
```

它不执行任何业务逻辑，只做三件事：
1. **理解**：用户要什么？（intents）
2. **提取**：关键信息是什么？（entities）
3. **规划**：该怎么做？（routing）

### 12.2 skill.json

```json
{
  "name": "intent_recognize",
  "description": "分析用户输入，识别意图、提取实体、规划执行路径。这是 Agent 处理每条消息的第一步 — 先理解要做什么，再决定怎么做。不要直接调用此 Skill，它由 Agent 内核自动调用。",
  "category": "system",

  "input": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "用户输入的原始文本"
      },
      "available_skills": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" },
            "category": { "type": "string" }
          }
        },
        "description": "当前已注册的可用 Skill 列表（不含 system 类别）"
      },
      "conversation_summary": {
        "type": "string",
        "description": "近期对话摘要（可选，帮助理解上下文意图）"
      },
      "relevant_memories": {
        "type": "string",
        "description": "DMA 预取的相关记忆（可选）"
      }
    },
    "required": ["message", "available_skills"]
  },

  "output": {
    "type": "object",
    "properties": {
      "intents": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "意图标识（如 ask_question, store_memory, search_memory, generate_code, summarize_text, casual_chat）"
            },
            "confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "置信度（0-1）"
            },
            "description": {
              "type": "string",
              "description": "一句话说明此意图"
            }
          },
          "required": ["name", "confidence"]
        },
        "description": "识别到的意图，按置信度降序排列"
      },
      "entities": {
        "type": "object",
        "additionalProperties": true,
        "description": "从用户输入中提取的关键实体（人名、日期、数量、代码片段等）"
      },
      "routing": {
        "type": "object",
        "properties": {
          "strategy": {
            "type": "string",
            "enum": ["direct_answer", "single_skill", "multi_skill", "pipeline", "clarify"],
            "description": "执行策略"
          },
          "skills": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "description": "要调用的 Skill 名称"
                },
                "input": {
                  "type": "object",
                  "description": "预填的输入参数（从 entities 中提取）"
                },
                "reason": {
                  "type": "string",
                  "description": "选择此 Skill 的原因"
                }
              },
              "required": ["name", "reason"]
            },
            "description": "建议调用的 Skill 列表（按执行顺序）"
          },
          "direct_response": {
            "type": "string",
            "description": "仅当 strategy=direct_answer 时：直接回复内容"
          },
          "clarification": {
            "type": "string",
            "description": "仅当 strategy=clarify 时：要追问用户的问题"
          }
        },
        "required": ["strategy"]
      }
    },
    "required": ["intents", "routing"]
  },

  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["system", "routing", "builtin", "internal"],
  "author": "openevo-team",
  "timeout": 15000,
  "retry": 1
}
```

### 12.3 prompt.md — CPU 微码

```markdown
你是 EvoLang 的意图识别引擎。你的唯一职责是分析用户输入，输出结构化的路由决策。

## 规则

1. **不要回答用户的问题** — 你只做分类和路由，不做回答
2. **不要编造 Skill** — 只能路由到 available_skills 中列出的 Skill
3. **偏向精准** — 宁可说 "clarify" 也不要猜错意图
4. **速度优先** — 这是每条消息的第一步，必须快

## 输入

用户消息：
{{input.message}}

可用 Skill：
{{input.available_skills | format_skills}}

{{#if input.relevant_memories}}
相关记忆（DMA 预取）：
{{input.relevant_memories}}
{{/if}}

{{#if input.conversation_summary}}
对话上下文：
{{input.conversation_summary}}
{{/if}}

## 执行策略说明

| strategy | 何时使用 | 示例 |
|----------|---------|------|
| `direct_answer` | 简单问候、闲聊、常识问答，无需工具 | "你好"、"1+1等于几" |
| `single_skill` | 明确对应一个 Skill | "帮我总结这段文本" → summarize |
| `multi_skill` | 需要多个 Skill 但顺序不固定 | "搜索记忆并给我建议" |
| `pipeline` | 多个 Skill 且有明确的先后依赖 | "搜索相关代码然后审查" → search → review |
| `clarify` | 意图模糊或信息不足 | "帮我处理一下" — 处理什么？ |

## 意图命名约定

使用 `动作_对象` 格式，常见意图：

- `casual_chat` — 闲聊、问候
- `ask_question` — 知识性问答
- `search_memory` — 查找历史记忆
- `store_memory` — 记住某些信息
- `forget_memory` — 忘记/删除记忆
- `summarize_text` — 总结文本
- `generate_code` — 生成代码
- `review_code` — 审查代码
- `translate_text` — 翻译
- `analyze_data` — 数据分析
- `create_skill` — 创建新 Skill（自进化）

## 输出格式

严格输出 JSON（不要有其他文字）：

```json
{
  "intents": [
    { "name": "意图名", "confidence": 0.95, "description": "一句话说明" }
  ],
  "entities": {
    "topic": "...",
    "language": "...",
    "code_snippet": "..."
  },
  "routing": {
    "strategy": "single_skill",
    "skills": [
      {
        "name": "skill_name",
        "input": { "已提取的参数": "值" },
        "reason": "为什么选这个 Skill"
      }
    ]
  }
}
```

## 示例

**输入**："帮我搜一下昨天讨论的数据库方案"
**输出**：
```json
{
  "intents": [
    { "name": "search_memory", "confidence": 0.92, "description": "用户想查找昨天关于数据库方案的讨论记录" }
  ],
  "entities": {
    "topic": "数据库方案",
    "time_reference": "昨天"
  },
  "routing": {
    "strategy": "single_skill",
    "skills": [
      {
        "name": "memory_search",
        "input": { "query": "数据库方案 昨天讨论" },
        "reason": "用户明确要搜索历史讨论内容"
      }
    ]
  }
}
```

**输入**："你好"
**输出**：
```json
{
  "intents": [
    { "name": "casual_chat", "confidence": 0.98, "description": "简单问候" }
  ],
  "entities": {},
  "routing": {
    "strategy": "direct_answer",
    "direct_response": "你好！有什么我可以帮你的吗？"
  }
}
```

**输入**："搜索一下之前的代码然后帮我审查一下有没有安全问题"
**输出**：
```json
{
  "intents": [
    { "name": "search_memory", "confidence": 0.88, "description": "搜索之前的代码" },
    { "name": "review_code", "confidence": 0.85, "description": "审查代码安全问题" }
  ],
  "entities": {
    "review_focus": "安全问题"
  },
  "routing": {
    "strategy": "pipeline",
    "skills": [
      {
        "name": "memory_search",
        "input": { "query": "代码" },
        "reason": "先搜索之前的代码"
      },
      {
        "name": "code_review",
        "input": { "severity": "critical" },
        "reason": "然后对搜索到的代码做安全审查"
      }
    ]
  }
}
```
```

### 12.4 index.ts — 执行器（LLM 模式自动生成，但此处展示完整实现）

```typescript
// evolang/src/skills/intent_recognize/index.ts
//
// 注意：mode: "llm" 的 Skill 通常不需要手写 index.ts
// loader.ts 会自动从 prompt.md 生成执行器
// 这里展示完整实现，说明 LLM 模式的执行逻辑

import type { SkillExecutor } from '../../types'

export const execute: SkillExecutor = async (input, ctx) => {
  const message = input.message as string
  const availableSkills = input.available_skills as Array<{
    name: string; description: string; category: string
  }>
  const conversationSummary = input.conversation_summary as string | undefined
  const relevantMemories = input.relevant_memories as string | undefined

  // 构建 prompt（对应 prompt.md 的编译结果）
  const skillList = availableSkills
    .map(s => `- **${s.name}** [${s.category}]: ${s.description}`)
    .join('\n')

  const sections = [
    `用户消息：\n${message}`,
    `\n可用 Skill：\n${skillList}`,
  ]

  if (relevantMemories) {
    sections.push(`\n相关记忆（DMA 预取）：\n${relevantMemories}`)
  }
  if (conversationSummary) {
    sections.push(`\n对话上下文：\n${conversationSummary}`)
  }

  // 调用 CPU 做意图识别（低温度 = 更确定性）
  const rawOutput = await ctx.llm({
    system: SYSTEM_PROMPT,
    prompt: sections.join('\n'),
    temperature: 0.2,
    maxTokens: 1000,
  })

  // 解析 JSON
  try {
    const result = extractJSON(rawOutput)

    // 校验 routing.skills 中的 Skill 是否存在
    if (result.routing?.skills) {
      const knownNames = new Set(availableSkills.map(s => s.name))
      result.routing.skills = result.routing.skills.filter(
        (s: { name: string }) => knownNames.has(s.name)
      )

      // 如果过滤后没有 Skill 了，降级为 direct_answer
      if (result.routing.skills.length === 0 && result.routing.strategy !== 'direct_answer' && result.routing.strategy !== 'clarify') {
        result.routing.strategy = 'direct_answer'
        result.routing.direct_response = undefined  // 让主 LLM 回答
      }
    }

    return result
  } catch {
    // JSON 解析失败 → 降级为 multi_skill（让主 LLM 自行决定）
    ctx.log('intent_recognize: JSON parse failed, falling back to multi_skill')
    return {
      intents: [{ name: 'unknown', confidence: 0.5, description: '意图识别失败，降级处理' }],
      entities: {},
      routing: { strategy: 'multi_skill' as const, skills: [] },
    }
  }
}

/** 从 LLM 输出中提取 JSON（处理 markdown code block 等情况） */
function extractJSON(text: string): Record<string, unknown> {
  // 尝试直接解析
  try { return JSON.parse(text) } catch { /* continue */ }

  // 尝试提取 ```json ... ``` 块
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlock) {
    return JSON.parse(jsonBlock[1].trim())
  }

  // 尝试提取第一个 { ... } 块
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1))
  }

  throw new Error('No valid JSON found in LLM output')
}

const SYSTEM_PROMPT = `你是 EvoLang 的意图识别引擎。你的唯一职责是分析用户输入，输出结构化的路由决策。

规则：
1. 不要回答用户的问题 — 你只做分类和路由
2. 不要编造 Skill — 只能路由到 available_skills 中列出的 Skill
3. 偏向精准 — 宁可说 clarify 也不要猜错
4. 输出纯 JSON，不要有其他文字

执行策略：
- direct_answer: 简单问候/闲聊/常识，无需工具
- single_skill: 明确对应一个 Skill
- multi_skill: 需要多个 Skill，顺序不固定
- pipeline: 多个 Skill 有先后依赖
- clarify: 意图模糊，需要追问`
```

### 12.5 集成到 Agent.run() — 更新的执行流程

intent_recognize 改变了 Agent.run() 的执行策略。原来是"直接进入 chatWithTools"，现在是"先识别意图，再按策略分支执行"。

```typescript
// evolang/src/agent.ts — 更新后的 run() 方法核心片段

async *run(input: RunInput): AsyncGenerator<RunEvent> {
  // ... Phase 0: 环境准备、DMA 预取（不变） ...

  // Phase 1: 意图识别
  const intentResult = await this.recognizeIntent(input, ctx, scratch)

  // Phase 2: 按策略分支执行
  switch (intentResult.routing.strategy) {

    case 'direct_answer': {
      // 简单问题 — 不进入完整的 chatWithTools 循环
      // 如果 intent_recognize 已生成回复，直接输出
      if (intentResult.routing.direct_response) {
        const response = intentResult.routing.direct_response
        yield { type: 'token', content: response, fullResponse: response, timestamp: Date.now() }
        finalResponse = response
      } else {
        // 用轻量 LLM 调用生成回复（无 Tool）
        finalResponse = yield* this.simpleLLMReply(input, ctx, systemPrompt)
      }
      break
    }

    case 'single_skill': {
      // 明确的单 Skill 调用
      const target = intentResult.routing.skills[0]
      const skillOutput = await ctx.call(target.name, target.input || {})
      // 用 LLM 将 Skill 结果格式化为用户友好的回复
      finalResponse = yield* this.formatSkillResult(input, ctx, target.name, skillOutput, systemPrompt)
      break
    }

    case 'pipeline': {
      // 按顺序执行 Skill 链
      let pipelineContext: Record<string, unknown> = {}
      for (const step of intentResult.routing.skills) {
        const stepInput = { ...step.input, ...pipelineContext }
        const stepOutput = await ctx.call(step.name, stepInput)
        pipelineContext = { ...pipelineContext, [`${step.name}_result`]: stepOutput }
      }
      // LLM 综合所有结果生成回复
      finalResponse = yield* this.formatPipelineResult(input, ctx, pipelineContext, systemPrompt)
      break
    }

    case 'multi_skill': {
      // 进入完整的 chatWithTools 循环（仅暴露相关 Skill）
      const filteredTools = intentResult.routing.skills?.length
        ? this.filterTools(intentResult.routing.skills.map(s => s.name))
        : this.registry.toToolDefinitions()
      finalResponse = yield* this.chatWithToolsLoop(input, ctx, systemPrompt, filteredTools)
      break
    }

    case 'clarify': {
      // 追问用户
      const question = intentResult.routing.clarification || '请问你具体想做什么？'
      yield { type: 'token', content: question, fullResponse: question, timestamp: Date.now() }
      finalResponse = question
      break
    }
  }

  // Phase 3: 回写 + 日志（不变）
  // ...
}

/** 意图识别 — 内核调用 intent_recognize Skill */
private async recognizeIntent(
  input: RunInput,
  ctx: SkillContextImpl<TEnv>,
  scratch: Map<string, unknown>,
): Promise<IntentResult> {
  if (!this.registry.has('intent_recognize')) {
    // 未注册意图识别 → 降级为 multi_skill（等效旧行为）
    return {
      intents: [],
      entities: {},
      routing: { strategy: 'multi_skill', skills: [] },
    }
  }

  const availableSkills = this.registry.list()
    .filter(s => s.meta.category !== 'system')  // 不暴露 system 类别的 Skill
    .map(s => ({
      name: s.meta.name,
      description: s.meta.description,
      category: s.meta.category,
    }))

  try {
    return await ctx.call('intent_recognize', {
      message: input.message,
      available_skills: availableSkills,
      relevant_memories: scratch.get('relevantMemories')
        ? JSON.stringify(scratch.get('relevantMemories'))
        : undefined,
    })
  } catch (err) {
    ctx.log(`intent_recognize failed: ${err}, falling back to multi_skill`)
    return {
      intents: [{ name: 'fallback', confidence: 0 }],
      entities: {},
      routing: { strategy: 'multi_skill', skills: [] },
    }
  }
}
```

### 12.6 目录结构

```
evolang/src/skills/
└── intent_recognize/
    ├── skill.json     ← 12.2 定义的完整 JSON
    ├── prompt.md      ← 12.3 的 LLM 微码
    └── index.ts       ← 12.4 的执行器（可选，mode:llm 可自动生成）
```

### 12.7 注册方式

intent_recognize 是 evolang 的**内置 Skill**，与 memory Skill 一样由内核自动注册：

```typescript
// evolang/src/agent.ts — constructor 更新
constructor(private options: AgentOptions<TEnv>) {
  // 内核初始化：记忆子系统
  this.memoryManager = new MemoryManagerImpl(options.storage, options.memoryOptions)
  this.memoryManager.registerSkills(this.registry)

  // 内核初始化：意图识别（内置 Skill）
  this.registerBuiltinSkill(intentRecognizeSkill)
}
```

### 12.8 关闭意图识别（降级模式）

如果不需要显式意图识别（如简单场景），可以在 AgentOptions 中关闭：

```typescript
const agent = new Agent({
  // ...
  intentRecognition: false,  // 关闭 → 直接进入 chatWithTools（等效 OpenClaw 行为）
})
```

或通过不注册 intent_recognize Skill 来自动降级（见 12.5 的 `recognizeIntent` 方法）。

---

## 13. 类型校验与自修复机制

### 13.1 设计哲学：校验不是拒绝，而是引导

传统语言的类型系统：

```
输入不合法 → TypeError → 程序终止
```

EvoLang 的 CPU 是 LLM，它能**理解自然语言的错误描述并自我纠正**。所以 EvoLang 的类型系统是**引导式**的：

```
输入/输出不合法
  → 生成人类可读的校验报告（哪个字段、期望什么、实际什么、怎么改）
  → 反馈给 LLM
  → LLM 修正输出
  → 再次校验
  → 循环直到通过（或达到最大次数）
```

这不是"重试"（retry 是盲目重复），而是**自修复**（self-heal）——每次携带具体的错误描述，LLM 有新的上下文来纠正。

类比：
- **传统 CPU**：非法指令 → 硬件异常 → 进程终止
- **EvoLang CPU**：格式错误 → 诊断报告 → CPU 重新运算（携带诊断信息）

### 13.2 两道校验关卡

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill 执行生命周期                          │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐          │
│  │ 输入校验  │───▶│  Skill 执行   │───▶│ 输出校验  │          │
│  │ Gate 1   │    │  (execute)   │    │ Gate 2   │          │
│  └────┬─────┘    └──────────────┘    └────┬─────┘          │
│       │ ❌ 不通过                          │ ❌ 不通过        │
│       ▼                                   ▼                │
│  ┌──────────────────┐            ┌──────────────────┐      │
│  │ 反馈给调用方 LLM   │            │ 重新执行 Skill    │      │
│  │ "参数错误：..."    │            │ 附带校验报告       │      │
│  │ LLM 修正参数      │            │ LLM 修正输出      │      │
│  │ 重新调用 Skill    │            │ 再次校验           │      │
│  └──────────────────┘            └──────────────────┘      │
│                                                             │
│  最大重试: input 3 次 / output 3 次                          │
│  超限 → SkillValidationError（不可恢复）                      │
└─────────────────────────────────────────────────────────────┘
```

- **Gate 1（输入校验）**：`ctx.call()` 内部、Skill 执行之前
- **Gate 2（输出校验）**：Skill 执行之后、结果返回之前

修复策略不同：
- **输入错误** → 反馈给**调用方 LLM**（它生成了错误参数）
- **输出错误** → 反馈给**Skill 自身**（它生成了错误结果）

### 13.3 校验报告格式 — ValidationReport

```typescript
export interface ValidationViolation {
  /** 字段路径（如 "routing.strategy"、"intents[0].confidence"） */
  path: string
  /** 违规类型 */
  rule: 'type' | 'required' | 'enum' | 'minimum' | 'maximum'
       | 'minLength' | 'maxLength' | 'pattern' | 'format'
  /** 期望值描述 */
  expected: string
  /** 实际值 */
  actual: unknown
  /** 修复建议（自然语言，LLM 可直接理解） */
  suggestion: string
}

export interface ValidationReport {
  skillName: string
  direction: 'input' | 'output'
  attempt: number
  maxAttempts: number
  violations: ValidationViolation[]
}
```

**示例报告**：

```json
{
  "skillName": "intent_recognize",
  "direction": "output",
  "attempt": 1,
  "maxAttempts": 3,
  "violations": [
    {
      "path": "routing.strategy",
      "rule": "enum",
      "expected": "必须是: direct_answer, single_skill, multi_skill, pipeline, clarify",
      "actual": "answer_directly",
      "suggestion": "将 'answer_directly' 改为 'direct_answer'"
    },
    {
      "path": "intents[0].confidence",
      "rule": "type",
      "expected": "number (0-1)",
      "actual": "high",
      "suggestion": "confidence 必须是 0 到 1 之间的数字，如 0.95"
    }
  ]
}
```

### 13.4 Gate 1 — 输入校验与自修复

发生在 **chatWithTools 循环**中。LLM 生成的 tool_call 参数不合法时，将校验报告作为 tool_result 返回，LLM 修正后重新调用。

```typescript
// evolang/src/agent.ts — chatWithTools 的 skillExecutor

const skillExecutor = async (name: string, args: Record<string, unknown>): Promise<SkillOutput> => {
  const skill = this.registry.get(name)
  if (!skill) {
    return { output: { error: `未知 Skill: ${name}` }, isError: true }
  }

  // ═══ Gate 1: 输入校验 ═══
  const inputViolations = validateSchema(args, skill.meta.input)

  if (inputViolations.length > 0) {
    // 不抛异常，返回结构化错误报告给 LLM
    return {
      output: {
        error: 'input_validation_failed',
        message: formatReportForLLM({
          skillName: name,
          direction: 'input',
          attempt: 1,
          maxAttempts: 3,
          violations: inputViolations,
        }),
      },
      isError: true,
    }
    // LLM 看到错误 → 理解哪些参数有问题 → 修正后重新调用
  }

  // 输入校验通过 → 执行 Skill
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
```

**流程示意**：

```
LLM: tool_call("memory_search", { query: 123, limit: "five" })
                                        ↑ 应为 string  ↑ 应为 number
Gate 1 → 返回 tool_result (isError: true):
  "memory_search 输入参数校验失败：
   • [query] type: 期望 string，实际为 123
   • [limit] type: 期望 number (1-50)，实际为 "five"
   请修正参数后重新调用。"

LLM 修正 → tool_call("memory_search", { query: "最近的讨论", limit: 5 })
Gate 1 ✅ → 执行 Skill
```

### 13.5 Gate 2 — 输出校验与自修复

对 `mode: "llm"` 的 Skill，输出可能不符合 schema。自动重试，将校验报告追加到 prompt。

```typescript
// evolang/src/loader.ts — LLM 模式执行器（带输出自修复）

function createLLMExecutor<TEnv>(
  meta: SkillMeta,
  promptTemplate: string,
): SkillExecutor<TEnv> {
  const maxAttempts = Math.min(meta.retry + 1, 3)

  return async (input, ctx) => {
    const compiledPrompt = compileTemplate(promptTemplate, { input })
    let lastReport: ValidationReport | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 如果有上次校验报告，追加修正指令
      let finalPrompt = compiledPrompt
      if (lastReport) {
        finalPrompt += `\n\n─── 校验反馈（第 ${attempt} 次尝试）───\n`
        finalPrompt += formatReportForLLM(lastReport)
        finalPrompt += `\n请严格按照要求修正后重新输出。`
      }

      // 调用 CPU
      const rawOutput = await ctx.llm({
        system: `你是 ${meta.name} 的执行器。严格按 JSON 格式输出，不要输出其他文字。`,
        prompt: finalPrompt,
        temperature: attempt === 1 ? 0.3 : 0.1,  // 重试时降温 → 更确定性
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
            expected: '合法的 JSON 对象',
            actual: rawOutput.slice(0, 200),
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
        return parsed  // ✅ 通过
      }

      // 校验失败 → 生成报告，下一轮重试
      lastReport = {
        skillName: meta.name, direction: 'output',
        attempt, maxAttempts, violations,
      }
      ctx.log(`[${meta.name}] 输出校验失败 (${attempt}/${maxAttempts}): ${violations.length} 项违规`)

      // 触发可观测事件
      ctx.emit({
        type: 'skill_validation_retry',
        skill: meta.name, attempt, maxAttempts,
        violations: violations.length, timestamp: Date.now(),
      })
    }

    // 用尽所有尝试
    throw new SkillValidationError(
      meta.name, 'output', lastReport!.violations,
      `输出校验在 ${maxAttempts} 次尝试后仍失败`,
    )
  }
}
```

**流程示意**：

```
intent_recognize attempt 1:
  LLM → { intents: [...], routing: { strategy: "answer_directly" } }
  Gate 2 ❌ strategy 不在 enum 中
  追加: "strategy 必须是 direct_answer|single_skill|..., 实际为 'answer_directly'"

intent_recognize attempt 2:
  LLM → { intents: [...], routing: { strategy: "direct_answer", ... } }
  Gate 2 ✅ 自修复成功
```

### 13.6 ctx.call() 中的校验分流

```typescript
// evolang/src/context.ts

async call<T>(name: string, input: Record<string, unknown>): Promise<T> {
  const skill = this.registry.get(name)
  if (!skill) throw new SkillNotFoundError(name)
  if (this.depth >= this.maxDepth) throw new SkillDepthError(name, this.depth, this.maxDepth)

  // ═══ Gate 1: 输入校验（所有模式） ═══
  const inputViolations = validateSchema(input, skill.meta.input)
  if (inputViolations.length > 0) {
    throw new SkillValidationError(name, 'input', inputViolations, `输入校验失败`)
  }

  // 执行（LLM 模式内部已有 Gate 2 自修复循环）
  const output = await skill.execute(input, childCtx)

  // ═══ Gate 2: 输出校验（仅 code 模式直接报错） ═══
  if (skill.meta.mode === 'code') {
    const outputViolations = validateSchema(output, skill.meta.output)
    if (outputViolations.length > 0) {
      throw new SkillValidationError(name, 'output', outputViolations,
        `code 模式输出校验失败（开发者 bug，不自修复）`)
    }
  }
  // mode: "llm" → 自修复已在 createLLMExecutor 内完成
  // mode: "composite" → 由 pipeline executor 逐步校验

  return output as T
}
```

### 13.7 validator.ts — 校验引擎

```typescript
// evolang/src/validator.ts

export function validateSchema(
  data: unknown,
  schema: JSONSchema,
  path = '',
): ValidationViolation[] {
  const violations: ValidationViolation[] = []
  if (!schema || Object.keys(schema).length === 0) return []

  const p = path || '(root)'

  // 类型检查
  if (schema.type && getJSONType(data) !== schema.type) {
    violations.push({
      path: p, rule: 'type',
      expected: schema.type as string, actual: data,
      suggestion: `期望 ${schema.type} 类型`,
    })
    return violations
  }

  // 对象: required + 递归属性
  if (schema.type === 'object' && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    const props = (schema.properties || {}) as Record<string, JSONSchema>
    for (const key of (schema.required || []) as string[]) {
      if (!(key in obj) || obj[key] === undefined) {
        violations.push({
          path: path ? `${path}.${key}` : key, rule: 'required',
          expected: `必须提供 "${key}"`, actual: undefined,
          suggestion: props[key]?.description
            ? `请提供 ${key}（${props[key].description}）`
            : `请提供 ${key}`,
        })
      }
    }
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj && obj[key] !== undefined) {
        violations.push(...validateSchema(obj[key], propSchema, path ? `${path}.${key}` : key))
      }
    }
  }

  // 数组: 逐元素校验
  if (schema.type === 'array' && Array.isArray(data) && schema.items) {
    for (let i = 0; i < data.length; i++) {
      violations.push(...validateSchema(data[i], schema.items as JSONSchema, `${p}[${i}]`))
    }
  }

  // 枚举
  if (schema.enum && !(schema.enum as unknown[]).includes(data)) {
    violations.push({
      path: p, rule: 'enum',
      expected: `值必须是: ${(schema.enum as unknown[]).join(', ')}`, actual: data,
      suggestion: `请从 [${(schema.enum as unknown[]).join(', ')}] 中选择`,
    })
  }

  // 数值范围
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < (schema.minimum as number))
      violations.push({ path: p, rule: 'minimum', expected: `>= ${schema.minimum}`, actual: data, suggestion: `不能小于 ${schema.minimum}` })
    if (schema.maximum !== undefined && data > (schema.maximum as number))
      violations.push({ path: p, rule: 'maximum', expected: `<= ${schema.maximum}`, actual: data, suggestion: `不能大于 ${schema.maximum}` })
  }

  // 字符串长度
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < (schema.minLength as number))
      violations.push({ path: p, rule: 'minLength', expected: `长度 >= ${schema.minLength}`, actual: data, suggestion: `至少 ${schema.minLength} 个字符` })
    if (schema.maxLength !== undefined && data.length > (schema.maxLength as number))
      violations.push({ path: p, rule: 'maxLength', expected: `长度 <= ${schema.maxLength}`, actual: data, suggestion: `不超过 ${schema.maxLength} 个字符` })
  }

  return violations
}

function getJSONType(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}
```

### 13.8 错误类型

```typescript
// evolang/src/errors.ts

export class SkillValidationError extends Error {
  constructor(
    public readonly skillName: string,
    public readonly direction: 'input' | 'output',
    public readonly violations: ValidationViolation[],
    message: string,
  ) {
    super(message)
    this.name = 'SkillValidationError'
  }

  /** 生成 LLM 可读的反馈 */
  toFeedback(): string {
    const dir = this.direction === 'input' ? '输入参数' : '输出结果'
    const lines = [`${this.skillName} ${dir}不符合要求：`]
    for (const v of this.violations) {
      lines.push(`  • [${v.path}] ${v.suggestion}`)
    }
    return lines.join('\n')
  }
}
```

### 13.9 RunEvent 扩展

```typescript
export interface RunEvent {
  type: 'token' | 'skill_call' | 'skill_result' | 'error' | 'done'
      | 'skill_validation_retry'  // ← 新增
  // ...已有字段...
  attempt?: number       // 当前第几次
  maxAttempts?: number   // 最大次数
  violations?: number    // 违规数量
}
```

### 13.10 三种模式校验策略

| | mode: code | mode: llm | mode: composite |
|---|---|---|---|
| **Gate 1 输入校验** | ✅ 失败抛异常 | ✅ 失败抛异常 | ✅ 失败抛异常 |
| **Gate 2 输出校验** | ✅ 失败抛异常 | ✅ 校验 + 自修复 | ✅ 逐步骤校验 |
| **输出自修复** | ❌ 确定性代码，重试无意义 | ✅ 追加报告，LLM 重新生成 | ✅ 只重试失败步骤 |
| **chatWithTools 输入自修复** | ✅ 返回报告给 LLM | ✅ 返回报告给 LLM | ✅ 返回报告给 LLM |

### 13.11 降级策略

```typescript
export interface AgentOptions<TEnv = Record<string, unknown>> {
  // ...已有字段...
  validation?: {
    maxInputRetries?: number   // 默认 3
    maxOutputRetries?: number  // 默认 3
    fallbackStrategy?: 'throw' | 'return_raw' | 'return_partial'
  }
}
```

| 策略 | 行为 | 场景 |
|---|---|---|
| `throw`（默认） | 抛出 SkillValidationError | 严格模式 |
| `return_raw` | 返回 LLM 原始输出 | 容错模式 |
| `return_partial` | 返回合规部分 + 标记缺失 | 折中方案 |

### 13.12 完整数据流

```
1. Agent.run("帮我总结一下之前讨论的方案")
   │
2. intent_recognize
   │  Gate 1 ✅
   │  LLM attempt 1 → { strategy: "pipeline_mode" } → Gate 2 ❌ enum 不匹配
   │  追加报告 → attempt 2 → { strategy: "pipeline" } → Gate 2 ✅ 自修复成功
   │
3. ctx.call("memory_search", { query: "讨论的方案" })
   │  Gate 1 ✅ → 执行 → Gate 2 ✅
   │
4. ctx.call("summarize", { text: "..." })
   │  Gate 1 ✅ → LLM attempt 1 → { summary: "..." } → Gate 2 ✅
   │
5. 格式化 → 回复用户 → memoryManager.capture()
```
