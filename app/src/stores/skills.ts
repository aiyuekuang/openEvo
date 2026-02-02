import { create } from 'zustand';
import type { 
  SkillStatus, 
  SkillStatusInfo, 
  SkillConfigValues,
  SkillConfigField,
  SkillAction,
} from '../../../src/skill-marketplace/skill-metadata';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 技能状态详情（前端使用）
 */
export interface SkillStateInfo extends SkillStatusInfo {
  /** 是否正在处理中 */
  processing?: boolean;
  /** 处理中的操作 */
  processingAction?: SkillAction;
}

/**
 * 状态显示配置
 */
export interface StatusDisplay {
  label: string;
  color: string;
  icon: string;
  actionLabel?: string;
}

/**
 * 技能 Store 状态
 */
export interface SkillsState {
  /** 已安装的技能 ID */
  installedSkills: Set<string>;
  
  /** 技能状态映射 */
  skillStatuses: Record<string, SkillStateInfo>;
  
  /** 是否正在加载 */
  loading: boolean;
  
  /** 当前正在处理的技能 ID */
  processingSkills: Set<string>;
  
  /** 配置弹窗状态 */
  configModal: {
    open: boolean;
    skillId: string | null;
    fields: SkillConfigField[];
    saving: boolean;
  };
  
  /** 依赖安装弹窗状态 */
  depsModal: {
    open: boolean;
    skillId: string | null;
    missingDeps: string[];
    installing: boolean;
  };

  // === Actions ===
  
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  
  /** 设置已安装技能 */
  setInstalledSkills: (skills: string[]) => void;
  
  /** 添加已安装技能 */
  addInstalledSkill: (skillId: string) => void;
  
  /** 移除已安装技能 */
  removeInstalledSkill: (skillId: string) => void;
  
  /** 设置技能状态 */
  setSkillStatuses: (statuses: Record<string, SkillStatusInfo>) => void;
  
  /** 更新单个技能状态 */
  updateSkillStatus: (skillId: string, status: SkillStateInfo) => void;
  
  /** 设置技能处理中状态 */
  setSkillProcessing: (skillId: string, processing: boolean, action?: SkillAction) => void;
  
  /** 打开配置弹窗 */
  openConfigModal: (skillId: string, fields: SkillConfigField[]) => void;
  
  /** 关闭配置弹窗 */
  closeConfigModal: () => void;
  
  /** 设置配置保存中状态 */
  setConfigSaving: (saving: boolean) => void;
  
  /** 打开依赖安装弹窗 */
  openDepsModal: (skillId: string, missingDeps: string[]) => void;
  
  /** 关闭依赖安装弹窗 */
  closeDepsModal: () => void;
  
  /** 设置依赖安装中状态 */
  setDepsInstalling: (installing: boolean) => void;
  
  /** 检查技能是否已安装 */
  isInstalled: (skillId: string) => boolean;
  
  /** 获取技能状态 */
  getStatus: (skillId: string) => SkillStatus;
  
  /** 获取技能状态详情 */
  getStatusInfo: (skillId: string) => SkillStateInfo | undefined;
}

// =============================================================================
// 状态显示配置
// =============================================================================

export const STATUS_DISPLAY: Record<SkillStatus, StatusDisplay> = {
  not_installed: {
    label: '未安装',
    color: 'default',
    icon: '➕',
    actionLabel: '安装',
  },
  installing: {
    label: '安装中',
    color: 'processing',
    icon: '⏳',
  },
  needs_deps: {
    label: '需安装依赖',
    color: 'warning',
    icon: '📦',
    actionLabel: '安装依赖',
  },
  installing_deps: {
    label: '安装依赖中',
    color: 'processing',
    icon: '⏳',
  },
  needs_auth: {
    label: '需登录',
    color: 'warning',
    icon: '🔑',
    actionLabel: '登录',
  },
  needs_config: {
    label: '需配置',
    color: 'warning',
    icon: '⚙️',
    actionLabel: '配置',
  },
  configuring: {
    label: '配置中',
    color: 'processing',
    icon: '⚙️',
  },
  ready: {
    label: '已就绪',
    color: 'success',
    icon: '✅',
    actionLabel: '启用',
  },
  active: {
    label: '运行中',
    color: 'success',
    icon: '🟢',
    actionLabel: '禁用',
  },
  disabled: {
    label: '已禁用',
    color: 'default',
    icon: '⏸️',
    actionLabel: '启用',
  },
  error: {
    label: '错误',
    color: 'error',
    icon: '❌',
    actionLabel: '重试',
  },
  unsupported: {
    label: '不支持',
    color: 'default',
    icon: '🚫',
  },
};

/**
 * 获取状态显示配置
 */
export function getStatusDisplay(status: SkillStatus): StatusDisplay {
  return STATUS_DISPLAY[status] || STATUS_DISPLAY.error;
}

/**
 * 根据状态获取可用操作
 */
export function getAvailableActions(status: SkillStatus, installed: boolean): SkillAction[] {
  if (!installed) {
    return ['install'];
  }
  
  switch (status) {
    case 'not_installed':
      return ['install'];
    case 'installing':
    case 'installing_deps':
    case 'configuring':
      return [];
    case 'needs_deps':
      return ['install_deps', 'verify', 'uninstall'];
    case 'needs_auth':
      return ['verify', 'uninstall'];
    case 'needs_config':
      return ['configure', 'uninstall'];
    case 'ready':
      return ['enable', 'configure', 'uninstall'];
    case 'active':
      return ['disable', 'configure'];
    case 'disabled':
      return ['enable', 'uninstall'];
    case 'error':
      return ['retry', 'view_error', 'uninstall'];
    case 'unsupported':
      return [];
    default:
      return [];
  }
}

// =============================================================================
// Store 实现
// =============================================================================

export const useSkillsStore = create<SkillsState>((set, get) => ({
  installedSkills: new Set(),
  skillStatuses: {},
  loading: false,
  processingSkills: new Set(),
  configModal: {
    open: false,
    skillId: null,
    fields: [],
    saving: false,
  },
  depsModal: {
    open: false,
    skillId: null,
    missingDeps: [],
    installing: false,
  },

  setLoading: (loading) => set({ loading }),

  setInstalledSkills: (skills) => set({ installedSkills: new Set(skills) }),

  addInstalledSkill: (skillId) =>
    set((state) => ({
      installedSkills: new Set([...state.installedSkills, skillId]),
    })),

  removeInstalledSkill: (skillId) =>
    set((state) => {
      const next = new Set(state.installedSkills);
      next.delete(skillId);
      return { installedSkills: next };
    }),

  setSkillStatuses: (statuses) => set({ skillStatuses: statuses }),

  updateSkillStatus: (skillId, status) =>
    set((state) => ({
      skillStatuses: {
        ...state.skillStatuses,
        [skillId]: status,
      },
    })),

  setSkillProcessing: (skillId, processing, action) =>
    set((state) => {
      const next = new Set(state.processingSkills);
      if (processing) {
        next.add(skillId);
      } else {
        next.delete(skillId);
      }
      
      // 同时更新状态中的 processing 字段
      const currentStatus = state.skillStatuses[skillId] || { status: 'not_installed' as SkillStatus, installed: false, enabled: false };
      
      return {
        processingSkills: next,
        skillStatuses: {
          ...state.skillStatuses,
          [skillId]: {
            ...currentStatus,
            processing,
            processingAction: processing ? action : undefined,
          },
        },
      };
    }),

  openConfigModal: (skillId, fields) =>
    set({
      configModal: {
        open: true,
        skillId,
        fields,
        saving: false,
      },
    }),

  closeConfigModal: () =>
    set({
      configModal: {
        open: false,
        skillId: null,
        fields: [],
        saving: false,
      },
    }),

  setConfigSaving: (saving) =>
    set((state) => ({
      configModal: {
        ...state.configModal,
        saving,
      },
    })),

  openDepsModal: (skillId, missingDeps) =>
    set({
      depsModal: {
        open: true,
        skillId,
        missingDeps,
        installing: false,
      },
    }),

  closeDepsModal: () =>
    set({
      depsModal: {
        open: false,
        skillId: null,
        missingDeps: [],
        installing: false,
      },
    }),

  setDepsInstalling: (installing) =>
    set((state) => ({
      depsModal: {
        ...state.depsModal,
        installing,
      },
    })),

  isInstalled: (skillId) => get().installedSkills.has(skillId),

  getStatus: (skillId) => {
    const info = get().skillStatuses[skillId];
    return info?.status || 'not_installed';
  },

  getStatusInfo: (skillId) => get().skillStatuses[skillId],
}));
