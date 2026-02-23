// ═══════════════════════════════════════════════════════════════
// task_planner — 任务规划主编排器
//
// 流程：
//   1. domain_classify → 识别领域 + 能力清单
//   2. 遍历 required_capabilities:
//      a. 已有 → 直接用
//      b. 搜索 GitHub → 验证 → 安装
//      c. 搜不到 → LLM 自动开发
//   3. 每次安装/开发后，热加载到 registry
//   4. 返回完整方案 + 所有获取到的 Skill 状态
// ═══════════════════════════════════════════════════════════════

import * as path from 'path'
import * as os from 'os'
import type { SkillContext } from '../../types'

// ─── 类型 ───

interface PlannerInput {
  task: string
  available_skills?: Array<{ name: string; description: string; category: string }>
  prefer_existing?: boolean
}

interface PlanStep {
  step: number
  action: 'use_existing' | 'install_from_market' | 'develop_new'
  skill_name: string
  reason: string
}

interface AcquiredSkill {
  name: string
  source: 'existing' | 'market' | 'developed'
  status: 'ready' | 'installed' | 'created' | 'failed'
}

interface DomainResult {
  industry: string
  subdomain: string
  keywords: string[]
  required_capabilities: Array<{
    name: string
    description: string
    can_match_existing: boolean
    existing_skill?: string
  }>
}

interface SearchResult {
  results: Array<{
    name: string
    repo: string
    confidence: number
    has_skill_json: boolean
    skill_json_url?: string
  }>
  total_found: number
}

interface PlannerOutput {
  domain?: {
    industry: string
    subdomain: string
    keywords: string[]
  }
  plan: PlanStep[]
  acquired_skills: AcquiredSkill[]
  ready: boolean
  summary: string
}

// ─── 常量 ───

const SEARCH_CONFIDENCE_THRESHOLD = 0.5
const MARKET_DIR = path.join(os.homedir(), '.openevo', 'skills', 'market')
const CUSTOM_DIR = path.join(os.homedir(), '.openevo', 'skills', 'custom')
const MAX_CONCURRENCY = 3

// ─── 单个能力获取结果 ───

interface CapabilityResult {
  planStep: PlanStep
  acquiredSkill: AcquiredSkill
}

// ─── 执行器 ───

export async function execute(
  input: PlannerInput,
  ctx: SkillContext,
): Promise<PlannerOutput> {
  // 1. 领域识别
  ctx.log('开始领域分析...')
  let domainResult: DomainResult

  try {
    domainResult = await ctx.call<DomainResult>('domain_classify', {
      task: input.task,
    })
    ctx.log(`领域: ${domainResult.industry}/${domainResult.subdomain}, ` +
      `需要 ${domainResult.required_capabilities.length} 个能力`)
  } catch (err) {
    ctx.log(`领域分析失败: ${err instanceof Error ? err.message : String(err)}`)
    return {
      plan: [],
      acquired_skills: [],
      ready: false,
      summary: `领域分析失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 2. 并行获取所需能力（最多 MAX_CONCURRENCY 个并发）
  const capabilities = domainResult.required_capabilities
  ctx.log(`开始并行获取 ${capabilities.length} 个能力 (最大并发 ${MAX_CONCURRENCY})...`)

  const results = await runConcurrent(
    capabilities,
    (cap, index) => acquireCapability(cap, index + 1, domainResult, ctx),
    MAX_CONCURRENCY,
  )

  // 收集结果（保持原始顺序）
  const plan: PlanStep[] = results.map(r => r.planStep)
  const acquiredSkills: AcquiredSkill[] = results.map(r => r.acquiredSkill)

  // 3. 汇总
  const readyCount = acquiredSkills.filter(s => s.status !== 'failed').length
  const totalCount = acquiredSkills.length
  const allReady = readyCount === totalCount && totalCount > 0

  const summary = allReady
    ? `已规划 ${plan.length} 个步骤，所有 ${totalCount} 个技能就绪。`
      + ` 领域: ${domainResult.industry}/${domainResult.subdomain}。`
      + ` 来源: ${acquiredSkills.filter(s => s.source === 'existing').length} 个已有，`
      + `${acquiredSkills.filter(s => s.source === 'market').length} 个从市场安装，`
      + `${acquiredSkills.filter(s => s.source === 'developed').length} 个自动开发。`
    : `规划了 ${plan.length} 个步骤，${readyCount}/${totalCount} 个技能就绪，`
      + `${totalCount - readyCount} 个获取失败。`

  return {
    domain: {
      industry: domainResult.industry,
      subdomain: domainResult.subdomain,
      keywords: domainResult.keywords,
    },
    plan,
    acquired_skills: acquiredSkills,
    ready: allReady,
    summary,
  }
}

// ═══════════════════════════════════════════════════════════════
// 单个能力获取（搜索 → 安装 → 开发）
// ═══════════════════════════════════════════════════════════════

async function acquireCapability(
  cap: DomainResult['required_capabilities'][0],
  stepIndex: number,
  domainResult: DomainResult,
  ctx: SkillContext,
): Promise<CapabilityResult> {
  // 2a. 检查已有 Skill
  if (cap.can_match_existing && cap.existing_skill) {
    if (ctx.registry.has(cap.existing_skill)) {
      ctx.log(`✓ ${cap.name} → 使用已有 Skill: ${cap.existing_skill}`)
      return {
        planStep: {
          step: stepIndex,
          action: 'use_existing',
          skill_name: cap.existing_skill,
          reason: `已有 Skill "${cap.existing_skill}" 可满足: ${cap.description}`,
        },
        acquiredSkill: {
          name: cap.existing_skill,
          source: 'existing',
          status: 'ready',
        },
      }
    }
  }

  // 2b. 搜索 GitHub
  ctx.log(`搜索 ${cap.name}...`)

  try {
    const searchResult = await ctx.call<SearchResult>('skill_search', {
      query: cap.name,
      keywords: domainResult.keywords,
      domain: domainResult.industry,
      limit: 3,
    })

    const bestMatch = searchResult.results.find(
      r => r.confidence >= SEARCH_CONFIDENCE_THRESHOLD && r.has_skill_json
    )

    if (bestMatch) {
      ctx.log(`找到匹配: ${bestMatch.repo} (置信分 ${bestMatch.confidence})`)

      try {
        const installResult = await ctx.call<{
          success: boolean
          installed_path?: string
          error?: string
        }>('skill_install', {
          repo: bestMatch.repo,
          skill_name: cap.name,
        })

        if (installResult.success) {
          await hotLoadSkill(ctx, MARKET_DIR, cap.name)
          ctx.log(`✓ ${cap.name} → 已从 GitHub 安装`)
          return {
            planStep: {
              step: stepIndex,
              action: 'install_from_market',
              skill_name: cap.name,
              reason: `从 ${bestMatch.repo} 安装: ${cap.description}`,
            },
            acquiredSkill: {
              name: cap.name,
              source: 'market',
              status: 'installed',
            },
          }
        } else {
          ctx.log(`安装失败: ${installResult.error}`)
        }
      } catch (err) {
        ctx.log(`安装异常: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    ctx.log(`搜索失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2c. 搜索/安装失败 → 自动开发
  ctx.log(`自动开发 ${cap.name}...`)

  try {
    const devResult = await ctx.call<{
      success: boolean
      skill_path?: string
      mode?: string
      error?: string
    }>('skill_develop', {
      name: cap.name,
      description: cap.description,
      domain: domainResult.industry,
      keywords: domainResult.keywords,
    })

    if (devResult.success) {
      await hotLoadSkill(ctx, CUSTOM_DIR, cap.name)
      ctx.log(`✓ ${cap.name} → 自动开发完成`)
      return {
        planStep: {
          step: stepIndex,
          action: 'develop_new',
          skill_name: cap.name,
          reason: `自动开发 (${devResult.mode} 模式): ${cap.description}`,
        },
        acquiredSkill: {
          name: cap.name,
          source: 'developed',
          status: 'created',
        },
      }
    } else {
      ctx.log(`✗ ${cap.name} → 开发失败: ${devResult.error}`)
      return {
        planStep: {
          step: stepIndex,
          action: 'develop_new',
          skill_name: cap.name,
          reason: `开发失败: ${devResult.error}`,
        },
        acquiredSkill: {
          name: cap.name,
          source: 'developed',
          status: 'failed',
        },
      }
    }
  } catch (err) {
    ctx.log(`✗ ${cap.name} → 开发异常: ${err instanceof Error ? err.message : String(err)}`)
    return {
      planStep: {
        step: stepIndex,
        action: 'develop_new',
        skill_name: cap.name,
        reason: `开发异常: ${err instanceof Error ? err.message : String(err)}`,
      },
      acquiredSkill: {
        name: cap.name,
        source: 'developed',
        status: 'failed',
      },
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 并发执行器 — 带 maxConcurrency 限制，保持结果顺序
// ═══════════════════════════════════════════════════════════════

async function runConcurrent<T, U>(
  items: T[],
  executor: (item: T, index: number) => Promise<U>,
  maxConcurrency: number,
): Promise<U[]> {
  if (items.length === 0) return []

  const results: U[] = new Array(items.length)

  if (maxConcurrency >= items.length) {
    // 全部并行
    await Promise.all(items.map(async (item, idx) => {
      results[idx] = await executor(item, idx)
    }))
  } else {
    // 分批执行
    for (let i = 0; i < items.length; i += maxConcurrency) {
      const batch = items.slice(i, i + maxConcurrency)
      await Promise.all(batch.map(async (item, batchIdx) => {
        results[i + batchIdx] = await executor(item, i + batchIdx)
      }))
    }
  }

  return results
}

// ─── 热加载 Skill 到 Registry ───

async function hotLoadSkill(
  ctx: SkillContext,
  baseDir: string,
  skillName: string,
): Promise<void> {
  const skillDir = path.join(baseDir, skillName)
  try {
    const skills = await ctx.loadSkillsFromDir(skillDir)
    for (const skill of skills) {
      ctx.registry.register(skill)
      ctx.log(`热加载: ${skill.meta.name}`)
    }
  } catch (err) {
    ctx.log(`热加载失败 (${skillName}): ${err instanceof Error ? err.message : String(err)}`)
  }
}
