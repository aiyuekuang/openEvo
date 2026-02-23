// Provider type definitions

export type AuthMode = 'api_key' | 'oauth'

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: ModelInfo[]
  authModes: AuthMode[]
  /** Environment variable name for API key */
  envVar?: string
  /** SDK type to use for API calls */
  sdkType: 'anthropic' | 'openai-compatible'
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface ProviderAuth {
  providerId: string
  mode: AuthMode
  apiKey?: string
  /** OAuth tokens */
  accessToken?: string
  refreshToken?: string
  email?: string
  expiresAt?: number
}

export interface ProviderStatus {
  providerId: string
  configured: boolean
  authMode?: AuthMode
  email?: string
  /** Masked API key for display */
  maskedKey?: string
  defaultModel?: string
}

// --- Tool Use ---

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// --- Chat ---

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export interface ChatOptions {
  model: string
  providerId: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'any' | 'none' | { name: string }
}

export interface StreamEvent {
  type: 'token' | 'done' | 'error' | 'tool_call'
  content?: string
  fullResponse?: string
  error?: string
  toolCalls?: ToolCall[]
}
