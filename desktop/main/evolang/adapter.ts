// ═══════════════════════════════════════════════════════════════
// desktop/main/evolang/adapter.ts — LLMProvider 适配器
//
// 将 desktop 的 LLMClient 包装为 evolang 的 LLMProvider 接口
// ═══════════════════════════════════════════════════════════════

import type {
  LLMProvider, LLMMessage, LLMOptions, LLMEvent,
  ToolDefinition, SkillOutput,
} from 'evolang'
import { llmClient } from '../providers/llm-client'
import type { ChatMessage, ChatOptions, StreamEvent, ToolCall, ToolResult } from '../providers/types'

export class DesktopLLMProvider implements LLMProvider {
  async *chat(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<LLMEvent> {
    const chatMessages = toLLMClientMessages(messages)
    const chatOptions = toLLMClientOptions(options)

    for await (const event of llmClient.chat(chatMessages, chatOptions)) {
      yield mapStreamEvent(event)
    }
  }

  async *chatWithTools(
    messages: LLMMessage[],
    options: LLMOptions & { tools: ToolDefinition[] },
    skillExecutor: (name: string, input: Record<string, unknown>) => Promise<SkillOutput>,
  ): AsyncGenerator<LLMEvent> {
    const chatMessages = toLLMClientMessages(messages)
    const chatOptions: ChatOptions = {
      ...toLLMClientOptions(options),
      tools: options.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }

    // 适配 skillExecutor → toolExecutor
    const toolExecutor = async (toolCall: ToolCall): Promise<ToolResult> => {
      const result = await skillExecutor(toolCall.name, toolCall.arguments)
      return {
        toolCallId: toolCall.id,
        content: typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output),
        isError: result.isError,
      }
    }

    for await (const event of llmClient.chatWithTools(chatMessages, chatOptions, toolExecutor)) {
      yield mapStreamEvent(event)
    }
  }
}

// ─── 类型映射 ───

function toLLMClientMessages(messages: LLMMessage[]): ChatMessage[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content as any,
  }))
}

function toLLMClientOptions(options: LLMOptions): ChatOptions {
  return {
    model: options.model,
    providerId: options.providerId,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  }
}

function mapStreamEvent(event: StreamEvent): LLMEvent {
  return {
    type: event.type as LLMEvent['type'],
    content: event.content,
    fullResponse: event.fullResponse,
    error: event.error,
    toolCalls: event.toolCalls?.map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    })),
  }
}
