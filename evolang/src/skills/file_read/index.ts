import * as fs from 'fs'
import type { SkillContext } from '../../types'

interface ReadInput {
  file_path: string
  offset?: number
  limit?: number
}

const MAX_LINES = 2000
const MAX_LINE_LENGTH = 2000

export async function execute(
  input: ReadInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const { file_path, offset, limit } = input

  if (!fs.existsSync(file_path)) {
    return { content: '', error: `文件不存在: ${file_path}` }
  }

  const stat = fs.statSync(file_path)
  if (stat.isDirectory()) {
    return { content: '', error: `路径是目录，不是文件: ${file_path}` }
  }

  const raw = fs.readFileSync(file_path, 'utf-8')
  const allLines = raw.split('\n')
  const totalLines = allLines.length

  const startLine = Math.max(1, offset ?? 1)
  const maxRead = Math.min(limit ?? MAX_LINES, MAX_LINES)
  const endLine = Math.min(startLine + maxRead - 1, totalLines)
  const truncated = endLine < totalLines && !limit

  const lines = allLines.slice(startLine - 1, endLine)
  const numbered = lines.map((line, i) => {
    const num = String(startLine + i).padStart(6, ' ')
    const truncatedLine = line.length > MAX_LINE_LENGTH
      ? line.slice(0, MAX_LINE_LENGTH) + '...'
      : line
    return `${num}\t${truncatedLine}`
  }).join('\n')

  ctx.log(`读取 ${file_path} (行 ${startLine}-${endLine}/${totalLines})`)
  return { content: numbered, total_lines: totalLines, truncated }
}
