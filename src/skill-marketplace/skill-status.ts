/**
 * 技能状态服务
 *
 * 综合检测技能的运行时状态
 *
 * @module skill-marketplace/skill-status
 */

import type { SkillStatus, SkillStatusInfo, SkillOpenClawMetadata } from "./skill-metadata.js";
import { checkDependencies } from "./dependency-checker.js";
import { getSkillConfig, isSkillInstalled, isSkillEnabled } from "./config-manager.js";

// =============================================================================
// 状态计算
// =============================================================================

/**
 * 计算技能状态
 */
export function computeSkillStatus(skillId: string, metadata?: SkillOpenClawMetadata): SkillStatusInfo {
  // 检查是否已安装并启用
  const installed = isSkillInstalled(skillId);
  const enabled = isSkillEnabled(skillId);

  // 如果已安装但被禁用
  if (installed && !enabled) {
    return {
      status: "disabled",
      message: "技能已禁用",
    };
  }

  // 检测依赖
  const depResult = checkDependencies(metadata?.requires, metadata);

  // 系统不支持
  if (!depResult.osSupported) {
    return {
      status: "unsupported",
      message: "当前系统不支持此技能",
    };
  }

  // 缺少 CLI 工具
  if (depResult.missingBins.length > 0) {
    return {
      status: "needs_install",
      message: `需要安装: ${depResult.missingBins.join(", ")}`,
      missingBins: depResult.missingBins,
      availableInstalls: depResult.availableInstalls,
    };
  }

  // 检查配置（环境变量）
  const requiredEnv = metadata?.requires?.env || [];
  if (requiredEnv.length > 0) {
    const config = getSkillConfig(skillId);
    const missingEnv: string[] = [];

    for (const envVar of requiredEnv) {
      // 先检查本地配置
      const hasLocalConfig = config?.values[envVar] !== undefined;
      // 再检查环境变量
      const hasEnvVar = process.env[envVar] !== undefined && process.env[envVar] !== "";

      if (!hasLocalConfig && !hasEnvVar) {
        missingEnv.push(envVar);
      }
    }

    if (missingEnv.length > 0) {
      return {
        status: "needs_config",
        message: `需要配置: ${missingEnv.join(", ")}`,
        missingEnv,
      };
    }
  }

  // 检查其他配置项
  if (depResult.missingConfig.length > 0) {
    return {
      status: "needs_config",
      message: `需要配置: ${depResult.missingConfig.join(", ")}`,
      missingConfig: depResult.missingConfig,
    };
  }

  // 一切就绪
  return {
    status: "ready",
    message: "可用",
  };
}

/**
 * 快速获取技能状态
 */
export function getSkillStatus(skillId: string, metadata?: SkillOpenClawMetadata): SkillStatus {
  const info = computeSkillStatus(skillId, metadata);
  return info.status;
}

/**
 * 检测技能是否就绪
 */
export function isSkillReady(skillId: string, metadata?: SkillOpenClawMetadata): boolean {
  const status = getSkillStatus(skillId, metadata);
  return status === "ready";
}

// =============================================================================
// 状态显示辅助
// =============================================================================

/**
 * 状态显示配置
 */
export const STATUS_DISPLAY: Record<
  SkillStatus,
  {
    label: string;
    color: string;
    icon: string;
    actionLabel?: string;
  }
> = {
  ready: {
    label: "可用",
    color: "success",
    icon: "✅",
  },
  needs_config: {
    label: "需配置",
    color: "warning",
    icon: "⚙️",
    actionLabel: "配置",
  },
  needs_install: {
    label: "需安装",
    color: "processing",
    icon: "📦",
    actionLabel: "安装",
  },
  installing: {
    label: "安装中",
    color: "processing",
    icon: "⏳",
  },
  configuring: {
    label: "配置中",
    color: "processing",
    icon: "⚙️",
  },
  error: {
    label: "错误",
    color: "error",
    icon: "❌",
    actionLabel: "重试",
  },
  disabled: {
    label: "已禁用",
    color: "default",
    icon: "🚫",
    actionLabel: "启用",
  },
  unsupported: {
    label: "不支持",
    color: "default",
    icon: "🚫",
  },
};

/**
 * 获取状态显示信息
 */
export function getStatusDisplay(status: SkillStatus) {
  return STATUS_DISPLAY[status] || STATUS_DISPLAY.error;
}

// =============================================================================
// 批量状态检测
// =============================================================================

/**
 * 批量计算技能状态
 */
export function computeSkillsStatus(
  skills: { id: string; metadata?: SkillOpenClawMetadata }[]
): Map<string, SkillStatusInfo> {
  const results = new Map<string, SkillStatusInfo>();

  for (const skill of skills) {
    results.set(skill.id, computeSkillStatus(skill.id, skill.metadata));
  }

  return results;
}

/**
 * 统计各状态的技能数量
 */
export function countSkillsByStatus(statusMap: Map<string, SkillStatusInfo>): Record<SkillStatus, number> {
  const counts: Record<SkillStatus, number> = {
    ready: 0,
    needs_config: 0,
    needs_install: 0,
    installing: 0,
    configuring: 0,
    error: 0,
    disabled: 0,
    unsupported: 0,
  };

  for (const info of statusMap.values()) {
    counts[info.status]++;
  }

  return counts;
}
