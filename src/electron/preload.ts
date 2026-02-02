import { contextBridge, ipcRenderer, shell } from 'electron';

// 技能配置值类型
type SkillConfigValues = Record<string, string | number | boolean>;

// 安装方法类型（与 SKILL.md metadata.openclaw.install 对齐）
type InstallKind = 'uv' | 'pip' | 'brew' | 'apt' | 'yum' | 'dnf' | 'go' | 'npm' | 'npx' | 'cargo' | 'winget' | 'choco' | 'scoop';
type Platform = 'darwin' | 'linux' | 'win32' | 'all';
type InstallMethod = {
  id: string;
  kind: InstallKind;
  package?: string;
  formula?: string;
  module?: string;
  bins?: string[];
  label?: string;
  platform?: Platform; // 适用平台（省略则根据 kind 推断）
};

contextBridge.exposeInMainWorld('electronAPI', {
  // 在默认浏览器中打开链接
  openExternal: (url: string) => shell.openExternal(url),
  
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
    getInstalled: () => ipcRenderer.invoke('skill:getInstalled'),
    isInstalled: (skillId: string) => ipcRenderer.invoke('skill:isInstalled', skillId),
    // 安装依赖（支持 InstallMethod[] 或旧的 string[] bins）
    installDeps: (installMethods: InstallMethod[] | string[]) => ipcRenderer.invoke('skill:installDeps', installMethods),
    // 监听安装日志
    onInstallLog: (callback: (log: { message: string; type: 'info' | 'error' | 'success'; timestamp: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, log: { message: string; type: 'info' | 'error' | 'success'; timestamp: number }) => callback(log);
      ipcRenderer.on('skill:installLog', handler);
      return () => ipcRenderer.removeListener('skill:installLog', handler);
    },
    // 在系统终端中执行认证命令
    runAuthCommand: (command: string) => ipcRenderer.invoke('skill:runAuthCommand', command),
    // 配置驱动检测: 获取详细检测状态
    getChecksStatus: (skillId: string) => ipcRenderer.invoke('skill:getChecksStatus', skillId),
    // 配置驱动检测: 执行 action 脚本
    runAction: (skillId: string, actionId: string) => ipcRenderer.invoke('skill:runAction', skillId, actionId),
  },
});

// 技能状态类型
type SkillStatus = 'not_installed' | 'installing' | 'needs_deps' | 'installing_deps' | 'needs_config' | 'configuring' | 'ready' | 'active' | 'disabled' | 'error' | 'unsupported';

interface SkillStatusInfo {
  status: SkillStatus;
  /** 是否已安装 */
  installed?: boolean;
  /** 是否已启用 */
  enabled?: boolean;
  /** 状态消息 */
  message?: string;
  /** 缺失的 CLI 工具 */
  missingBins?: string[];
  /** 缺失的环境变量 */
  missingEnv?: string[];
  /** 错误信息 */
  error?: string;
  /** 安装方法配置 (从 skill.json 读取) */
  installMethods?: InstallMethod[];
  /** 认证信息 (需要登录时) */
  auth?: {
    /** 提示消息 */
    message: string;
    /** 认证命令 (显示给用户) */
    action: string;
    /** 帮助链接 */
    helpUrl?: string;
    /** 教程信息 (配置驱动检测) */
    tutorial?: SkillTutorial;
  };
  /** 配置驱动检测详情 (新架构) */
  checksInfo?: ChecksStatusInfo;
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
      openExternal: (url: string) => Promise<void>;
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
        getInstalled: () => Promise<string[]>;
        isInstalled: (skillId: string) => Promise<boolean>;
        installDeps: (installMethods: InstallMethod[] | string[]) => Promise<{ success: boolean; error?: string; manualCommands?: string[] }>;
        onInstallLog: (callback: (log: { message: string; type: 'info' | 'error' | 'success'; timestamp: number }) => void) => () => void;
        runAuthCommand: (command: string) => Promise<{ success: boolean; error?: string }>;
        // 配置驱动检测: 获取详细检测状态
        getChecksStatus: (skillId: string) => Promise<ChecksStatusInfo | null>;
        // 配置驱动检测: 执行 action 脚本
        runAction: (skillId: string, actionId: string) => Promise<ActionResult>;
      };
    };
  }
}

// 配置驱动检测类型
interface SkillTutorial {
  title: string;
  steps: string[];
  tips?: string[];
  helpUrl?: string;
}

interface CheckResult {
  passed: boolean;
  message?: string;
  details?: string;
  action?: string;
  tutorial?: SkillTutorial;
  data?: Record<string, unknown>;
}

interface ActionResult {
  success: boolean;
  message?: string;
  command?: string;
  openTerminal?: boolean;
  openUrl?: string;
}

interface ActionItem {
  script: string;
  label: string;
  description?: string;
}

interface ChecksStatusInfo {
  allPassed: boolean;
  results: Array<{
    id: string;
    label: string;
    description?: string;
    passed: boolean;
    skipped?: boolean;
    result?: CheckResult;
  }>;
  availableActions?: Record<string, ActionItem>;
}
