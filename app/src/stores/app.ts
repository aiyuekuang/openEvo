import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModelProvider = 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'zhipu' | 'github' | 'github-copilot';
export type ChannelType = 'dingtalk' | 'feishu' | 'wecom' | 'dingtalk-connector';

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  config: Record<string, string>;
}

export interface AppState {
  // 配置状态
  isConfigured: boolean;
  isLoading: boolean;
  modelConfig: ModelConfig | null;
  channelConfig: ChannelConfig | null;
  
  // 运行状态
  gatewayStatus: 'stopped' | 'starting' | 'running' | 'error';
  gatewayPort: number;
  gatewayToken: string | null;
  
  // Actions
  setModelConfig: (config: ModelConfig) => void;
  setChannelConfig: (config: ChannelConfig) => void;
  completeSetup: () => void;
  resetSetup: () => void;
  setGatewayStatus: (status: AppState['gatewayStatus']) => void;
  setGatewayPort: (port: number) => void;
  setGatewayToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  loadFromConfig: (config: OpenClawConfig) => void;
}

// OpenClaw 配置文件类型
export interface OpenClawConfig {
  providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
  channels?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
  gateway?: { auth?: { token?: string } };
  auth?: { profiles?: Record<string, { provider?: string; mode?: string }> };
  agents?: { defaults?: { model?: { primary?: string } } };
  [key: string]: unknown;
}

// 从配置文件解析模型配置
function parseModelConfig(config: OpenClawConfig): ModelConfig | null {
  // 方式 1: 从 providers 获取 (OpenAI/Anthropic/DeepSeek 等)
  const providers = config.providers || {};
  const providerKeys: ModelProvider[] = ['openai', 'anthropic', 'deepseek', 'qwen', 'zhipu', 'github'];
  for (const key of providerKeys) {
    const provider = providers[key];
    if (provider?.apiKey) {
      return {
        provider: key,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      };
    }
  }
  
  // 方式 2: 从 auth.profiles 获取 (github-copilot 等)
  const authProfiles = config.auth?.profiles || {};
  const primaryModel = config.agents?.defaults?.model?.primary;
  
  for (const [key, profile] of Object.entries(authProfiles)) {
    if (profile.provider) {
      // 检查是否是 github-copilot
      if (profile.provider === 'github-copilot' || key.startsWith('github-copilot')) {
        return {
          provider: 'github-copilot',
          apiKey: '', // github-copilot 使用 token 认证，不需要 apiKey
          model: primaryModel,
        };
      }
    }
  }
  
  // 方式 3: 如果有配置了主模型，认为已配置
  if (primaryModel) {
    const providerFromModel = primaryModel.split('/')[0] as ModelProvider;
    return {
      provider: providerFromModel,
      apiKey: '',
      model: primaryModel,
    };
  }
  
  return null;
}

// 从配置文件解析渠道配置
function parseChannelConfig(config: OpenClawConfig): ChannelConfig | null {
  const channels = config.channels || {};
  console.log('[parseChannelConfig] channels:', channels);
  
  // 检查常见的渠道
  const channelKeys: ChannelType[] = ['dingtalk-connector', 'dingtalk', 'feishu', 'wecom'];
  for (const key of channelKeys) {
    const channel = channels[key];
    console.log(`[parseChannelConfig] checking ${key}:`, channel);
    if (channel?.enabled) {
      const { enabled, ...rest } = channel;
      return {
        type: key,
        enabled: true,
        config: rest as Record<string, string>,
      };
    }
  }
  return null;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isConfigured: false,
      isLoading: true,
      modelConfig: null,
      channelConfig: null,
      gatewayStatus: 'stopped',
      gatewayPort: 18789,
      gatewayToken: null,

      setModelConfig: (config) => set({ modelConfig: config }),
      
      setChannelConfig: (config) => set({ channelConfig: config }),
      
      completeSetup: () => set({ isConfigured: true }),
      
      resetSetup: () => set({ 
        isConfigured: false, 
        modelConfig: null, 
        channelConfig: null 
      }),
      
      setGatewayStatus: (status) => set({ gatewayStatus: status }),
      
      setGatewayPort: (port) => set({ gatewayPort: port }),
      
      setGatewayToken: (token) => set({ gatewayToken: token }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      loadFromConfig: (rawConfig) => {
        // config.get 返回的结构是 { path, exists, raw, parsed, valid }
        // 实际配置在 parsed 字段中
        const config = (rawConfig as { parsed?: OpenClawConfig }).parsed || rawConfig as OpenClawConfig;
        
        console.log('[loadFromConfig] actual config:', config);
        const modelConfig = parseModelConfig(config);
        const channelConfig = parseChannelConfig(config);
        const gatewayToken = config.gateway?.auth?.token || null;
        
        console.log('[loadFromConfig] parsed modelConfig:', modelConfig);
        console.log('[loadFromConfig] parsed channelConfig:', channelConfig);
        
        // 如果有模型和渠道配置，则认为已配置
        const isConfigured = !!(modelConfig && channelConfig);
        console.log('[loadFromConfig] isConfigured:', isConfigured);
        
        set({
          isConfigured,
          isLoading: false,
          modelConfig,
          channelConfig,
          gatewayToken,
        });
      },
    }),
    {
      name: 'openclaw-cn-storage',
      partialize: (state) => ({
        isConfigured: state.isConfigured,
        modelConfig: state.modelConfig,
        channelConfig: state.channelConfig,
        gatewayToken: state.gatewayToken,
      }),
    }
  )
);
