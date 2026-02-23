# EvoLang — 一门以大模型为运行时的编程语言

---

## 0. 为什么需要一门新语言

传统编程语言的执行者是 CPU。每条指令是确定性的，输入相同则输出相同。

但大模型不是 CPU。它的能力是**理解意图、生成内容、做出判断**。你不能用 `for` 循环让它审查代码，不能用 `if-else` 让它决定该调哪个工具。

现有的方案都有问题：

| 方案 | 问题 |
|------|------|
| Prompt Engineering | 没有类型、没有组合、不可复用、不可测试 |
| LangChain / LlamaIndex | 过度抽象，chain/agent/tool 概念混乱 |
| OpenClaw SKILL.md | 被动提示词模板，无类型化输入输出，不能互调 |
| Function Calling | 只是协议层，没有语言层面的组合和状态管理 |

我们需要的是一门**真正的语言**——有类型系统、有函数、有变量、有组合——但运行时是大模型。

---

## 1. 语言核心概念

### 用一句话概括

> **EvoLang 是一门声明式语言，用 JSON 定义类型化的函数（Skill），由大模型在运行时决定调用顺序，在 Agent 对象内执行。**

### 与传统编程语言的对应

| 传统语言 | EvoLang | 说明 |
|---------|---------|------|
| CPU | LLM | 执行引擎，但不是确定性的 |
| 函数 `function` | Skill | 有类型签名，有函数体 |
| 变量 `let/const` | Context | 持久/会话/临时三级作用域 |
| 对象 `class` | Agent | 持有变量和函数的实例 |
| 类型系统 `type/interface` | JSON Schema | 约束输入输出 |
| 函数调用 `f(x)` | `ctx.call(name, input)` | 同步调用，带深度控制 |
| 函数体 `{ ... }` | `code` / `prompt` / `pipeline` | 三种实现方式 |
| 调度器 `main()` | LLM 推理 | LLM 决定调哪些函数 |
| 标准库 `stdlib` | 内置 Skill | memory、text、system |
| 包管理 `npm/pip` | Skill 目录 | 每个目录一个 Skill |
| 程序 | Agent.run() | 一次完整的执行过程 |

---

## 2. 类型系统

EvoLang 用 JSON Schema 作为类型系统。每个值都有类型。

### 基本类型

```
string    — 文本
number    — 数字
boolean   — 布尔
null      — 空值
```

### 复合类型

```
object    — 对象（键值对，每个值有类型）
array     — 数组（元素有统一类型）
```

### 类型声明

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "limit": { "type": "number", "default": 5 }
  },
  "required": ["query"]
}
```

这等价于 TypeScript 的：

```typescript
{ query: string; limit?: number }  // limit 默认 5
```

### 为什么用 JSON Schema 而不是发明新语法

1. **LLM 天然理解 JSON**。所有主流模型的 Function Calling 都用 JSON Schema 描述参数。
2. **生态成熟**。有现成的校验库（ajv）、生成库、文档生成器。
3. **声明式**。类型定义就是数据，可以被程序读取、转换、合并。
4. **跨语言**。不绑定 TypeScript/Python/Go，任何语言都能解析。

---

## 3. 函数 — Skill

### 3.1 函数声明

每个 Skill 是一个目录，包含一个 `skill.json`（函数签名）和实现文件：

```
skills/memory-search/
├── skill.json      ← 函数签名
└── index.ts        ← 函数体
```

**skill.json = 函数签名**：

```json
{
  "name": "memory_search",
  "description": "搜索记忆",
  "input": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] },
  "output": { "type": "object", "properties": { "results": { "type": "array" } } },
  "mode": "code"
}
```

等价于 TypeScript 的：

```typescript
function memory_search(input: { query: string }): { results: any[] }
```

### 3.2 函数体 — 三种实现方式

一个函数的"体"可以是代码、提示词、或其他函数的组合。

#### `mode: "code"` — 确定性执行

函数体是 TypeScript 代码。输入进来，输出出去，中间没有 LLM 参与。

```typescript
// index.ts
export const execute: SkillExecutor = async (input, ctx) => {
  const results = await ctx.memory.search(input.query)
  return { results }
}
```

**类比**：这就是普通函数。`Math.sqrt(4)` 永远返回 `2`。

#### `mode: "llm"` — LLM 推理执行

函数体是一段 prompt。LLM 读取 prompt + 输入，生成符合 output schema 的结果。

```markdown
<!-- prompt.md -->
你是一个代码审查专家。请审查以下代码，按 output schema 返回结果。

检查清单：
1. 安全漏洞
2. 代码质量
3. 最佳实践
```

**类比**：这是"非确定性函数"。同样的输入，每次输出可能略有不同——但类型是确定的。

#### `mode: "composite"` — 组合调用

函数体是对其他函数的编排。

```json
{
  "mode": "composite",
  "pipeline": [
    { "step": "search",    "skill": "memory_search",  "input": { "query": "{{input.topic}}" } },
    { "step": "summarize", "skill": "summarize",       "input": { "text": "{{steps.search.results}}" } }
  ],
  "outputMapping": {
    "summary": "{{steps.summarize.summary}}"
  }
}
```

**类比**：这是"高阶函数"或"函数组合"。`compose(summarize, search)(topic)`。

### 3.3 函数调用

有两种方式触发函数调用：

#### 方式 A：LLM 调度（动态派发）

LLM 在推理过程中决定调用哪个函数。这是主要的交互方式。

```
用户: "帮我回忆一下昨天讨论了什么"
  ↓
LLM 看到可用函数列表: [memory_search, memory_store, summarize, ...]
LLM 决定: 调用 memory_search({ query: "昨天讨论" })
  ↓
Agent 执行 memory_search，返回结果给 LLM
  ↓
LLM 用结果生成最终回答
```

**类比**：这像是**动态派发**（dynamic dispatch）。调用哪个函数不是编译时确定的，而是运行时由 LLM 根据上下文"推断"出来的。

#### 方式 B：代码调度（静态调用）

在 composite 函数体或 code 函数体内，直接调用其他函数。

```typescript
const searchResult = await ctx.call('memory_search', { query: 'xxx' })
const summary = await ctx.call('summarize', { text: searchResult.results })
```

**类比**：这就是普通的函数调用，调用路径在编写时就确定了。

### 3.4 递归

函数可以调用自身或形成调用环。通过 `depth` 计数器防止无限递归。

```
deep_analyze(topic, depth=0)
  └─ ctx.call('deep_analyze', subtopic, depth=1)
       └─ ctx.call('deep_analyze', sub_subtopic, depth=2)
            └─ depth >= maxDepth → 停止递归，返回当前结果
```

---

## 4. 变量 — Context

### 4.1 作用域

EvoLang 有三级变量作用域，类似于编程语言的全局/函数/块级作用域：

```
┌─────────────────────────────────────────────┐
│ 持久作用域 (Persistent Scope)                │
│   memory: 长期记忆，跨所有会话存在             │
│   config: 配置，跨所有会话存在                 │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ 会话作用域 (Session Scope)            │   │
│  │   session: 对话历史，当前会话生命周期    │   │
│  │                                      │   │
│  │  ┌───────────────────────────────┐   │   │
│  │  │ 临时作用域 (Scratch Scope)     │   │   │
│  │  │   scratch: 函数间传递数据       │   │   │
│  │  │   单次 run() 生命周期           │   │   │
│  │  └───────────────────────────────┘   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 4.2 变量的读写

```typescript
// 持久变量 — 读写都会持久化
ctx.memory.search("TypeScript")           // 读
ctx.memory.store("用户偏好: 使用 Tailwind")  // 写

ctx.config.get("theme")                    // 读
ctx.config.set("theme", "dark")            // 写

// 会话变量 — 会话结束后可选持久化
ctx.session.messages                       // 当前对话历史
ctx.session.transcript.append(entry)       // 记录到 JSONL

// 临时变量 — run() 结束即消失
ctx.scratch.set("intermediate", value)     // 写
ctx.scratch.get("intermediate")            // 读
```

### 4.3 变量对函数的可见性

所有函数都能读取所有变量（通过 `ctx`）。这是刻意的设计——函数不是隔离的纯函数，而是**共享状态的方法**。

```
Agent（对象）
  ├── ctx.memory     ← 所有 Skill 可读写
  ├── ctx.config     ← 所有 Skill 可读写
  ├── ctx.session    ← 所有 Skill 可读写
  └── ctx.scratch    ← 所有 Skill 可读写（但生命周期最短）
```

这和面向对象的 `this` 是同一个思路：对象的方法共享对象的成员变量。

---

## 5. 对象 — Agent

### 5.1 Agent 就是运行时实例

```typescript
const agent = new Agent({
  name: "OpenEvo",
  skills: [memorySearch, memoryStore, codeReview, summarize, ...],
  context: { memory, config, session, env },
})

await agent.init()

// 每次用户发消息，就是一次 run()
for await (const event of agent.run({ message: "帮我审查这段代码" })) {
  // event: token / skill_call / skill_result / done
}
```

### 5.2 Agent 的执行模型

一次 `run()` 的执行过程：

```
run(message)
│
├── 1. 构建上下文快照
│     读取 memory、config、session、env
│     填入 scratch（空）
│
├── 2. 编译 system prompt
│     ctx.memory.longTerm → "## 长期记忆 ..."
│     ctx.memory.dailyLogs → "## 今日日志 ..."
│     ctx.skills.toSystemPrompt() → "## 可用函数 ..."
│
├── 3. 进入 LLM 推理循环
│     ┌──────────────────────────────────────┐
│     │ LLM 推理                              │
│     │   ├─ 输出文本 → yield token 事件       │
│     │   └─ 输出 function_call → 执行 Skill   │
│     │        ├─ skill.execute(input, ctx)    │
│     │        ├─ 返回 output 给 LLM           │
│     │        └─ LLM 继续推理（下一轮循环）     │
│     └──────────────────────────── 最多 N 轮 ──┘
│
├── 4. 后处理
│     auto-capture → 提取可记忆内容
│     transcript → 记录对话
│     scratch → 清空
│
└── 5. yield done 事件
```

**核心洞察**：LLM 是这门语言的**调度器**。它不是执行每条指令，而是**决定执行哪些函数、以什么顺序、传什么参数**。函数本身的执行是确定性的（code 模式）或半确定性的（llm 模式）。

---

## 6. 程序 — 组合与编排

### 6.1 线性管道

```json
{
  "pipeline": [
    { "step": "a", "skill": "search",    "input": { "query": "{{input.topic}}" } },
    { "step": "b", "skill": "summarize", "input": { "text": "{{steps.a.results}}" } }
  ]
}
```

等价于：`b(a(input))`

### 6.2 条件分支

```json
{
  "pipeline": [
    { "step": "check", "skill": "should_capture", "input": { "text": "{{input.message}}" } },
    {
      "step": "store", "skill": "memory_store",
      "input": { "text": "{{input.message}}" },
      "condition": "{{steps.check.shouldCapture == true}}"
    }
  ]
}
```

等价于：`if (check(input)) { store(input) }`

### 6.3 循环 / 映射

```json
{
  "pipeline": [
    { "step": "search", "skill": "memory_search", "input": { "query": "{{input.topic}}" } },
    {
      "step": "review_each", "skill": "code_review",
      "foreach": "{{steps.search.results}}",
      "input": { "code": "{{item.snippet}}" }
    }
  ]
}
```

等价于：`search(topic).map(item => codeReview(item))`

### 6.4 LLM 自由编排

当 pipeline 无法预定义时，让 LLM 自己决定调用路径：

```
用户: "帮我分析这个项目的技术栈，然后总结"

LLM 推理:
  → 先调 memory_search({ query: "技术栈" })
  → 发现没有足够信息
  → 再调 file_read({ path: "package.json" })
  → 有了数据，调 summarize({ text: ... })
  → 输出最终答案
```

这是**动态编排**——"程序"不是预先写好的，而是 LLM 在运行时"编写"出来的。这正是 LLM 编程语言独有的能力。

---

## 7. 事件与可观测性

EvoLang 中每一步执行都产生事件，就像编程语言的调试器：

```typescript
interface RunEvent {
  type: 'token' | 'skill_call' | 'skill_result' | 'error' | 'done'
  timestamp: number
}

// Skill 被调用
{ type: 'skill_call',   skill: 'memory_search', input: { query: "..." }, depth: 1 }

// Skill 返回结果
{ type: 'skill_result', skill: 'memory_search', output: { results: [...] }, duration: 120 }

// LLM 输出 token
{ type: 'token', content: "根据", fullResponse: "根据" }

// 执行完成
{ type: 'done', fullResponse: "根据你的记忆，昨天讨论了..." }
```

这让前端可以实时展示"调用栈"：

```
▶ run("分析技术栈")
  ├─ ⚡ memory_search({ query: "技术栈" })   12ms
  ├─ ⚡ file_read({ path: "package.json" })  3ms
  ├─ 🤖 summarize({ text: "..." })           2.1s
  └─ ✅ done                                 2.4s
```

---

## 8. 错误处理

### 8.1 类型错误 — 输入校验

```
SkillInputError: memory_search 输入不合法
  期望: { query: string }
  实际: { q: "test" }
  缺少必填字段: query
```

在函数执行前，用 JSON Schema 校验输入。不合格直接报错，不进入函数体。

### 8.2 运行时错误 — 执行失败

```
SkillExecutionError: memory_search 执行失败
  原因: SQLite database is locked
  重试: 0/0
```

函数体内的异常被捕获，包装为 `SkillResult.isError = true` 返回给 LLM。LLM 可以选择重试、换一个函数、或告知用户。

### 8.3 深度错误 — 递归超限

```
SkillDepthError: 调用深度超限 (10/10)
  调用链: research → search → analyze → research → ...
```

### 8.4 超时错误

```
SkillTimeoutError: code_review 执行超时 (30000ms)
```

---

## 9. 与现有生态的关系

### 9.1 对接 LLM Function Calling

EvoLang 的 Skill 自动转换为 LLM 的 Function Calling 格式：

```
skill.json                     → Anthropic tools
─────────────────────────────────────────────
name                           → tool.name
description                    → tool.description
input                          → tool.input_schema
```

```
skill.json                     → OpenAI tools
─────────────────────────────────────────────
name                           → function.name
description                    → function.description
input                          → function.parameters
```

### 9.2 对接 MCP (Model Context Protocol)

MCP 的 Tool 可以直接注册为 EvoLang Skill：

```json
{
  "name": "mcp_web_search",
  "mode": "code",
  "input": { ... },
  "output": { ... },
  "source": "mcp://web-search-server"
}
```

### 9.3 对接传统代码

任何 TypeScript 函数都可以包装成 Skill：

```typescript
// 已有函数
function calculateTax(income: number, rate: number): number {
  return income * rate
}

// 包装为 Skill
const taxSkill: SkillDefinition = {
  name: 'calculate_tax',
  mode: 'code',
  input: { type: 'object', properties: { income: { type: 'number' }, rate: { type: 'number' } }, required: ['income', 'rate'] },
  output: { type: 'object', properties: { tax: { type: 'number' } } },
  execute: async (input) => ({ tax: calculateTax(input.income, input.rate) })
}
```

---

## 10. 设计原则

1. **JSON-first**。类型是 JSON Schema，函数签名是 JSON，pipeline 是 JSON。不发明新语法。
2. **LLM-native**。LLM 不是被调用的工具，而是语言的运行时本身。
3. **渐进式类型**。可以不写 output schema（LLM 自由输出），也可以严格约束（JSON mode 输出）。
4. **确定性 + 非确定性共存**。code 函数是确定的，llm 函数是概率性的，composite 函数是两者的组合。
5. **可观测**。每次函数调用都有事件，调用栈可视化。
6. **无新语法**。用 JSON 声明 + TypeScript 实现 + Markdown 提示词。开发者不需要学新语言，只需要理解新范式。

---

## 11. 名词表

| 术语 | 定义 |
|------|------|
| **Skill** | 类型化的函数。有名字、输入 schema、输出 schema、函数体 |
| **Agent** | 运行时对象。持有 Context（变量）和 SkillRegistry（函数表） |
| **Context** | Agent 的全部状态。分持久/会话/临时三级作用域 |
| **Pipeline** | 声明式的函数组合。在 JSON 中定义调用顺序和数据流 |
| **Run** | 一次完整的执行过程。用户消息进来，Agent 输出结果 |
| **Depth** | 函数调用深度。防止无限递归 |
| **Mode** | 函数体的实现方式。code / llm / composite |
| **LLM 调度** | LLM 在推理过程中决定调用哪些函数。动态派发 |
| **代码调度** | 在函数体内直接调用其他函数。静态调用 |

---

## 12. 总结

EvoLang 不是又一个 prompt 框架。它是一门**编程语言**，只不过：

- **执行引擎**不是 CPU，而是 LLM
- **函数体**不只是代码，还可以是提示词
- **调度器**不是 main 函数，而是 LLM 的推理过程
- **类型系统**不是编译器检查的，而是运行时校验的

但它保留了编程语言最核心的东西：**类型、函数、变量、组合、作用域、错误处理、可观测性**。

这让我们可以用**编程的方式**构建 AI 应用，而不是用**提示词工程的方式**。
