// ═══════════════════════════════════════════════════════════════
// evolang/src/registry.ts — SkillRegistry 指令表
// ═══════════════════════════════════════════════════════════════

import type {
  SkillRegistry as ISkillRegistry,
  RegisteredSkill,
  ToolDefinition,
} from './types'

export class SkillRegistryImpl implements ISkillRegistry {
  private skills = new Map<string, RegisteredSkill<any>>()

  register(skill: RegisteredSkill<any>): void {
    this.skills.set(skill.meta.name, skill)
  }

  unregister(name: string): void {
    this.skills.delete(name)
  }

  get(name: string): RegisteredSkill<any> | undefined {
    return this.skills.get(name)
  }

  has(name: string): boolean {
    return this.skills.has(name)
  }

  list(): RegisteredSkill<any>[] {
    return [...this.skills.values()]
  }

  listByCategory(category: string): RegisteredSkill<any>[] {
    return [...this.skills.values()].filter(s => s.meta.category === category)
  }

  get size(): number {
    return this.skills.size
  }

  /** 转为 CPU 可理解的指令列表（传给 LLM Function Calling） */
  toToolDefinitions(): ToolDefinition[] {
    return [...this.skills.values()]
      .filter(s => !s.meta.tags.includes('internal'))
      .map(s => ({
        name: s.meta.name,
        description: s.meta.description,
        parameters: s.meta.input,
      }))
  }
}
