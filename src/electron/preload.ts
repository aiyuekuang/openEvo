import { contextBridge, ipcRenderer } from 'electron';

// 技能配置值类型
type SkillConfigValues = Record<string, string | number | boolean>;

contextBridge.exposeInMainWorld('electronAPI', {
  gateway: {
    start: () => ipcRenderer.invoke('gateway:start'),
    stop: () => ipcRenderer.invoke('gateway:stop'),
    status: () => ipcRenderer.invoke('gateway:status'),
    getPort: () => ipcRenderer.invoke('gateway:getPort'),
    getToken: () => ipcRenderer.invoke('gateway:getToken'),
  },
  skill: {
    getStatus: (skillId: string) => ipcRenderer.invoke('skill:getStatus', skillId),
    getAllStatuses: (skillIds?: string[]) => ipcRenderer.invoke('skill:getAllStatuses', skillIds),
    getConfig: (skillId: string) => ipcRenderer.invoke('skill:getConfig', skillId),
    saveConfig: (skillId: string, values: SkillConfigValues) => ipcRenderer.invoke('skill:saveConfig', skillId, values),
    install: (skillId: string) => ipcRenderer.invoke('skill:install', skillId),
    uninstall: (skillId: string) => ipcRenderer.invoke('skill:uninstall', skillId),
    enable: (skillId: string) => ipcRenderer.invoke('skill:enable', skillId),
    disable: (skillId: string) => ipcRenderer.invoke('skill:disable', skillId),
    getConfigFields: (skillId: string) => ipcRenderer.invoke('skill:getConfigFields', skillId),
  },
});

// 技能状态类型
type SkillStatus = 'ready' | 'needs_config' | 'needs_install' | 'installing' | 'configuring' | 'error' | 'disabled' | 'unsupported';

interface SkillStatusInfo {
  status: SkillStatus;
  message?: string;
  missingBins?: string[];
  missingEnv?: string[];
  error?: string;
}

interface SavedSkillConfig {
  skillId: string;
  values: SkillConfigValues;
  configuredAt: string;
}

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      gateway: {
        start: () => Promise<boolean>;
        stop: () => Promise<void>;
        status: () => Promise<'stopped' | 'starting' | 'running' | 'error'>;
        getPort: () => Promise<number>;
        getToken: () => Promise<string | null>;
      };
      skill: {
        getStatus: (skillId: string) => Promise<SkillStatusInfo>;
        getAllStatuses: (skillIds?: string[]) => Promise<Record<string, SkillStatusInfo>>;
        getConfig: (skillId: string) => Promise<SavedSkillConfig | null>;
        saveConfig: (skillId: string, values: SkillConfigValues) => Promise<SavedSkillConfig>;
        install: (skillId: string) => Promise<boolean>;
        uninstall: (skillId: string) => Promise<void>;
        enable: (skillId: string) => Promise<void>;
        disable: (skillId: string) => Promise<void>;
        getConfigFields: (skillId: string) => Promise<Array<{
          key: string;
          label: string;
          type: string;
          required?: boolean;
          placeholder?: string;
        }>>;
      };
    };
  }
}
