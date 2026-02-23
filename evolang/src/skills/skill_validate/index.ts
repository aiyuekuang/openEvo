// ═══════════════════════════════════════════════════════════════
// skill_validate — Skill 包安全校验
//
// 检查项：
//   1. skill.json 结构合法性（必填字段、mode 枚举、name 格式）
//   2. 无危险代码模式（eval、Function、child_process 等）
//   3. 文件类型白名单（只允许 .json/.md/.ts/.js/.txt/.yaml/.yml）
//   4. 单文件不超过 1MB
// ═══════════════════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import type { SkillContext } from '../../types'

// ─── 常量 ───

const ALLOWED_EXTENSIONS = new Set([
  '.json', '.md', '.ts', '.js', '.txt', '.yaml', '.yml',
])

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

const VALID_MODES = new Set(['code', 'llm', 'composite'])

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/** 危险代码模式 — 匹配后报 issue */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\beval\s*\(/, description: 'eval() 调用' },
  { pattern: /\bnew\s+Function\s*\(/, description: 'new Function() 调用' },
  { pattern: /require\s*\(\s*['"]child_process['"]/, description: "require('child_process')" },
  { pattern: /from\s+['"]child_process['"]/, description: "import from 'child_process'" },
  { pattern: /require\s*\(\s*['"]fs['"]/, description: "直接 require('fs')（建议通过 ctx 操作文件）" },
  { pattern: /\bprocess\.env\b/, description: 'process.env 访问（可能泄露环境变量）' },
  { pattern: /\bexecSync\b|\bspawnSync\b|\bexec\s*\(/, description: '子进程执行' },
]

/** 可疑但非阻断的模式 — 匹配后报 warning */
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bfetch\s*\(/, description: '网络请求（确认目标 URL 是否可信）' },
  { pattern: /\bXMLHttpRequest\b/, description: 'XMLHttpRequest 使用' },
  { pattern: /\brequire\s*\(/, description: '动态 require（检查是否安全）' },
  { pattern: /\bimport\s*\(/, description: '动态 import（检查是否安全）' },
]

// ─── 类型 ───

interface ValidateInput {
  local_path?: string
  skill_json_url?: string
}

interface ValidateOutput {
  safe: boolean
  skill_json_valid: boolean
  issues: string[]
  warnings: string[]
}

// ─── 执行器 ───

export async function execute(
  input: ValidateInput,
  ctx: SkillContext,
): Promise<ValidateOutput> {
  const issues: string[] = []
  const warnings: string[] = []
  let skillJsonValid = false

  if (input.local_path) {
    // 本地目录校验
    const result = validateLocalPath(input.local_path, issues, warnings)
    skillJsonValid = result.skillJsonValid
  } else if (input.skill_json_url) {
    // 远程 skill.json 预检
    const result = await validateRemoteSkillJson(input.skill_json_url, issues, warnings)
    skillJsonValid = result.skillJsonValid
  } else {
    issues.push('必须提供 local_path 或 skill_json_url 之一')
  }

  return {
    safe: issues.length === 0,
    skill_json_valid: skillJsonValid,
    issues,
    warnings,
  }
}

// ─── 本地目录校验 ───

function validateLocalPath(
  dirPath: string,
  issues: string[],
  warnings: string[],
): { skillJsonValid: boolean } {
  // 检查目录是否存在
  if (!fs.existsSync(dirPath)) {
    issues.push(`目录不存在: ${dirPath}`)
    return { skillJsonValid: false }
  }

  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) {
    issues.push(`路径不是目录: ${dirPath}`)
    return { skillJsonValid: false }
  }

  // 检查 skill.json
  const skillJsonPath = path.join(dirPath, 'skill.json')
  const skillJsonValid = validateSkillJson(skillJsonPath, issues, warnings)

  // 遍历所有文件
  scanFiles(dirPath, dirPath, issues, warnings)

  return { skillJsonValid }
}

// ─── skill.json 结构校验 ───

function validateSkillJson(
  filePath: string,
  issues: string[],
  warnings: string[],
): boolean {
  if (!fs.existsSync(filePath)) {
    issues.push('缺少 skill.json 文件')
    return false
  }

  let meta: Record<string, unknown>
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    meta = JSON.parse(content)
  } catch (err) {
    issues.push(`skill.json 解析失败: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }

  // 必填字段
  const requiredFields = ['name', 'description', 'mode']
  for (const field of requiredFields) {
    if (!meta[field]) {
      issues.push(`skill.json 缺少必填字段: ${field}`)
    }
  }

  // name 格式
  if (typeof meta.name === 'string' && !SKILL_NAME_PATTERN.test(meta.name)) {
    issues.push(`skill.json name 格式不合法: "${meta.name}"（应为小写字母开头，只含小写字母、数字、下划线）`)
  }

  // mode 枚举
  if (typeof meta.mode === 'string' && !VALID_MODES.has(meta.mode)) {
    issues.push(`skill.json mode 不合法: "${meta.mode}"（应为 code/llm/composite）`)
  }

  // input/output 应为对象
  if (meta.input && typeof meta.input !== 'object') {
    warnings.push('skill.json input 应为对象类型')
  }
  if (meta.output && typeof meta.output !== 'object') {
    warnings.push('skill.json output 应为对象类型')
  }

  // mode=llm 需要 prompt.md
  if (meta.mode === 'llm') {
    const promptPath = path.join(path.dirname(filePath), 'prompt.md')
    if (!fs.existsSync(promptPath)) {
      warnings.push('mode=llm 但缺少 prompt.md 文件')
    }
  }

  // mode=code 需要 index.ts 或 index.js
  if (meta.mode === 'code') {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(path.join(dir, 'index.ts')) && !fs.existsSync(path.join(dir, 'index.js'))) {
      warnings.push('mode=code 但缺少 index.ts 或 index.js 文件')
    }
  }

  return issues.length === 0
}

// ─── 文件扫描 ───

function scanFiles(
  rootDir: string,
  currentDir: string,
  issues: string[],
  warnings: string[],
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name)
    const relativePath = path.relative(rootDir, fullPath)

    // 跳过 node_modules
    if (entry.name === 'node_modules') {
      warnings.push(`包含 node_modules 目录（不建议）: ${relativePath}`)
      continue
    }

    if (entry.isDirectory()) {
      scanFiles(rootDir, fullPath, issues, warnings)
      continue
    }

    // 文件扩展名检查
    const ext = path.extname(entry.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      issues.push(`不允许的文件类型: ${relativePath}（只允许 ${[...ALLOWED_EXTENSIONS].join(', ')}）`)
      continue
    }

    // 文件大小检查
    const stat = fs.statSync(fullPath)
    if (stat.size > MAX_FILE_SIZE) {
      issues.push(`文件过大: ${relativePath}（${(stat.size / 1024 / 1024).toFixed(2)} MB，上限 1MB）`)
      continue
    }

    // 代码文件的内容检查
    if (['.ts', '.js'].includes(ext)) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      checkCodeContent(content, relativePath, issues, warnings)
    }
  }
}

// ─── 代码内容安全检查 ───

function checkCodeContent(
  content: string,
  filePath: string,
  issues: string[],
  warnings: string[],
): void {
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(`危险代码: ${filePath} — ${description}`)
    }
  }

  for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`可疑代码: ${filePath} — ${description}`)
    }
  }
}

// ─── 远程 skill.json 预检 ───

async function validateRemoteSkillJson(
  url: string,
  issues: string[],
  warnings: string[],
): Promise<{ skillJsonValid: boolean }> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      issues.push(`无法获取远程 skill.json: HTTP ${response.status}`)
      return { skillJsonValid: false }
    }

    const text = await response.text()
    let meta: Record<string, unknown>
    try {
      meta = JSON.parse(text)
    } catch {
      issues.push('远程 skill.json 不是合法 JSON')
      return { skillJsonValid: false }
    }

    // 必填字段
    const requiredFields = ['name', 'description', 'mode']
    for (const field of requiredFields) {
      if (!meta[field]) {
        issues.push(`远程 skill.json 缺少必填字段: ${field}`)
      }
    }

    // name 格式
    if (typeof meta.name === 'string' && !SKILL_NAME_PATTERN.test(meta.name)) {
      issues.push(`远程 skill.json name 格式不合法: "${meta.name}"`)
    }

    // mode 枚举
    if (typeof meta.mode === 'string' && !VALID_MODES.has(meta.mode)) {
      issues.push(`远程 skill.json mode 不合法: "${meta.mode}"`)
    }

    return { skillJsonValid: issues.length === 0 }
  } catch (err) {
    issues.push(`获取远程 skill.json 失败: ${err instanceof Error ? err.message : String(err)}`)
    return { skillJsonValid: false }
  }
}
