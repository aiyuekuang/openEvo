// Unified LLM client - handles both Anthropic and OpenAI-compatible APIs

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ChatMessage, ChatOptions, StreamEvent, ProviderConfig, ProviderAuth } from './types'
import { getProviderById } from './registry'
import { getProviderAuth, setProviderAuth, getCustomProvider } from './store'
import { exchangeCopilotToken } from './oauth/copilot'

/** Headers required by the Copilot API endpoint */
const COPILOT_HEADERS: Record<string, string> = {
  'Editor-Version': 'vscode/1.96.2',
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'X-Github-Api-Version': '2025-04-01',
}

export class LLMClient {
  /**
   * For Copilot: check if token expired and refresh using the stored GitHub token.
   * Returns the valid Copilot API token.
   */
  private async resolveCopilotToken(auth: ProviderAuth): Promise<string> {
    const now = Date.now()
    // Refresh 2 minutes before actual expiry
    if (auth.accessToken && auth.expiresAt && auth.expiresAt > now + 120_000) {
      return auth.accessToken
    }
    if (!auth.refreshToken) {
      throw new Error('GitHub Copilot 需要重新登录（缺少 GitHub token）')
    }
    const result = await exchangeCopilotToken(auth.refreshToken)
    // Persist the refreshed token
    setProviderAuth({
      ...auth,
      accessToken: result.token,
      expiresAt: result.expiresAt,
    })
    return result.token
  }

  async *chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent> {
    const provider = getProviderById(options.providerId) || getCustomProvider(options.providerId)
    if (!provider) {
      yield { type: 'error', error: `Provider not found: ${options.providerId}` }
      return
    }

    const auth = getProviderAuth(options.providerId)
    if (!auth) {
      yield { type: 'error', error: `Provider not configured: ${options.providerId}` }
      return
    }

    let apiKey: string | undefined
    // Copilot needs token refresh handling
    if (options.providerId === 'github-copilot') {
      try {
        apiKey = await this.resolveCopilotToken(auth)
      } catch (err: any) {
        yield { type: 'error', error: err.message || String(err) }
        return
      }
    } else {
      apiKey = auth.apiKey || auth.accessToken
    }

    if (!apiKey) {
      yield { type: 'error', error: `No API key for provider: ${options.providerId}` }
      return
    }

    if (provider.sdkType === 'anthropic') {
      yield* this.chatAnthropic(messages, options, provider, apiKey, auth.mode)
    } else {
      yield* this.chatOpenAICompat(messages, options, provider, apiKey)
    }
  }

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
    // OAuth providers (e.g. MiniMax) need Bearer token, not x-api-key
    if (authMode === 'oauth') {
      clientOpts.authToken = apiKey
    } else {
      clientOpts.apiKey = apiKey
    }
    const client = new Anthropic(clientOpts)

    let fullResponse = ''
    try {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system: messages.find((m) => m.role === 'system')?.content,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = (event as any).delta
          if (delta?.type === 'text_delta' && delta.text) {
            fullResponse += delta.text
            yield { type: 'token', content: delta.text, fullResponse }
          }
        }
      }

      yield { type: 'done', fullResponse }
    } catch (err: any) {
      yield { type: 'error', error: err.message || String(err), fullResponse }
    }
  }

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

    let fullResponse = ''
    try {
      const stream = await client.chat.completions.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          fullResponse += delta
          yield { type: 'token', content: delta, fullResponse }
        }
      }

      yield { type: 'done', fullResponse }
    } catch (err: any) {
      yield { type: 'error', error: err.message || String(err), fullResponse }
    }
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

    // If no key provided, fall back to stored auth
    let key = apiKey
    if (!key) {
      const auth = getProviderAuth(providerId)
      key = auth?.apiKey || auth?.accessToken || ''
    }
    if (!key) return { ok: false, error: 'No API key available' }

    const testModel = model || provider.models[0]?.id
    if (!testModel) return { ok: false, error: 'No model available' }

    // Determine auth mode
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
