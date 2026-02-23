import * as child_process from 'child_process'
import type { SkillContext } from '../../types'

interface ShellInput {
  command: string
  cwd?: string
  timeout_ms?: number
}

const DEFAULT_TIMEOUT = 120_000
const MAX_OUTPUT_LENGTH = 30_000

// 危险命令模式 — 拦截明显的破坏性操作
const DANGEROUS_PATTERNS = [
  /rm\s+(-\w*f\w*\s+)?(-\w*r\w*\s+)?\/\s*$/,  // rm -rf /
  /rm\s+(-\w*r\w*\s+)?(-\w*f\w*\s+)?\/\s*$/,
  /mkfs\./,                                       // 格式化磁盘
  /dd\s+.*of=\/dev\//,                            // dd 写入设备
  /:\(\)\{.*\|.*&\s*\}\s*;/,                      // fork bomb
  />\s*\/dev\/sd[a-z]/,                            // 写入磁盘设备
  /chmod\s+-R\s+777\s+\//,                        // 全盘 777
]

export async function execute(
  input: ShellInput,
  ctx: SkillContext,
): Promise<Record<string, unknown>> {
  const { command, cwd, timeout_ms } = input
  const timeout = timeout_ms ?? DEFAULT_TIMEOUT

  // 安全检查
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        stdout: '',
        stderr: '',
        exit_code: -1,
        error: `命令被安全策略拦截: ${command}`,
      }
    }
  }

  ctx.log(`执行: ${command.slice(0, 200)}${command.length > 200 ? '...' : ''}`)

  try {
    const result = child_process.execSync(command, {
      cwd: cwd || process.cwd(),
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdout = truncate(result || '', MAX_OUTPUT_LENGTH)
    return { stdout, stderr: '', exit_code: 0 }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const execErr = err as child_process.ExecSyncOptionsWithStringEncoding & {
        status: number | null
        stdout: string | null
        stderr: string | null
        message: string
      }
      return {
        stdout: truncate(execErr.stdout || '', MAX_OUTPUT_LENGTH),
        stderr: truncate(execErr.stderr || '', MAX_OUTPUT_LENGTH),
        exit_code: execErr.status ?? 1,
      }
    }

    return {
      stdout: '',
      stderr: '',
      exit_code: -1,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + `\n... (输出被截断，共 ${str.length} 字符)`
}
