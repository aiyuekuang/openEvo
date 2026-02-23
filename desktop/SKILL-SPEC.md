# Skill JSON 规范

> **Skill = 函数。skill.json = 函数签名。**

---

## 1. 设计理念

一个函数有什么？

```typescript
function codeReview(code: string, language: string): ReviewResult {
  // ...实现
}
```

- **名字** → `name`
- **描述** → `description`
- **参数** → `input`（JSON Schema）
- **返回值** → `output`（JSON Schema）
- **函数体** → `execute`（代码实现 / LLM prompt / 组合调用）
- **调用的其他函数** → `calls`

`skill.json` 就是这个函数的**完整声明**。

---

## 2. skill.json 完整 Schema

```jsonc
{
  // ===== 函数签名 =====
  "name": "code_review",                    // 函数名（唯一标识，snake_case）
  "description": "审查代码，检查安全漏洞、质量问题和最佳实践",  // 给 LLM + 人看的描述
  "category": "代码",                        // 分类（记忆 / 代码 / 文本 / 搜索 / 工作流）

  // ===== 输入参数 =====
  "input": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "要审查的代码"
      },
      "language": {
        "type": "string",
        "enum": ["typescript", "python", "go", "rust", "java"],
        "description": "编程语言"
      },
      "severity": {
        "type": "string",
        "enum": ["critical", "high", "medium", "all"],
        "default": "all",
        "description": "最低报告级别"
      }
    },
    "required": ["code"]
  },

  // ===== 输出（返回值） =====
  "output": {
    "type": "object",
    "properties": {
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string" },
            "message": { "type": "string" },
            "line": { "type": "number" },
            "suggestion": { "type": "string" }
          }
        },
        "description": "发现的问题列表"
      },
      "passed": {
        "type": "boolean",
        "description": "是否通过审查"
      },
      "summary": {
        "type": "string",
        "description": "审查总结"
      }
    }
  },

  // ===== 执行方式 =====
  "mode": "llm",                            // "code" | "llm" | "composite"

  // ===== 函数依赖（调用的其他 Skill） =====
  "calls": [],                              // composite 模式下列出依赖的 Skill 名

  // ===== 元信息 =====
  "version": "1.0.0",
  "tags": ["security", "quality", "review"],
  "author": "openevo",
  "timeout": 30000,                         // 执行超时 (ms)
  "retry": 0                                // 失败重试次数
}
```

---

## 3. 三种 mode 的函数体

### 3.1 `mode: "code"` — 纯代码函数

函数体是 TypeScript 代码。`skill.json` 只是声明，实现在同目录的 `.ts` 文件中。

```
skills/
  memory-search/
    skill.json          ← 函数签名
    index.ts            ← 函数体（execute 实现）
```

**skill.json**:
```json
{
  "name": "memory_search",
  "description": "搜索用户的长期记忆和日志",
  "category": "记忆",
  "input": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "搜索查询" },
      "limit": { "type": "number", "default": 5, "description": "最大结果数" }
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
            "snippet": { "type": "string" },
            "score": { "type": "number" },
            "path": { "type": "string" }
          }
        }
      }
    }
  },
  "mode": "code",
  "calls": [],
  "version": "1.0.0",
  "tags": ["memory", "search"]
}
```

**index.ts**:
```typescript
import type { SkillExecutor } from '../types'

export const execute: SkillExecutor = async (input, ctx) => {
  const { query, limit = 5 } = input as { query: string; limit?: number }
  const results = await ctx.memory.search(query, limit)
  return { results }
}
```

### 3.2 `mode: "llm"` — LLM 驱动函数

函数体是一段 system prompt，LLM 根据 prompt + 输入生成符合 output schema 的结果。
prompt 放在同目录的 `prompt.md` 中。

```
skills/
  code-review/
    skill.json          ← 函数签名
    prompt.md           ← LLM system prompt（函数体）
```

**skill.json**:
```json
{
  "name": "code_review",
  "description": "审查代码质量和安全性",
  "category": "代码",
  "input": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "要审查的代码" },
      "language": { "type": "string", "description": "编程语言" }
    },
    "required": ["code"]
  },
  "output": {
    "type": "object",
    "properties": {
      "issues": { "type": "array" },
      "passed": { "type": "boolean" },
      "summary": { "type": "string" }
    }
  },
  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["security", "quality"]
}
```

**prompt.md**:
```markdown
你是一个代码审查专家。请审查用户提供的代码，检查以下问题：

## 检查清单
1. 安全漏洞（SQL注入、XSS、硬编码密钥等）
2. 代码质量（函数过长、嵌套过深、命名不清等）
3. 最佳实践（类型安全、不可变性、错误处理等）

## 输出格式
以 JSON 格式返回 issues 数组，每个 issue 包含 severity/message/line/suggestion。
```

### 3.3 `mode: "composite"` — 组合函数

函数体是对其他 Skill 的组合调用。可以用 TypeScript 实现（同 code），也可以用声明式 JSON pipeline。

**声明式 pipeline（skill.json 内定义）**:

```json
{
  "name": "research_and_summarize",
  "description": "搜索相关记忆并总结",
  "category": "工作流",
  "input": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "description": "研究主题" }
    },
    "required": ["topic"]
  },
  "output": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "sources": { "type": "array" }
    }
  },
  "mode": "composite",
  "calls": ["memory_search", "summarize"],

  "pipeline": [
    {
      "step": "search",
      "skill": "memory_search",
      "input": {
        "query": "{{input.topic}}",
        "limit": 10
      }
    },
    {
      "step": "summarize",
      "skill": "summarize",
      "input": {
        "text": "{{steps.search.results | map: snippet | join: '\\n\\n'}}"
      }
    }
  ],

  "outputMapping": {
    "summary": "{{steps.summarize.summary}}",
    "sources": "{{steps.search.results}}"
  },

  "version": "1.0.0",
  "tags": ["workflow", "research"]
}
```

或者用 TypeScript pipeline（更灵活）：

```
skills/
  research-and-summarize/
    skill.json          ← 函数签名 + calls 声明
    index.ts            ← pipeline 实现
```

---

## 4. 完整字段参考

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 函数名，snake_case，全局唯一 |
| `description` | `string` | 是 | 函数描述（给 LLM + 人看） |
| `category` | `string` | 是 | 分组分类 |
| `input` | `JSONSchema` | 是 | 输入参数 schema |
| `output` | `JSONSchema` | 是 | 返回值 schema |
| `mode` | `"code" \| "llm" \| "composite"` | 是 | 执行模式 |
| `calls` | `string[]` | 否 | 依赖的其他 Skill 名（默认 `[]`） |
| `pipeline` | `PipelineStep[]` | 否 | composite 模式的声明式流水线 |
| `outputMapping` | `object` | 否 | pipeline 输出映射 |
| `version` | `string` | 否 | 语义化版本（默认 `"1.0.0"`） |
| `tags` | `string[]` | 否 | 标签，用于搜索和过滤 |
| `author` | `string` | 否 | 作者 |
| `timeout` | `number` | 否 | 执行超时 ms（默认 `30000`） |
| `retry` | `number` | 否 | 失败重试次数（默认 `0`） |

---

## 5. 现有 Skill 迁移示例

### code-review (SKILL.md → skill.json)

**之前**：一个 262 行的 Markdown 文件，没有类型化的输入输出。

**之后**：

```
skills/code-review/
├── skill.json      ← 函数签名
└── prompt.md       ← 原 SKILL.md 的内容（作为 LLM system prompt）
```

```json
{
  "name": "code_review",
  "description": "审查代码，检查安全漏洞、代码质量和最佳实践",
  "category": "代码",
  "input": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "要审查的代码内容"
      },
      "language": {
        "type": "string",
        "description": "编程语言（自动检测如不提供）"
      },
      "files": {
        "type": "array",
        "items": { "type": "string" },
        "description": "文件路径列表（替代 code 参数，从文件读取）"
      },
      "severity": {
        "type": "string",
        "enum": ["critical", "high", "medium", "all"],
        "default": "all",
        "description": "最低报告级别"
      }
    }
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
            "file": { "type": "string" },
            "line": { "type": "number" },
            "message": { "type": "string" },
            "suggestion": { "type": "string" }
          }
        }
      },
      "verdict": {
        "type": "string",
        "enum": ["pass", "warn", "block"],
        "description": "pass=通过, warn=有中等问题, block=有严重问题"
      },
      "summary": { "type": "string" }
    }
  },
  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["security", "quality", "review"],
  "timeout": 60000
}
```

### systematic-debugging → skill.json

```json
{
  "name": "systematic_debugging",
  "description": "四阶段调试方法论：根因调查 → 假设验证 → 定向修复 → 回归验证",
  "category": "代码",
  "input": {
    "type": "object",
    "properties": {
      "error": {
        "type": "string",
        "description": "错误信息或症状描述"
      },
      "stacktrace": {
        "type": "string",
        "description": "错误堆栈"
      },
      "context": {
        "type": "string",
        "description": "相关代码或上下文"
      },
      "recentChanges": {
        "type": "string",
        "description": "最近的代码改动（git diff）"
      }
    },
    "required": ["error"]
  },
  "output": {
    "type": "object",
    "properties": {
      "rootCause": {
        "type": "string",
        "description": "根因分析"
      },
      "fix": {
        "type": "object",
        "properties": {
          "file": { "type": "string" },
          "change": { "type": "string" },
          "explanation": { "type": "string" }
        },
        "description": "修复方案"
      },
      "verification": {
        "type": "string",
        "description": "验证步骤"
      }
    }
  },
  "mode": "llm",
  "calls": [],
  "version": "1.0.0",
  "tags": ["debugging", "root-cause"]
}
```

### memory_search（现有 Tool → skill.json）

```json
{
  "name": "memory_search",
  "description": "搜索用户的长期记忆和日志。当用户问到之前讨论过的内容时使用。",
  "category": "记忆",
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
            "snippet": { "type": "string" },
            "score": { "type": "number" },
            "path": { "type": "string" },
            "startLine": { "type": "number" },
            "endLine": { "type": "number" }
          }
        }
      },
      "count": { "type": "number" }
    }
  },
  "mode": "code",
  "calls": [],
  "version": "1.0.0",
  "tags": ["memory", "search"]
}
```

---

## 6. 与 Agent 的关系

```
Agent（对象）
  │
  ├── ctx（变量）
  │     ├── memory    ← memory_search / memory_store 操作的数据
  │     ├── config    ← 供应商配置、用户偏好
  │     ├── session   ← 当前对话历史
  │     └── scratch   ← Skill 之间的中间数据
  │
  └── skills（函数）
        ├── memory_search.json      mode: code
        ├── memory_store.json       mode: code
        ├── code_review.json        mode: llm
        ├── summarize.json          mode: llm
        └── research_and_summarize.json   mode: composite
              calls: [memory_search, summarize]
```

LLM 看到的是 `skill.json` 中的 `name` + `description` + `input`，就像看到函数签名一样。
LLM 决定调用哪个函数、传什么参数，Agent 执行后把 `output` 返回给 LLM。

---

## 7. 目录结构

```
desktop/main/skills/
├── types.ts                    # SkillDefinition 类型（从 skill.json 映射）
├── registry.ts                 # SkillRegistry（加载 + 注册 + 执行）
├── loader.ts                   # 从文件系统加载 skill.json + index.ts/prompt.md
├── context.ts                  # SkillContext 工厂
├── memory/                     # 记忆类
│   ├── search/
│   │   ├── skill.json
│   │   └── index.ts
│   ├── store/
│   │   ├── skill.json
│   │   └── index.ts
│   └── forget/
│       ├── skill.json
│       └── index.ts
├── code/                       # 代码类
│   ├── review/
│   │   ├── skill.json
│   │   └── prompt.md
│   └── debug/
│       ├── skill.json
│       └── prompt.md
├── text/                       # 文本类
│   ├── summarize/
│   │   ├── skill.json
│   │   └── prompt.md
│   └── translate/
│       ├── skill.json
│       └── prompt.md
└── workflow/                   # 组合工作流
    └── research-and-summarize/
        ├── skill.json          # pipeline 定义在 JSON 中
        └── index.ts            # 或用 TypeScript 实现
```

每个 Skill 是一个**目录**，最少包含一个 `skill.json`。

---

## 8. skill.json 的 JSON Schema（元 Schema）

用于校验 skill.json 文件本身的合法性：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OpenEvo Skill Definition",
  "type": "object",
  "required": ["name", "description", "category", "input", "output", "mode"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "description": "函数名，snake_case"
    },
    "description": {
      "type": "string",
      "minLength": 1
    },
    "category": {
      "type": "string"
    },
    "input": {
      "$ref": "http://json-schema.org/draft-07/schema#",
      "description": "输入参数的 JSON Schema"
    },
    "output": {
      "$ref": "http://json-schema.org/draft-07/schema#",
      "description": "返回值的 JSON Schema"
    },
    "mode": {
      "type": "string",
      "enum": ["code", "llm", "composite"]
    },
    "calls": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "pipeline": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["step", "skill", "input"],
        "properties": {
          "step": { "type": "string" },
          "skill": { "type": "string" },
          "input": { "type": "object" },
          "condition": { "type": "string" }
        }
      }
    },
    "outputMapping": {
      "type": "object"
    },
    "version": {
      "type": "string",
      "default": "1.0.0"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "author": { "type": "string" },
    "timeout": {
      "type": "number",
      "default": 30000
    },
    "retry": {
      "type": "number",
      "default": 0
    }
  },
  "additionalProperties": false
}
```
