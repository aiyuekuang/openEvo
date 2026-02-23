import * as fs from 'fs'
import * as path from 'path'
import type { SkillContext } from '../../types'

interface SearchInput {
  pattern: string
  path?: string
  limit?: number
}

const DEFAULT_LIMIT = 100
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.tox', '.venv', 'coverage', '.nyc_output',
])

export async function execute(
  input: SearchInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const rootDir = input.path || process.cwd()
  const limit = input.limit ?? DEFAULT_LIMIT

  if (!fs.existsSync(rootDir)) {
    return { files: [], total_matches: 0, error: `目录不存在: ${rootDir}` }
  }

  try {
    const allFiles: string[] = []
    walkDir(rootDir, allFiles, 0, 10) // 最深 10 层

    // glob 匹配
    const pattern = input.pattern
    const matched = allFiles.filter(f => {
      const rel = path.relative(rootDir, f)
      return globMatch(rel, pattern)
    })

    const truncated = matched.length > limit
    const files = matched.slice(0, limit)

    ctx.log(`搜索 "${pattern}" 在 ${rootDir}: ${matched.length} 个匹配`)
    return { files, total_matches: matched.length, truncated }
  } catch (err) {
    return {
      files: [],
      total_matches: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function walkDir(dir: string, results: string[], depth: number, maxDepth: number): void {
  if (depth > maxDepth) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return // 权限不足等情况
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.isDirectory()) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(fullPath, results, depth + 1, maxDepth)
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }
}

/**
 * 简单 glob 匹配：
 * - ** → 匹配任意路径段
 * - * → 匹配不含路径分隔符的任意字符
 * - ? → 匹配单个字符
 */
function globMatch(filePath: string, pattern: string): boolean {
  // 标准化路径分隔符
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // 转换 glob 为正则
  let regex = ''
  let i = 0
  while (i < normalizedPattern.length) {
    const c = normalizedPattern[i]
    if (c === '*' && normalizedPattern[i + 1] === '*') {
      // ** 匹配任意路径（含子目录）
      regex += '.*'
      i += 2
      if (normalizedPattern[i] === '/') i++ // 跳过 **/
    } else if (c === '*') {
      regex += '[^/]*'
      i++
    } else if (c === '?') {
      regex += '[^/]'
      i++
    } else if ('.+^${}()|[]\\'.includes(c)) {
      regex += '\\' + c
      i++
    } else {
      regex += c
      i++
    }
  }

  return new RegExp('^' + regex + '$').test(normalizedPath)
}
