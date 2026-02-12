/**
 * Secure Storage (Simplified)
 * API Key 和提供商配置存储
 */

// 简化版：暂时使用内存存储，后续可以集成 keytar
const apiKeys = new Map<string, string>();
const providers = new Map<string, any>();
let defaultProvider: string | null = null;

export async function storeApiKey(key: string, value: string): Promise<void> {
  apiKeys.set(key, value);
}

export async function getApiKey(key: string): Promise<string | null> {
  return apiKeys.get(key) || null;
}

export async function deleteApiKey(key: string): Promise<void> {
  apiKeys.delete(key);
}

export async function hasApiKey(key: string): Promise<boolean> {
  return apiKeys.has(key);
}

export async function saveProvider(id: string, config: any): Promise<void> {
  providers.set(id, config);
}

export async function getProvider(id: string): Promise<any | null> {
  return providers.get(id) || null;
}

export async function deleteProvider(id: string): Promise<void> {
  providers.delete(id);
}

export async function setDefaultProvider(id: string): Promise<void> {
  defaultProvider = id;
}

export async function getDefaultProvider(): Promise<string | null> {
  return defaultProvider;
}

export async function getAllProvidersWithKeyInfo(): Promise<any[]> {
  return Array.from(providers.entries()).map(([id, config]) => ({
    id,
    ...config,
    hasKey: apiKeys.has(id),
  }));
}

export interface ProviderConfig {
  id: string;
  type: string;
  name: string;
  [key: string]: unknown;
}
