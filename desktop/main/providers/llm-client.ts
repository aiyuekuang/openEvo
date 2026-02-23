// Unified LLM client - handles both Anthropic and OpenAI-compatible APIs
// Supports text streaming + Tool Use (function calling)

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type {
  ChatMessage, ChatOptions, StreamEvent,
  ProviderConfig, ProviderAuth,
  ToolDefinition, ToolCall, ToolResult, ContentBlock,
} from './types'
import { getProviderById } from './registry'
import { getProviderAuth, setProviderAuth, getCustomProvider } from './store'
import { exchangeCopilotToken } from './oauth/copilot'

/** Headers required by the Copilot API endpoint */
const COPILOT_HEADERS: Record<string, string> = {
  'Editor-Version': 'vscode/1.96.2',
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'X-Github-Api-Version': '2025-04-01',
}

const MAX_TOOL_ROUNDS = 10

/** Extract string content from ChatMessage (handles string | ContentBlock[]) */
function getTextContent(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content
  return msg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export class LLMClient {
  /**
   * For Copilot: check if token expired and refresh using the stored GitHub token.
   */
  private async resolveCopilotToken(auth: ProviderAuth): Promise<string> {
    const now = Date.now()
    if (auth.accessToken && auth.expiresAt && auth.expiresAt > now + 120_000) {
      return auth.accessToken
    }
    if (!auth.refreshToken) {
      throw new Error('GitHub Copilot 需要重新登录（缺少 GitHub token）')
    }
    const result = await exchangeCopilotToken(auth.refreshToken)
    setProviderAuth({
      ...auth,
      accessToken: result.token,
      expiresAt: result.expiresAt,
    })
    return result.token
  }

  /** Resolve provider, auth and API key */
  private async resolveProvider(options: ChatOptions): Promise<{
    provider: ProviderConfig; apiKey: string; authMode: 'api_key' | 'oauth'
  } | { error: string }> {
    const provider = getProviderById(options.providerId) || getCustomProvider(options.providerId)
    if (!provider) return { error: `Provider not found: ${options.providerId}` }

    const auth = getProviderAuth(options.providerId)
    if (!auth) return { error: `Provider not configured: ${options.providerId}` }

    let apiKey: string | undefined
    if (options.providerId === 'github-copilot') {
      try {
        apiKey = await this.resolveCopilotToken(auth)
      } catch (err: any) {
        return { error: err.message || String(err) }
      }
    } else {
      apiKey = auth.apiKey || auth.accessToken
    }

    if (!apiKey) return { error: `No API key for provider: ${options.providerId}` }
    return { provider, apiKey, authMode: auth.mode }
  }

  /**
   * Basic chat - single LLM call with streaming.
   * If tools are provided and the model returns tool_calls, a 'tool_call' event is yielded
   * but the caller is responsible for executing tools and continuing.
   */
  async *chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent> {
    const resolved = await this.resolveProvider(options)
    if ('error' in resolved) {
      yield { type: 'error', error: resolved.error }
      return
    }

    const { provider, apiKey, authMode } = resolved
    if (provider.sdkType === 'anthropic') {
      yield* this.chatAnthropic(messages, options, provider, apiKey, authMode)
    } else {
      yield* this.chatOpenAICompat(messages, options, provider, apiKey)
    }
  }

  /**
   * Chat with automatic tool call loop.
   * Calls LLM, if it returns tool_calls, executes them via toolExecutor,
   * injects results, and calls LLM again. Repeats until LLM responds with text only.
   */
  async *chatWithTools(
    messages: ChatMessage[],
    options: ChatOptions,
    toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>
  ): AsyncGenerator<StreamEvent> {
    if (!options.tools || options.tools.length === 0) {
      yield* this.chat(messages, options)
      return
    }

    let currentMessages = [...messages]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let fullResponse = ''
      let toolCalls: ToolCall[] = []
      let hasError = false

      for await (const event of this.chat(currentMessages, options)) {
        if (event.type === 'token') {
          fullResponse = event.fullResponse || ''
          yield event
        } else if (event.type === 'tool_call' && event.toolCalls) {
          toolCalls = event.toolCalls
          yield event
        } else if (event.type === 'error') {
          yield event
          hasError = true
          break
        } else if (event.type === 'done') {
          fullResponse = event.fullResponse || fullResponse
          // Don't yield 'done' yet if we have tool calls to process
          if (toolCalls.length === 0) {
            yield event
          }
        }
      }

      if (hasError || toolCalls.length === 0) break

      // Execute tool calls and build result messages
      const resolved = await this.resolveProvider(options)
      if ('error' in resolved) break
      const isAnthropic = resolved.provider.sdkType === 'anthropic'

      if (isAnthropic) {
        // Anthropic format: assistant message with tool_use blocks, then user message with tool_result blocks
        const assistantBlocks: ContentBlock[] = []
        if (fullResponse) {
          assistantBlocks.push({ type: 'text', text: fullResponse })
        }
        for (const tc of toolCalls) {
          assistantBlocks.push({
            type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments,
          })
        }
        currentMessages.push({ role: 'assistant', content: assistantBlocks })

        const resultBlocks: ContentBlock[] = []
        for (const tc of toolCalls) {
          const result = await toolExecutor(tc)
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: result.content,
            is_error: result.isError,
          })
        }
        currentMessages.push({ role: 'user', content: resultBlocks })
      } else {
        // OpenAI format: assistant message with tool_calls, then tool messages
        currentMessages.push({
          role: 'assistant',
          content: fullResponse || '',
          // Store tool_calls in content for OpenAI reconstruction
        } as any)

        for (const tc of toolCalls) {
          const result = await toolExecutor(tc)
          // OpenAI uses role: 'tool' but our ChatMessage doesn't have it,
          // so we store it as ContentBlock array that chatOpenAICompat will handle
          currentMessages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: tc.id, content: result.content, is_error: result.isError }],
          })
        }
      }
    }
  }

  // --- Anthropic ---

  private async *chatAnthropic(
    messages: ChatMessage[],
    options: ChatOptions,
    provider: ProviderConfig,
    apiKey: string,
    authMode: 'api_key' | 'oauth'
  ): AsyncGenerator<StreamEvent> {
    const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {
      baseURL: provider.baseUrl || undefined,
    }
    if (authMode === 'oauth') {
      clientOpts.authToken = apiKey
    } else {
      clientOpts.apiKey = apiKey
    }
    const client = new Anthropic(clientOpts)

    // Extract system message
    const systemMsg = messages.find((m) => m.role === 'system')
    const systemText = systemMsg ? getTextContent(systemMsg) : undefined

    // Convert messages to Anthropic format
    const anthropicMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => this.toAnthropicMessage(m))

    // Convert tools to Anthropic format
    const tools = options.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }))

    let fullResponse = ''
    const toolCalls: ToolCall[] = []

    try {
      const requestParams: any = {
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system: systemText,
        messages: anthropicMessages,
      }
      if (tools && tools.length > 0) {
        requestParams.tools = tools
        if (options.toolChoice) {
          if (typeof options.toolChoice === 'string') {
            requestParams.tool_choice = { type: options.toolChoice }
          } else {
            requestParams.tool_choice = { type: 'tool', name: options.toolChoice.name }
          }
        }
      }

      const stream = client.messages.stream(requestParams)

      // Track current tool_use block being built
      let currentToolId = ''
      let currentToolName = ''
      let currentToolInput = ''

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = (event as any).content_block
          if (block?.type === 'tool_use') {
            currentToolId = block.id
            currentToolName = block.name
            currentToolInput = ''
          }
        } else if (event.type === 'content_block_delta') {
          const delta = (event as any).delta
          if (delta?.type === 'text_delta' && delta.text) {
            fullResponse += delta.text
            yield { type: 'token', content: delta.text, fullResponse }
          } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
            currentToolInput += delta.partial_json
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId) {
            let args: Record<string, unknown> = {}
            try { args = JSON.parse(currentToolInput || '{}') } catch {}
            toolCalls.push({ id: currentToolId, name: currentToolName, arguments: args })
            currentToolId = ''
            currentToolName = ''
            currentToolInput = ''
          }
        }
      }

      if (toolCalls.length > 0) {
        yield { type: 'tool_call', toolCalls, fullResponse }
      }
      yield { type: 'done', fullResponse }
    } catch (err: any) {
      yield { type: 'error', error: err.message || String(err), fullResponse }
    }
  }

  private toAnthropicMessage(msg: ChatMessage): any {
    if (typeof msg.content === 'string') {
      return { role: msg.role as 'user' | 'assistant', content: msg.content }
    }
    // ContentBlock[] — convert to Anthropic's content array format
    const blocks = msg.content.map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text }
      if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
      if (block.type === 'tool_result') return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content, is_error: block.is_error }
      return block
    })
    return { role: msg.role as 'user' | 'assistant', content: blocks }
  }

  // --- OpenAI-compatible ---

  private async *chatOpenAICompat(
    messages: ChatMessage[],
    options: ChatOptions,
    provider: ProviderConfig,
    apiKey: string
  ): AsyncGenerator<StreamEvent> {
    const clientOpts: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey,
      baseURL: provider.baseUrl,
    }
    if (options.providerId === 'github-copilot') {
      clientOpts.defaultHeaders = COPILOT_HEADERS
    }
    const client = new OpenAI(clientOpts)

    // Convert tools to OpenAI format
    const tools = options.tools?.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))

    // Convert messages to OpenAI format
    const openaiMessages = this.toOpenAIMessages(messages)

    let fullResponse = ''
    const toolCalls: ToolCall[] = []
    // Accumulate streaming tool calls (OpenAI sends them incrementally)
    const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>()

    try {
      const requestParams: Record<string, any> = {
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        messages: openaiMessages,
      }
      if (tools && tools.length > 0) {
        requestParams.tools = tools
        if (options.toolChoice) {
          if (typeof options.toolChoice === 'string') {
            requestParams.tool_choice = options.toolChoice
          } else {
            requestParams.tool_choice = { type: 'function', function: { name: options.toolChoice.name } }
          }
        }
      }

      const stream = await (client.chat.completions.create as any)({ ...requestParams, stream: true })

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue

        // Text content
        const deltaContent = choice.delta?.content
        if (deltaContent) {
          fullResponse += deltaContent
          yield { type: 'token', content: deltaContent, fullResponse }
        }

        // Tool calls (streamed incrementally)
        const deltaToolCalls = choice.delta?.tool_calls
        if (deltaToolCalls) {
          for (const dtc of deltaToolCalls) {
            const idx = dtc.index
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, {
                id: dtc.id || '',
                name: dtc.function?.name || '',
                arguments: '',
              })
            }
            const pending = pendingToolCalls.get(idx)!
            if (dtc.id) pending.id = dtc.id
            if (dtc.function?.name) pending.name = dtc.function.name
            if (dtc.function?.arguments) pending.arguments += dtc.function.arguments
          }
        }
      }

      // Finalize tool calls
      for (const [, pending] of pendingToolCalls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(pending.arguments || '{}') } catch {}
        toolCalls.push({ id: pending.id, name: pending.name, arguments: args })
      }

      if (toolCalls.length > 0) {
        yield { type: 'tool_call', toolCalls, fullResponse }
      }
      yield { type: 'done', fullResponse }
    } catch (err: any) {
      yield { type: 'error', error: err.message || String(err), fullResponse }
    }
  }

  private toOpenAIMessages(messages: ChatMessage[]): any[] {
    const result: any[] = []

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content })
        continue
      }

      // ContentBlock[] — need to convert
      const blocks = msg.content

      // Check if this is a tool_result message
      const toolResults = blocks.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result')
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
        }
        continue
      }

      // Check if this has tool_use blocks (assistant message)
      const toolUses = blocks.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
      const textBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      if (toolUses.length > 0) {
        result.push({
          role: 'assistant',
          content: textBlocks.map(b => b.text).join('') || null,
          tool_calls: toolUses.map(tu => ({
            id: tu.id,
            type: 'function',
            function: { name: tu.name, arguments: JSON.stringify(tu.input) },
          })),
        })
        continue
      }

      // Plain text blocks
      result.push({ role: msg.role, content: textBlocks.map(b => b.text).join('') })
    }

    return result
  }

  /** Test connection to a provider */
  async testConnection(
    providerId: string,
    apiKey: string,
    baseUrl?: string,
    model?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const provider = getProviderById(providerId) || getCustomProvider(providerId)
    if (!provider) return { ok: false, error: 'Provider not found' }

    let key = apiKey
    if (!key) {
      const auth = getProviderAuth(providerId)
      key = auth?.apiKey || auth?.accessToken || ''
    }
    if (!key) return { ok: false, error: 'No API key available' }

    const testModel = model || provider.models[0]?.id
    if (!testModel) return { ok: false, error: 'No model available' }

    const storedAuth = getProviderAuth(providerId)
    const authMode = storedAuth?.mode || 'api_key'

    try {
      if (provider.sdkType === 'anthropic') {
        const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {
          baseURL: provider.baseUrl || undefined,
        }
        if (authMode === 'oauth') {
          clientOpts.authToken = key
        } else {
          clientOpts.apiKey = key
        }
        const client = new Anthropic(clientOpts)
        await client.messages.create({
          model: testModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        })
      } else {
        const clientOpts: ConstructorParameters<typeof OpenAI>[0] = {
          apiKey: key,
          baseURL: baseUrl || provider.baseUrl,
        }
        if (providerId === 'github-copilot') {
          clientOpts.defaultHeaders = COPILOT_HEADERS
        }
        const client = new OpenAI(clientOpts)
        await client.chat.completions.create({
          model: testModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        })
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) }
    }
  }
}

export const llmClient = new LLMClient()
