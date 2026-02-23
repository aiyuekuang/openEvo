import * as fs from 'fs'
import * as path from 'path'
import type { SkillContext } from '../../types'

interface WriteInput {
  file_path: string
  content: string
}

export async function execute(
  input: WriteInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const { file_path, content } = input

  try {
    // 自动创建中间目录
    const dir = path.dirname(file_path)
    fs.mkdirSync(dir, { recursive: true })

    fs.writeFileSync(file_path, content, 'utf-8')
    const bytes = Buffer.byteLength(content, 'utf-8')

    ctx.log(`写入 ${file_path} (${bytes} 字节)`)
    return { success: true, bytes_written: bytes }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
