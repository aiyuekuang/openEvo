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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatOptions {
  model: string
  providerId: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export interface StreamEvent {
  type: 'token' | 'done' | 'error'
  content?: string
  fullResponse?: string
  error?: string
}
