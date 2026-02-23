// ═══════════════════════════════════════════════════════════════
// evolang/src/errors.ts — 错误类型
// ═══════════════════════════════════════════════════════════════

import type { ValidationViolation } from './types'

export class SkillNotFoundError extends Error {
  constructor(public readonly skillName: string) {
    super(`Skill "${skillName}" not found in registry`)
    this.name = 'SkillNotFoundError'
  }
}

export class SkillDepthError extends Error {
  constructor(
    public readonly skillName: string,
    public readonly currentDepth: number,
    public readonly maxDepth: number,
  ) {
    super(`Skill "${skillName}" exceeded max call depth (${currentDepth}/${maxDepth})`)
    this.name = 'SkillDepthError'
  }
}

export class SkillTimeoutError extends Error {
  constructor(
    public readonly skillName: string,
    public readonly timeoutMs: number,
  ) {
    super(`Skill "${skillName}" timed out after ${timeoutMs}ms`)
    this.name = 'SkillTimeoutError'
  }
}

export class SkillValidationError extends Error {
  constructor(
    public readonly skillName: string,
    public readonly direction: 'input' | 'output',
    public readonly violations: ValidationViolation[],
    message: string,
  ) {
    super(message)
    this.name = 'SkillValidationError'
  }

  toFeedback(): string {
    const dir = this.direction === 'input' ? '输入参数' : '输出结果'
    const lines = [`${this.skillName} ${dir}不符合要求：`]
    for (const v of this.violations) {
      lines.push(`  • [${v.path}] ${v.suggestion}`)
    }
    return lines.join('\n')
  }
}
