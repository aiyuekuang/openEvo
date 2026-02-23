// ═══════════════════════════════════════════════════════════════
// skill_develop — 自动开发新 Skill
//
// 流程：
//   1. ctx.llm() 根据描述生成 skill.json
//   2. ctx.llm() 根据 skill.json 生成 prompt.md（llm 模式）
//   3. 写入 ~/.openevo/skills/custom/{name}/
//   4. 验证生成的 skill.json 可解析
// ═══════════════════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { SkillContext } from '../../types'

// ── 内联 extractJSON（不可依赖 ../../validator，因为运行时 Skill 部署到 ~/.openevo/ 后相对路径不存在） ──

function extractJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text) } catch { /* continue */ }
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlock) return JSON.parse(jsonBlock[1].trim())
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1))
  }
  throw new Error('No valid JSON found in LLM output')
}

// ─── 类型 ───

interface DevelopInput {
  name: string
  description: string
  domain?: string
  keywords?: string[]
  preferred_mode?: 'llm' | 'code'
  /** pipeline 场景：上游 Skill 的 output schema，生成的 input 必须对齐 */
  upstream_output_schema?: Record<string, unknown>
  /** pipeline 场景：上游 Skill 名称 */
  upstream_skill_name?: string
}

interface DevelopOutput {
  success: boolean
  skill_name: string
  skill_path?: string
  mode?: string
  files_created?: string[]
  error?: string
}

// ─── 执行器 ───

export async function execute(
  input: DevelopInput,
  ctx: SkillContext,
): Promise<DevelopOutput> {
  const skillName = input.name
  const mode = input.preferred_mode || 'llm'
  const customDir = path.join(os.homedir(), '.openevo', 'skills', 'custom')
  const skillDir = path.join(customDir, skillName)

  try {
    // 确保目录存在
    fs.mkdirSync(skillDir, { recursive: true })

    // 1. 生成 skill.json
    ctx.log(`正在生成 ${skillName} 的 skill.json...`)
    const skillJson = await generateSkillJson(input, mode, ctx)
    const skillJsonPath = path.join(skillDir, 'skill.json')
    fs.writeFileSync(skillJsonPath, JSON.stringify(skillJson, null, 2), 'utf-8')

    const filesCreated = ['skill.json']

    // 2. 根据模式生成实现文件
    if (mode === 'llm') {
      ctx.log(`正在生成 ${skillName} 的 prompt.md...`)
      const promptMd = await generatePromptMd(skillJson, input, ctx)
      const promptPath = path.join(skillDir, 'prompt.md')
      fs.writeFileSync(promptPath, promptMd, 'utf-8')
      filesCreated.push('prompt.md')
    } else {
      ctx.log(`正在生成 ${skillName} 的 index.ts...`)
      const indexTs = await generateIndexTs(skillJson, input, ctx)
      const indexPath = path.join(skillDir, 'index.ts')
      fs.writeFileSync(indexPath, indexTs, 'utf-8')
      filesCreated.push('index.ts')
    }

    // 3. 验证生成的 skill.json 可重新解析
    try {
      JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'))
    } catch {
      return {
        success: false, skill_name: skillName,
        error: '生成的 skill.json 解析失败',
      }
    }

    ctx.log(`${skillName} 开发完成: ${filesCreated.join(', ')}`)

    return {
      success: true,
      skill_name: skillName,
      skill_path: skillDir,
      mode,
      files_created: filesCreated,
    }
  } catch (err) {
    // 失败时清理残留目录 — 避免只有 skill.json 没有实现文件的残缺 Skill
    try {
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true })
        ctx.log(`已清理残留目录: ${skillDir}`)
      }
    } catch { /* 清理失败不影响错误报告 */ }

    return {
      success: false,
      skill_name: skillName,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── 生成 skill.json ───

async function generateSkillJson(
  input: DevelopInput,
  mode: string,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const rawOutput = await ctx.llm({
    system: `你是 EvoLang Skill 开发专家。根据用户的描述，生成一个完整的 skill.json 配置文件。

skill.json 的必须字段和格式：
{
  "name": "snake_case 名称",
  "description": "一句话描述功能",
  "category": "所属分类（如 text, code, data, devtools, fintech, general）",
  "input": {
    "type": "object",
    "properties": {
      "参数名": { "type": "string/number/boolean/array/object", "description": "说明" }
    },
    "required": ["必填参数"]
  },
  "output": {
    "type": "object",
    "properties": {
      "结果名": { "type": "string/number/boolean/array/object", "description": "说明" }
    },
    "required": ["必须的输出字段"]
  },
  "mode": "${mode}",
  "calls": [],
  "version": "1.0.0",
  "tags": ["相关标签"],
  "timeout": 30000,
  "retry": ${mode === 'llm' ? 1 : 0}
}

注意：
- name 必须是 snake_case 格式
- input/output 遵循 JSON Schema 规范
- 只输出 JSON，不要有其他文字
${input.upstream_output_schema ? `
**重要 — Pipeline 接口对齐约束**：
此 Skill 是 pipeline 的下游步骤，上游 Skill "${input.upstream_skill_name || '未知'}" 的 output schema 如下：
${JSON.stringify(input.upstream_output_schema, null, 2)}

你生成的 input schema 中需要的字段名和类型必须与上游 output 保持一致。
例如：上游输出 "condition"(string) 字段，下游 input 必须用 "condition"(string)，不能改名为 "description" 或其他。` : ''}`,
    prompt: `Skill 名称：${input.name}
功能描述：${input.description}
所属领域：${input.domain || '通用'}
关键词：${(input.keywords || []).join(', ') || '无'}
模式：${mode}
${input.upstream_output_schema ? `Pipeline 上游 (${input.upstream_skill_name || '未知'}) 输出字段: ${Object.keys((input.upstream_output_schema as any).properties || {}).join(', ')}` : ''}
请生成 skill.json 内容。`,
    temperature: 0.3,
    maxTokens: 2000,
  })

  return extractJSON(rawOutput)
}

// ─── 生成 prompt.md（LLM 模式） ───

async function generatePromptMd(
  skillJson: Record<string, unknown>,
  input: DevelopInput,
  ctx: SkillContext,
): Promise<string> {
  const result = await ctx.llm({
    system: `你是 EvoLang Skill Prompt 编写专家。根据 skill.json 定义，编写该 Skill 的 prompt.md 模板。

prompt.md 规范：
1. 第一段：角色定义 — 告诉 LLM 它扮演什么角色
2. 规则部分：列出具体的执行规则和约束
3. 输入部分：用 {{input.xxx}} 模板语法引用输入参数
4. 输出格式：要求严格输出 JSON，给出示例格式
5. 可选：提供 1-2 个示例输入输出

模板语法：
- {{input.fieldName}} — 引用输入参数值
- {{#if input.optionalField}} ... {{/if}} — 条件块
- {{input.arrayField | json}} — JSON 序列化
- {{input.skillList | format_skills}} — 格式化 Skill 列表

直接输出 prompt.md 的完整内容（Markdown 格式），不要用代码块包裹。`,
    prompt: `skill.json 定义：
${JSON.stringify(skillJson, null, 2)}

功能描述：${input.description}
领域：${input.domain || '通用'}
${input.upstream_output_schema ? `
Pipeline 上下文：此 Skill 在 pipeline 中作为下游步骤，上游 Skill "${input.upstream_skill_name || '未知'}" 的输出会直接传入作为本 Skill 的输入。
上游 output schema：
${JSON.stringify(input.upstream_output_schema, null, 2)}
请确保 prompt.md 中引用的 {{input.xxx}} 字段名与上游 output 字段名一致。` : ''}
请生成 prompt.md 内容。`,
    temperature: 0.4,
    maxTokens: 3000,
  })

  return result
}

// ─── 生成 index.ts（Code 模式） ───

async function generateIndexTs(
  skillJson: Record<string, unknown>,
  input: DevelopInput,
  ctx: SkillContext,
): Promise<string> {
  const result = await ctx.llm({
    system: `你是 EvoLang Skill 代码生成专家。根据 skill.json 定义，编写该 Skill 的 index.ts 实现。

index.ts 规范：
\`\`\`typescript
import type { SkillContext } from '../../types'

interface XxxInput {
  // 与 skill.json input.properties 对应
}

interface XxxOutput {
  // 与 skill.json output.properties 对应
}

export async function execute(
  input: XxxInput,
  ctx: SkillContext,
): Promise<XxxOutput> {
  // 实现逻辑
  // 可用 ctx.llm() 调用 LLM
  // 可用 ctx.call('other_skill', {...}) 调用其他 Skill
  // 可用 ctx.log('message') 记录日志
  return { ... }
}
\`\`\`

注意：
- 导入类型用 \`import type { SkillContext } from '../../types'\`
- 必须导出 execute 函数
- 可以使用 Node.js 内置模块（fs, path, os, crypto, url）
- 不要使用 eval、child_process 等危险 API
- 直接输出完整的 TypeScript 代码，不要用 markdown 代码块包裹`,
    prompt: `skill.json 定义：
${JSON.stringify(skillJson, null, 2)}

功能描述：${input.description}
领域：${input.domain || '通用'}
${input.upstream_output_schema ? `
Pipeline 上下文：上游 Skill "${input.upstream_skill_name || '未知'}" 的输出会作为本 Skill 的输入。
上游 output schema：${JSON.stringify(input.upstream_output_schema, null, 2)}
确保输入类型定义的字段名与上游 output 字段名一致。` : ''}
请生成 index.ts 代码。`,
    temperature: 0.3,
    maxTokens: 3000,
  })

  // 清理可能的 markdown 代码块包裹
  let code = result.trim()
  if (code.startsWith('```')) {
    code = code.replace(/^```(?:typescript|ts)?\n?/, '').replace(/\n?```$/, '')
  }

  return code
}
