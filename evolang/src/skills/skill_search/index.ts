// ═══════════════════════════════════════════════════════════════
// skill_search — GitHub Skill 搜索
//
// 搜索策略：
//   1. 优先搜索带 topic:evolang-skill 的仓库
//   2. 回退搜索关键词 + "skill" 相关仓库
//   3. 检测仓库中是否包含 skill.json
//   4. 计算综合置信分
//
// 置信分计算：
//   - has_skill_json: +0.4
//   - stars (log scale): +0.1~0.2
//   - keyword match: +0.1 per keyword (max 0.3)
//   - topic match (evolang): +0.2
// ═══════════════════════════════════════════════════════════════

import type { SkillContext } from '../../types'

// ─── 类型 ───

interface SearchInput {
  query: string
  keywords?: string[]
  domain?: string
  limit?: number
}

interface SearchResult {
  name: string
  repo: string
  description: string
  stars: number
  url: string
  skill_json_url?: string
  has_skill_json: boolean
  confidence: number
}

interface SearchOutput {
  results: SearchResult[]
  total_found: number
}

// GitHub API 响应类型
interface GitHubSearchResponse {
  total_count: number
  items: Array<{
    name: string
    full_name: string
    description: string | null
    html_url: string
    stargazers_count: number
    topics: string[]
    default_branch: string
  }>
}

// ─── 辅助：获取 GitHub Token ───

function getGitHubToken(ctx: SkillContext): string | undefined {
  // 优先从 env 读取（Agent 从配置注入）
  const envToken = (ctx.env as Record<string, unknown>)?.githubToken as string | undefined
  if (envToken) return envToken
  // fallback: 环境变量
  return process.env.GITHUB_TOKEN || undefined
}

// ─── 执行器 ───

export async function execute(
  input: SearchInput,
  ctx: SkillContext,
): Promise<SearchOutput> {
  const limit = input.limit || 5
  const keywords = input.keywords || []
  const domain = input.domain || ''
  const token = getGitHubToken(ctx)

  // 构建搜索查询
  const queries = buildSearchQueries(input.query, keywords, domain)

  ctx.log(`搜索 GitHub: ${queries[0]}`)

  // 执行搜索（多个查询策略，合并去重）
  const allItems = new Map<string, GitHubSearchResponse['items'][0]>()
  let totalFound = 0

  for (const q of queries) {
    try {
      const result = await searchGitHub(q, limit * 2, token)
      totalFound = Math.max(totalFound, result.total_count)
      for (const item of result.items) {
        if (!allItems.has(item.full_name)) {
          allItems.set(item.full_name, item)
        }
      }
    } catch (err) {
      ctx.log(`搜索失败 (${q}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (allItems.size === 0) {
    return { results: [], total_found: 0 }
  }

  // 检测 skill.json 并计算置信分
  const results: SearchResult[] = []

  for (const item of allItems.values()) {
    const hasSkillJson = await checkSkillJson(item.full_name, item.default_branch, token)
    const skillJsonUrl = hasSkillJson
      ? `https://raw.githubusercontent.com/${item.full_name}/${item.default_branch}/skill.json`
      : undefined

    const confidence = calculateConfidence(item, hasSkillJson, keywords)

    results.push({
      name: item.name,
      repo: item.full_name,
      description: item.description || '',
      stars: item.stargazers_count,
      url: item.html_url,
      skill_json_url: skillJsonUrl,
      has_skill_json: hasSkillJson,
      confidence,
    })
  }

  // 按置信分降序排列，截取 limit
  results.sort((a, b) => b.confidence - a.confidence)
  const topResults = results.slice(0, limit)

  ctx.log(`找到 ${results.length} 个结果，返回前 ${topResults.length} 个`)

  return {
    results: topResults,
    total_found: totalFound,
  }
}

// ─── 构建搜索查询 ───

function buildSearchQueries(query: string, keywords: string[], domain: string): string[] {
  const queries: string[] = []

  // 策略 1: evolang-skill topic
  queries.push(`${query} topic:evolang-skill`)

  // 策略 2: openevo topic
  queries.push(`${query} topic:openevo-skill`)

  // 策略 3: 关键词 + skill
  if (keywords.length > 0) {
    const kwString = keywords.slice(0, 3).join(' ')
    queries.push(`${kwString} skill in:name,description,readme`)
  }

  // 策略 4: 领域 + 查询
  if (domain) {
    queries.push(`${query} ${domain} skill`)
  }

  // 策略 5: 纯查询
  queries.push(`${query} skill json`)

  return queries
}

// ─── GitHub Search API ───

async function searchGitHub(query: string, perPage: number, token?: string): Promise<GitHubSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    sort: 'stars',
    order: 'desc',
    per_page: String(Math.min(perPage, 30)),
  })

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'OpenEvo-SkillSearch/1.0',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(
    `https://api.github.com/search/repositories?${params}`,
    { headers },
  )

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<GitHubSearchResponse>
}

// ─── 检测 skill.json 是否存在 ───

async function checkSkillJson(fullName: string, defaultBranch: string, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'OpenEvo-SkillSearch/1.0',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `https://api.github.com/repos/${fullName}/contents/skill.json?ref=${defaultBranch}`,
      { headers, method: 'HEAD' },
    )

    return response.ok
  } catch {
    return false
  }
}

// ─── 置信分计算 ───

function calculateConfidence(
  item: GitHubSearchResponse['items'][0],
  hasSkillJson: boolean,
  keywords: string[],
): number {
  let score = 0

  // has_skill_json: +0.4
  if (hasSkillJson) score += 0.4

  // stars (log scale): +0.1~0.2
  if (item.stargazers_count > 0) {
    score += Math.min(0.2, 0.1 + Math.log10(item.stargazers_count) * 0.03)
  }

  // topic match: +0.2
  const topics = item.topics || []
  if (topics.includes('evolang-skill') || topics.includes('openevo-skill')) {
    score += 0.2
  }

  // keyword match: +0.1 per keyword (max 0.3)
  const description = (item.description || '').toLowerCase()
  const name = item.name.toLowerCase()
  let kwScore = 0
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase()
    if (description.includes(kwLower) || name.includes(kwLower)) {
      kwScore += 0.1
    }
  }
  score += Math.min(0.3, kwScore)

  return Math.min(1, Math.round(score * 100) / 100)
}
