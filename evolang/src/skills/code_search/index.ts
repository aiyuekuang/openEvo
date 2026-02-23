import * as fs from 'fs'
import * as path from 'path'
import type { SkillContext } from '../../types'

interface SearchInput {
  pattern: string
  path?: string
  glob?: string
  context_lines?: number
  limit?: number
}

interface Match {
  file: string
  line: number
  content: string
}

const DEFAULT_LIMIT = 50
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.tox', '.venv', 'coverage', '.nyc_output',
])
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml',
  '.toml', '.html', '.css', '.scss', '.less', '.py', '.rb', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.bash', '.zsh', '.sql',
  '.xml', '.svg', '.env', '.conf', '.cfg', '.ini', '.vue', '.svelte',
])

export async function execute(
  input: SearchInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const rootDir = input.path || process.cwd()
  const limit = input.limit ?? DEFAULT_LIMIT
  const contextLines = input.context_lines ?? 0

  if (!fs.existsSync(rootDir)) {
    return { matches: [], total_matches: 0, files_searched: 0, error: `目录不存在: ${rootDir}` }
  }

  let regex: RegExp
  try {
    regex = new RegExp(input.pattern, 'g')
  } catch (err) {
    return { matches: [], total_matches: 0, files_searched: 0, error: `无效的正则表达式: ${input.pattern}` }
  }

  const allFiles: string[] = []
  walkDir(rootDir, allFiles, 0, 10)

  // 文件过滤
  const filtered = input.glob
    ? allFiles.filter(f => matchExtGlob(f, input.glob!))
    : allFiles.filter(f => TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()))

  const matches: Match[] = []
  let totalMatches = 0

  for (const filePath of filtered) {
    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0
      if (regex.test(lines[i])) {
        totalMatches++
        if (matches.length < limit) {
          // 带上下文
          if (contextLines > 0) {
            const start = Math.max(0, i - contextLines)
            const end = Math.min(lines.length - 1, i + contextLines)
            const contextContent = lines.slice(start, end + 1)
              .map((l, idx) => {
                const lineNum = start + idx + 1
                const marker = (start + idx === i) ? '>' : ' '
                return `${marker}${String(lineNum).padStart(6, ' ')}\t${l}`
              }).join('\n')
            matches.push({ file: filePath, line: i + 1, content: contextContent })
          } else {
            matches.push({ file: filePath, line: i + 1, content: lines[i] })
          }
        }
      }
    }
  }

  ctx.log(`搜索 "${input.pattern}": ${totalMatches} 个匹配 (${filtered.length} 个文件)`)
  return { matches, total_matches: totalMatches, files_searched: filtered.length }
}

function walkDir(dir: string, results: string[], depth: number, maxDepth: number): void {
  if (depth > maxDepth) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
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

/** 简单的扩展名 glob 匹配（如 '*.ts'、'*.{ts,tsx}'） */
function matchExtGlob(filePath: string, glob: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  // 处理 *.{ts,tsx} 格式
  const braceMatch = glob.match(/^\*\.\{(.+)\}$/)
  if (braceMatch) {
    const exts = braceMatch[1].split(',').map(e => '.' + e.trim())
    return exts.includes(ext)
  }
  // 处理 *.ts 格式
  const simpleMatch = glob.match(/^\*(\.\w+)$/)
  if (simpleMatch) {
    return ext === simpleMatch[1]
  }
  return true // 不认识的 glob 就不过滤
}
