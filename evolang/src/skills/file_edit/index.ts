import * as fs from 'fs'
import type { SkillContext } from '../../types'

interface EditInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export async function execute(
  input: EditInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const { file_path, old_string, new_string, replace_all } = input

  if (!fs.existsSync(file_path)) {
    return { success: false, error: `文件不存在: ${file_path}` }
  }

  if (old_string === new_string) {
    return { success: false, error: 'old_string 和 new_string 相同' }
  }

  const content = fs.readFileSync(file_path, 'utf-8')

  // 统计匹配数
  let matchCount = 0
  let searchPos = 0
  while (true) {
    const idx = content.indexOf(old_string, searchPos)
    if (idx === -1) break
    matchCount++
    searchPos = idx + old_string.length
  }

  if (matchCount === 0) {
    return {
      success: false,
      error: `在文件中未找到匹配的文本。请确认 old_string 完全匹配文件中的内容（包括空格和换行）。`,
    }
  }

  if (matchCount > 1 && !replace_all) {
    return {
      success: false,
      error: `找到 ${matchCount} 处匹配，但 replace_all 未设置。请提供更多上下文使 old_string 唯一，或设置 replace_all: true。`,
    }
  }

  // 执行替换
  let result: string
  if (replace_all) {
    result = content.split(old_string).join(new_string)
  } else {
    const idx = content.indexOf(old_string)
    result = content.slice(0, idx) + new_string + content.slice(idx + old_string.length)
  }

  fs.writeFileSync(file_path, result, 'utf-8')
  const replacements = replace_all ? matchCount : 1

  ctx.log(`编辑 ${file_path} (${replacements} 处替换)`)
  return { success: true, replacements }
}
