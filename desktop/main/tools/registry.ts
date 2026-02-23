/**
 * Tool Registry — 通用工具注册中心
 * 所有工具（memory、web_search、code_exec 等）统一在此注册
 * ipc.ts 通过 registry 获取工具列表和执行器，无需硬编码
 */
import type { ToolDefinition, ToolCall, ToolResult } from '../providers/types'

export interface RegisteredTool {
  definition: ToolDefinition
  executor: (toolCall: ToolCall) => Promise<ToolResult>
  category: string
}

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  /** 注册单个工具 */
  register(
    category: string,
    definition: ToolDefinition,
    executor: (toolCall: ToolCall) => Promise<ToolResult>,
  ): void {
    this.tools.set(definition.name, { definition, executor, category })
  }

  /** 批量注册同一类别的工具（共享 executor dispatcher） */
  registerMany(
    category: string,
    definitions: ToolDefinition[],
    executor: (toolCall: ToolCall) => Promise<ToolResult>,
  ): void {
    for (const def of definitions) {
      this.tools.set(def.name, { definition: def, executor, category })
    }
  }

  /** 注销单个工具 */
  unregister(name: string): void {
    this.tools.delete(name)
  }

  /** 注销整个类别 */
  unregisterCategory(category: string): void {
    for (const [name, tool] of this.tools) {
      if (tool.category === category) this.tools.delete(name)
    }
  }

  /** 获取所有工具定义（传给 LLM） */
  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition)
  }

  /** 按类别获取工具定义 */
  getDefinitionsByCategory(category: string): ToolDefinition[] {
    return [...this.tools.values()]
      .filter(t => t.category === category)
      .map(t => t.definition)
  }

  /** 获取所有已注册的类别 */
  getCategories(): string[] {
    return [...new Set([...this.tools.values()].map(t => t.category))]
  }

  /** 检查工具是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** 已注册工具总数 */
  get size(): number {
    return this.tools.size
  }

  /** 执行工具调用 */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name)
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `未知工具: ${toolCall.name}`,
        isError: true,
      }
    }
    try {
      return await tool.executor(toolCall)
    } catch (err) {
      return {
        toolCallId: toolCall.id,
        content: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  /**
   * 生成工具使用说明（注入 system prompt）
   * 按类别分组，列出每个工具的名称和描述
   */
  getToolInstructions(): string {
    if (this.tools.size === 0) return ''

    const categories = this.getCategories()
    const parts: string[] = ['你可以使用以下工具：']

    for (const cat of categories) {
      const tools = [...this.tools.values()].filter(t => t.category === cat)
      parts.push(`\n### ${cat}`)
      for (const t of tools) {
        parts.push(`- **${t.definition.name}**: ${t.definition.description}`)
      }
    }

    parts.push(
      '',
      '使用原则：',
      '- 只在确实需要时调用工具，不要每次都调用',
      '- 当用户提到之前讨论过的内容时，主动搜索记忆',
      '- 当用户说"记住"、"记录"等指令时，保存到记忆',
    )

    return parts.join('\n')
  }
}

export const toolRegistry = new ToolRegistry()
