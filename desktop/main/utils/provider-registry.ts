/**
 * Provider Registry (Simplified)
 * AI 提供商注册表
 */

// 提供商类型到环境变量的映射
const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
};

/**
 * 获取提供商的环境变量名
 */
export function getProviderEnvVar(providerType: string): string | null {
  return PROVIDER_ENV_VARS[providerType] || null;
}

/**
 * 获取所有可配置 API Key 的提供商类型
 */
export function getKeyableProviderTypes(): string[] {
  return Object.keys(PROVIDER_ENV_VARS);
}

/**
 * 获取提供商配置
 */
export function getProviderConfig(providerType: string) {
  // 简化版：返回基本配置
  return {
    type: providerType,
    name: providerType.charAt(0).toUpperCase() + providerType.slice(1),
    envVar: PROVIDER_ENV_VARS[providerType],
  };
}
