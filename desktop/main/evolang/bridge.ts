// ═══════════════════════════════════════════════════════════════
// desktop/main/evolang/bridge.ts — evolang ↔ desktop 桥接层
//
// 职责：
//   1. 创建 Agent 单例
//   2. 包装 desktop 的 memory tools 为 evolang Skills
//   3. 三层 Skill 加载（builtin → project → user，后者覆盖前者）
//   4. 提供 PromptCompiler（复用 desktop 的 buildSystemPrompt）
//
// Skill 目录结构（全部在 ~/.openevo/skills/ 下）：
//   system/      — 系统技能（启动时从源码同步，最低优先级）
//   market/      — 市场技能（中间优先级）
//   custom/      — 自定义 + AI 自进化技能（最高优先级）
// ═══════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { Agent } from 'evolang'
import type { RegisteredSkill, PromptCompiler } from 'evolang'
import { DesktopLLMProvider } from './adapter'
import { ConfigStore } from '../config/store'
import { buildSystemPrompt } from '../memory/prompt'
import { autoRecall } from '../memory/auto'
import { MEMORY_TOOLS, executeMemoryTool } from '../memory/tools'
import { logger } from '../utils/logger'

let agent: Agent<DesktopEnv> | null = null

/** desktop 环境类型 — 由 createEnv 创建 */
interface DesktopEnv {
  relevantMemories: string
  githubToken?: string
}

// ─── Skill 目录路径 ───

const OPENEVO_DIR = path.join(os.homedir(), '.openevo')
const SKILLS_BASE = path.join(OPENEVO_DIR, 'skills')
const SKILLS_SYSTEM = path.join(SKILLS_BASE, 'system')
const SKILLS_MARKET = path.join(SKILLS_BASE, 'market')
const SKILLS_CUSTOM = path.join(SKILLS_BASE, 'custom')

// ─── PromptCompiler ───

const promptCompiler: PromptCompiler = {
  compile(ctx) {
    const env = ctx.env as unknown as DesktopEnv
    return buildSystemPrompt({
      relevantMemories: env.relevantMemories || '',
      hasTools: ctx.skills.length > 0,
    })
  },
}

// ─── 初始化 ───

export async function initEvolang(): Promise<Agent<DesktopEnv>> {
  const llmProvider = new DesktopLLMProvider()

  agent = new Agent<DesktopEnv>({
    llm: llmProvider,
    storage: { dataDir: '' }, // Phase 2: 真正的存储目录
    prompt: promptCompiler,
    logger: {
      info: (msg, ...args) => logger.info(msg, ...args),
      warn: (msg, ...args) => logger.warn(msg, ...args),
      error: (msg, ...args) => logger.error(msg, ...args),
    },
    maxDepth: 10,
    validation: {
      maxInputRetries: 3,
      maxOutputRetries: 3,
      fallbackStrategy: 'return_raw',
    },
    beforeSkills: [],
    afterSkills: [],
    // 创建环境时执行 autoRecall + 注入配置
    createEnv: async (input) => {
      const configStore = new ConfigStore()
      let relevantMemories = ''
      try {
        relevantMemories = await autoRecall(input.message)
      } catch (err) {
        logger.warn('[evolang] autoRecall failed:', err)
      }
      return {
        relevantMemories,
        githubToken: (configStore.get('githubToken') as string) || undefined,
      }
    },
  })

  // 注册 desktop memory tools 为 evolang Skills
  registerMemorySkills(agent)
  logger.info(`[evolang] 已注册 ${MEMORY_TOOLS.length} 个 memory Skills`)

  // 确保三层 Skill 目录存在
  ensureSkillDirs()

  // 同步系统 Skills 到 ~/.openevo/skills/system/
  syncSystemSkills()

  // 三层加载：system → thirdparty → custom（后者覆盖前者）
  try {
    const layers = await agent.loadSkillsLayered([
      SKILLS_SYSTEM,      // 最低优先级（系统 Skills）
      SKILLS_MARKET,  // 中间优先级（市场 Skills）
      SKILLS_CUSTOM,      // 最高优先级（自定义 Skills）
    ])
    for (const layer of layers) {
      if (layer.skills.length > 0) {
        const dirName = path.basename(layer.layer)
        logger.info(`[evolang] ${dirName} 层加载 ${layer.skills.length} 个 Skills: ${layer.skills.join(', ')}`)
      }
    }
    const allSkills = agent.getRegistry().list().map(s => s.meta.name)
    logger.info(`[evolang] 总计 ${allSkills.length} 个 Skills: ${allSkills.join(', ')}`)
  } catch (err) {
    logger.warn('[evolang] Skill 加载失败:', err)
  }

  return agent
}

export function getAgent(): Agent<DesktopEnv> {
  if (!agent) throw new Error('EvoLang 尚未初始化，请先调用 initEvolang()')
  return agent
}

/** 获取自定义 Skill 目录路径（供 AI 自进化写入新 Skill） */
export function getCustomSkillsDir(): string {
  return SKILLS_CUSTOM
}

/** 获取 Skill 根目录路径 */
export function getSkillsBaseDir(): string {
  return SKILLS_BASE
}

/**
 * 重置系统 Skills — 清空 system 目录并从源码重新同步，然后重新加载全部 Skills
 * 供外部对接方调用（如 App 更新后、用户手动重置、IPC 触发等）
 * @returns 重置后的 Skill 列表
 */
export async function resetSystemSkills(): Promise<{ total: number; skills: string[] }> {
  if (!agent) throw new Error('EvoLang 尚未初始化')

  // 1. 清空 system 目录
  if (fs.existsSync(SKILLS_SYSTEM)) {
    fs.rmSync(SKILLS_SYSTEM, { recursive: true, force: true })
    logger.info('[evolang] 已清空 system 目录')
  }
  fs.mkdirSync(SKILLS_SYSTEM, { recursive: true })

  // 2. 从源码重新同步
  syncSystemSkills()

  // 3. 重新加载全部三层 Skills（会覆盖当前 registry 中的同名 Skill）
  const layers = await agent.loadSkillsLayered([
    SKILLS_SYSTEM,
    SKILLS_MARKET,
    SKILLS_CUSTOM,
  ])

  const allSkills = agent.getRegistry().list().map(s => s.meta.name)
  logger.info(`[evolang] 重置完成，总计 ${allSkills.length} 个 Skills: ${allSkills.join(', ')}`)

  return { total: allSkills.length, skills: allSkills }
}

// ─── 目录管理 ───

function ensureSkillDirs(): void {
  for (const dir of [SKILLS_SYSTEM, SKILLS_MARKET, SKILLS_CUSTOM]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      logger.info(`[evolang] 创建 Skill 目录: ${dir}`)
    }
  }
}

/**
 * 将源码中的系统 Skills 同步到 ~/.openevo/skills/system/
 *
 * 合并策略：
 *   - 从 evolang/src/skills/ 复制非代码文件（.json, .md, .txt, .yaml, .yml）
 *   - 从 evolang/dist/skills/ 复制编译后的 .js 文件
 *   - 不复制 .ts 文件（运行时无法 import）
 *
 * 每次启动都同步，确保 App 更新后系统 Skills 也更新
 */
function syncSystemSkills(): void {
  const projectRoot = path.resolve(app.getAppPath(), '..')
  const srcDir = path.join(projectRoot, 'evolang/src/skills')
  const distDir = path.join(projectRoot, 'evolang/dist/skills')

  if (!fs.existsSync(srcDir)) {
    logger.warn(`[evolang] 系统 Skills 源目录不存在: ${srcDir}`)
    return
  }

  // 1. 从 src 复制非代码文件（skill.json, prompt.md 等）
  copySkillDirRecursive(srcDir, SKILLS_SYSTEM, ['.json', '.md', '.txt', '.yaml', '.yml'])

  // 2. 从 dist 复制编译后的 .js 文件
  if (fs.existsSync(distDir)) {
    copySkillDirRecursive(distDir, SKILLS_SYSTEM, ['.js'])
    logger.info(`[evolang] 已从 dist 合并编译后的 .js 文件`)
  } else {
    logger.warn(`[evolang] 编译输出目录不存在: ${distDir}（code 模式 Skills 将无法加载）`)
  }

  // 3. 确保 skills 根目录有 ESM 标识（编译后的 .js 是 ESM 格式）
  ensureEsmPackageJson(SKILLS_BASE)

  const synced = countSkills(SKILLS_SYSTEM)
  logger.info(`[evolang] 同步系统 Skills: ${srcDir} + ${distDir} → ${SKILLS_SYSTEM} (${synced} 个)`)
}

/**
 * 在 Skills 根目录放置 package.json，使 Node.js 的 import() 正确识别 ESM
 */
function ensureEsmPackageJson(dir: string): void {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, 2))
    logger.info(`[evolang] 创建 ${pkgPath}（ESM 标识）`)
  }
}

/**
 * 递归复制 Skill 目录（仅复制指定扩展名的文件）
 */
function copySkillDirRecursive(src: string, dest: string, allowedExts: string[]): void {
  if (!fs.existsSync(src)) return
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copySkillDirRecursive(srcPath, destPath, allowedExts)
    } else {
      const ext = path.extname(entry.name).toLowerCase()
      if (allowedExts.includes(ext)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}

function countSkills(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillJson = path.join(dir, entry.name, 'skill.json')
    if (fs.existsSync(skillJson)) {
      count++
    } else {
      // 递归检查子目录
      count += countSkills(path.join(dir, entry.name))
    }
  }
  return count
}

// ─── Memory Tools → evolang Skills 桥接 ───

function registerMemorySkills(agent: Agent<DesktopEnv>): void {
  for (const toolDef of MEMORY_TOOLS) {
    const skill: RegisteredSkill<DesktopEnv> = {
      meta: {
        name: toolDef.name,
        description: toolDef.description,
        category: 'memory',
        input: toolDef.parameters as Record<string, unknown>,
        output: { type: 'object' },
        mode: 'code',
        calls: [],
        version: '1.0.0',
        tags: [],
        timeout: 30000,
        retry: 0,
      },
      execute: async (input) => {
        const result = await executeMemoryTool({
          id: crypto.randomUUID(),
          name: toolDef.name,
          arguments: input,
        })
        return {
          content: result.content,
          isError: result.isError,
        }
      },
    }
    agent.register(skill)
  }
}
