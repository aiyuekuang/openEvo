/**
 * 技能服务
 *
 * 提供统一的技能状态管理和操作接口
 *
 * @module skill-marketplace/skill-service
 */

import type {
  SkillStatus,
  SkillStatusInfo,
  SkillOpenClawMetadata,
  SkillConfigValues,
  SkillAction,
  SkillConfigField,
} from "./skill-metadata.js";
import {
  computeSkillStatus,
  detectMissingConfig,
  getStatusDisplay,
  STATUS_DISPLAY,
} from "./skill-status.js";
import {
  markSkillInstalled,
  markSkillUninstalled,
  setSkillEnabled,
  saveSkillConfig,
  getSkillConfig,
  isSkillInstalled,
  isSkillEnabled,
  getInstalledSkillIds,
  getEnabledSkillIds,
  injectConfigToEnv,
} from "./config-manager.js";
import { checkDependencies, checkBinExists } from "./dependency-checker.js";
import { generateConfigFields } from "./skill-parser.js";

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 技能服务操作结果
 */
export type SkillServiceResult<T = void> = {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: string;
  };
};

/**
 * 技能完整信息
 */
export type SkillFullInfo = {
  /** 技能 ID */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 图标 emoji */
  emoji?: string;
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: SkillOpenClawMetadata;
  /** 状态信息 */
  statusInfo: SkillStatusInfo;
  /** 可用的操作 */
  availableActions: SkillAction[];
};

/**
 * 技能操作上下文
 */
export type SkillActionContext = {
  skillId: string;
  metadata?: SkillOpenClawMetadata;
  /** 操作进度回调 */
  onProgress?: (message: string, percent?: number) => void;
};

// =============================================================================
// 状态查询服务
// =============================================================================

/**
 * 获取技能完整信息
 */
export function getSkillFullInfo(
  skillId: string,
  name: string,
  description: string,
  metadata?: SkillOpenClawMetadata,
  tags?: string[]
): SkillFullInfo {
  const statusInfo = computeSkillStatus(skillId, metadata);
  const availableActions = getAvailableActions(statusInfo.status);

  return {
    id: skillId,
    name,
    description,
    emoji: metadata?.emoji,
    tags,
    metadata,
    statusInfo,
    availableActions,
  };
}

/**
 * 根据状态获取可用操作
 */
export function getAvailableActions(status: SkillStatus): SkillAction[] {
  switch (status) {
    case "not_installed":
      return ["install"];
    case "installing":
      return [];
    case "needs_deps":
      return ["install_deps", "verify", "uninstall"];
    case "installing_deps":
      return [];
    case "needs_config":
      return ["configure", "uninstall"];
    case "configuring":
      return [];
    case "ready":
      return ["enable", "configure", "uninstall"];
    case "active":
      return ["disable", "configure"];
    case "disabled":
      return ["enable", "uninstall"];
    case "error":
      return ["retry", "view_error", "uninstall"];
    case "unsupported":
      return [];
    default:
      return [];
  }
}

/**
 * 检查操作是否可用
 */
export function isActionAvailable(status: SkillStatus, action: SkillAction): boolean {
  const available = getAvailableActions(status);
  return available.includes(action);
}

// =============================================================================
// 安装/卸载服务
// =============================================================================

/**
 * 安装技能（标记为已安装）
 */
export async function installSkill(
  ctx: SkillActionContext
): Promise<SkillServiceResult<SkillStatusInfo>> {
  const { skillId, metadata, onProgress } = ctx;

  try {
    onProgress?.("正在安装技能...", 0);

    // 标记为已安装
    markSkillInstalled(skillId);
    onProgress?.("技能已安装", 50);

    // 重新计算状态
    const statusInfo = computeSkillStatus(skillId, metadata);
    onProgress?.("安装完成", 100);

    return {
      success: true,
      message: "技能安装成功",
      data: statusInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: "安装失败",
      error: {
        code: "INSTALL_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * 卸载技能
 */
export async function uninstallSkill(
  ctx: SkillActionContext
): Promise<SkillServiceResult> {
  const { skillId, onProgress } = ctx;

  try {
    onProgress?.("正在卸载技能...", 0);

    // 标记为已卸载（同时删除配置）
    markSkillUninstalled(skillId);
    onProgress?.("卸载完成", 100);

    return {
      success: true,
      message: "技能已卸载",
    };
  } catch (error) {
    return {
      success: false,
      message: "卸载失败",
      error: {
        code: "UNINSTALL_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// =============================================================================
// 启用/禁用服务
// =============================================================================

/**
 * 启用技能
 */
export async function enableSkill(
  ctx: SkillActionContext
): Promise<SkillServiceResult<SkillStatusInfo>> {
  const { skillId, metadata, onProgress } = ctx;

  try {
    // 检查是否已安装
    if (!isSkillInstalled(skillId)) {
      return {
        success: false,
        message: "技能未安装",
        error: {
          code: "NOT_INSTALLED",
        },
      };
    }

    onProgress?.("正在启用技能...", 0);

    // 检查依赖
    const depResult = checkDependencies(metadata?.requires, metadata);
    if (depResult.missingBins.length > 0) {
      return {
        success: false,
        message: `缺少依赖: ${depResult.missingBins.join(", ")}`,
        error: {
          code: "MISSING_DEPS",
          details: depResult.missingBins.join(", "),
        },
      };
    }

    // 检查配置
    const { missing } = detectMissingConfig(skillId, metadata);
    if (missing.length > 0) {
      return {
        success: false,
        message: `缺少配置: ${missing.join(", ")}`,
        error: {
          code: "MISSING_CONFIG",
          details: missing.join(", "),
        },
      };
    }

    // 启用技能
    setSkillEnabled(skillId, true);
    onProgress?.("技能已启用", 50);

    // 注入配置到环境变量
    injectConfigToEnv(skillId);
    onProgress?.("启用完成", 100);

    const statusInfo = computeSkillStatus(skillId, metadata);

    return {
      success: true,
      message: "技能已启用",
      data: statusInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: "启用失败",
      error: {
        code: "ENABLE_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * 禁用技能
 */
export async function disableSkill(
  ctx: SkillActionContext
): Promise<SkillServiceResult<SkillStatusInfo>> {
  const { skillId, metadata, onProgress } = ctx;

  try {
    onProgress?.("正在禁用技能...", 0);

    setSkillEnabled(skillId, false);
    onProgress?.("禁用完成", 100);

    const statusInfo = computeSkillStatus(skillId, metadata);

    return {
      success: true,
      message: "技能已禁用",
      data: statusInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: "禁用失败",
      error: {
        code: "DISABLE_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// =============================================================================
// 配置服务
// =============================================================================

/**
 * 获取技能配置字段定义
 */
export function getSkillConfigFields(
  metadata?: SkillOpenClawMetadata
): SkillConfigField[] {
  if (!metadata) {
    return [];
  }
  return generateConfigFields(metadata);
}

/**
 * 获取技能当前配置
 */
export function getSkillCurrentConfig(
  skillId: string
): SkillConfigValues | null {
  const config = getSkillConfig(skillId);
  return config?.values ?? null;
}

/**
 * 保存技能配置
 */
export async function configureSkill(
  ctx: SkillActionContext,
  values: SkillConfigValues
): Promise<SkillServiceResult<SkillStatusInfo>> {
  const { skillId, metadata, onProgress } = ctx;

  try {
    onProgress?.("正在保存配置...", 0);

    // 保存配置
    saveSkillConfig(skillId, values);
    onProgress?.("配置已保存", 50);

    // 注入配置到环境变量
    injectConfigToEnv(skillId);
    onProgress?.("配置完成", 100);

    // 重新计算状态
    const statusInfo = computeSkillStatus(skillId, metadata);

    return {
      success: true,
      message: "配置已保存",
      data: statusInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: "配置保存失败",
      error: {
        code: "CONFIG_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// =============================================================================
// 依赖验证服务
// =============================================================================

/**
 * 验证技能依赖
 */
export async function verifySkillDeps(
  ctx: SkillActionContext
): Promise<SkillServiceResult<SkillStatusInfo>> {
  const { skillId, metadata, onProgress } = ctx;

  try {
    onProgress?.("正在验证依赖...", 0);

    const depResult = checkDependencies(metadata?.requires, metadata);
    onProgress?.("依赖检测完成", 50);

    if (depResult.missingBins.length > 0) {
      return {
        success: false,
        message: `仍缺少依赖: ${depResult.missingBins.join(", ")}`,
        error: {
          code: "DEPS_NOT_SATISFIED",
          details: depResult.missingBins.join(", "),
        },
      };
    }

    onProgress?.("验证完成", 100);

    const statusInfo = computeSkillStatus(skillId, metadata);

    return {
      success: true,
      message: "所有依赖已满足",
      data: statusInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: "验证失败",
      error: {
        code: "VERIFY_FAILED",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * 检查单个 CLI 工具是否存在
 */
export function checkCliExists(bin: string): boolean {
  return checkBinExists(bin);
}

// =============================================================================
// 批量操作服务
// =============================================================================

/**
 * 获取所有已安装技能 ID
 */
export function listInstalledSkills(): string[] {
  return getInstalledSkillIds();
}

/**
 * 获取所有已启用技能 ID
 */
export function listEnabledSkills(): string[] {
  return getEnabledSkillIds();
}

/**
 * 批量获取技能状态
 */
export function batchGetSkillStatus(
  skills: { id: string; metadata?: SkillOpenClawMetadata }[]
): Map<string, SkillStatusInfo> {
  const results = new Map<string, SkillStatusInfo>();

  for (const skill of skills) {
    results.set(skill.id, computeSkillStatus(skill.id, skill.metadata));
  }

  return results;
}

// =============================================================================
// 状态展示辅助
// =============================================================================

/**
 * 获取状态显示信息
 */
export { getStatusDisplay, STATUS_DISPLAY };

/**
 * 格式化状态显示文本
 */
export function formatStatusText(status: SkillStatus): string {
  const display = getStatusDisplay(status);
  return `${display.icon} ${display.label}`;
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status: SkillStatus): string {
  const display = getStatusDisplay(status);
  return display.color;
}

// =============================================================================
// 执行操作
// =============================================================================

/**
 * 执行技能操作
 */
export async function executeSkillAction(
  action: SkillAction,
  ctx: SkillActionContext,
  params?: { config?: SkillConfigValues }
): Promise<SkillServiceResult<SkillStatusInfo>> {
  switch (action) {
    case "install":
      return installSkill(ctx);
    case "uninstall": {
      const result = await uninstallSkill(ctx);
      return {
        ...result,
        data: result.success
          ? computeSkillStatus(ctx.skillId, ctx.metadata)
          : undefined,
      };
    }
    case "enable":
      return enableSkill(ctx);
    case "disable":
      return disableSkill(ctx);
    case "configure":
      if (!params?.config) {
        return {
          success: false,
          message: "缺少配置参数",
          error: { code: "MISSING_CONFIG_PARAMS" },
        };
      }
      return configureSkill(ctx, params.config);
    case "verify":
    case "install_deps":
      return verifySkillDeps(ctx);
    case "retry":
      // 重试 = 重新检测状态
      return {
        success: true,
        message: "重试完成",
        data: computeSkillStatus(ctx.skillId, ctx.metadata),
      };
    case "view_error":
      // 查看错误不需要执行操作
      return {
        success: true,
        message: "查看错误",
        data: computeSkillStatus(ctx.skillId, ctx.metadata),
      };
    default:
      return {
        success: false,
        message: `未知操作: ${action}`,
        error: { code: "UNKNOWN_ACTION" },
      };
  }
}
