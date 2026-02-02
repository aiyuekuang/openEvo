/**
 * 技能状态服务
 *
 * 综合检测技能的运行时状态，支持完整的生命周期状态管理
 *
 * @module skill-marketplace/skill-status
 */

import * as path from "node:path";
import * as os from "node:os";
import type {
  SkillStatus,
  SkillStatusInfo,
  SkillOpenClawMetadata,
  SkillInstallOption,
  SkillConfigField,
} from "./skill-metadata.js";
import { getRequirements } from "./skill-metadata.js";
import { checkDependencies } from "./dependency-checker.js";
import {
  getSkillConfig,
  isSkillInstalled,
  isSkillEnabled,
  getInstalledSkill,
} from "./config-manager.js";
import { generateConfigFields } from "./skill-parser.js";
import {
  getSkillDir,
  computeSkillStatusFromChecksSync,
} from "./checks-runner.js";

// =============================================================================
// 状态计算
// =============================================================================

/**
 * 计算技能状态（完整版，返回 SkillStatusInfo）
 *
 * 检测优先级:
 * 1. 系统支持检测 → 不支持则 unsupported
 * 2. 安装检测 → 未安装则 not_installed
 * 3. 用户禁用检测 → 已禁用则 disabled
 * 4. 依赖检测 → 缺 CLI 则 needs_deps
 * 5. 配置检测 → 缺配置则 needs_config
 * 6. 启用检测 → 已启用则 active，否则 ready
 */
export function computeSkillStatus(
  skillId: string,
  metadata?: SkillOpenClawMetadata,
  options?: {
    /** 是否检查安装状态 (默认 true) */
    checkInstalled?: boolean;
  }
): SkillStatusInfo {
  const checkInstalled = options?.checkInstalled ?? true;

  // 1. 系统支持检测
  if (metadata?.os && metadata.os.length > 0) {
    const currentOS = process.platform as "darwin" | "linux" | "win32";
    if (!metadata.os.includes(currentOS)) {
      return {
        status: "unsupported",
        installed: false,
        enabled: false,
        message: `此技能仅支持 ${metadata.os.join(", ")}`,
      };
    }
  }

  // 2. 安装检测
  const installed = checkInstalled ? isSkillInstalled(skillId) : true;
  if (!installed) {
    return {
      status: "not_installed",
      installed: false,
      enabled: false,
      message: "点击安装使用此技能",
    };
  }

  // 3. 用户禁用检测
  const installedRecord = getInstalledSkill(skillId);
  const enabled = installedRecord?.enabled ?? false;
  if (installed && !enabled) {
    return {
      status: "disabled",
      installed: true,
      enabled: false,
      message: "技能已禁用",
    };
  }

  // 4. 配置驱动检测 (新架构 - 优先使用 checks)
  if (metadata?.checks && metadata.checks.length > 0) {
    try {
      // 获取技能目录
      const skillsDir = path.join(os.homedir(), ".openclaw", "skills");
      // 获取注册表目录 (开发环境和生产环境路径不同，这里使用相对路径)
      const registryDir = path.join(process.cwd(), "skills-registry");
      const skillDir = getSkillDir(skillId, skillsDir, registryDir);

      // 使用 checks 执行器计算状态
      return computeSkillStatusFromChecksSync(skillDir, metadata.checks, metadata.actions);
    } catch (error) {
      // checks 执行失败时，回退到默认状态而不是崩溃
      console.error(`[skill-status] checks 执行失败 (${skillId}):`, error);
      return {
        status: "needs_deps",
        installed: true,
        enabled: false,
        message: "依赖检测失败",
      };
    }
  }

  // 5. 依赖检测 (旧架构 - requires)
  const depResult = checkDependencies(metadata?.requires, metadata);
  if (depResult.missingBins.length > 0) {
    return {
      status: "needs_deps",
      installed: true,
      enabled: false,
      message: `需要安装: ${depResult.missingBins.join(", ")}`,
      deps: {
        missing: depResult.missingBins,
        installOptions: depResult.availableInstalls,
      },
      // 向后兼容
      missingBins: depResult.missingBins,
      availableInstalls: depResult.availableInstalls,
    };
  }

  // 4.5. 认证检测 (只有当 CLI 工具已安装时才检测)
  if (depResult.authFailed) {
    return {
      status: "needs_auth",
      installed: true,
      enabled: false,
      message: depResult.authFailed.message ?? "需要登录认证",
      auth: {
        message: depResult.authFailed.message ?? "需要登录认证",
        action: depResult.authFailed.action ?? depResult.authFailed.command,
        helpUrl: depResult.authFailed.helpUrl,
      },
    };
  }

  // 5. 配置检测
  const { missing: missingConfig, fields: configFields } = detectMissingConfig(
    skillId,
    metadata
  );
  if (missingConfig.length > 0) {
    return {
      status: "needs_config",
      installed: true,
      enabled: false,
      message: `需要配置: ${missingConfig.join(", ")}`,
      config: {
        missing: missingConfig,
        fields: configFields,
      },
      // 向后兼容
      missingEnv: missingConfig,
    };
  }

  // 检查其他配置项
  if (depResult.missingConfig.length > 0) {
    return {
      status: "needs_config",
      installed: true,
      enabled: false,
      message: `需要配置: ${depResult.missingConfig.join(", ")}`,
      config: {
        missing: depResult.missingConfig,
        fields: [],
      },
      // 向后兼容
      missingConfig: depResult.missingConfig,
    };
  }

  // 6. 一切就绪
  return {
    status: enabled ? "active" : "ready",
    installed: true,
    enabled,
    message: enabled ? "Agent 可以调用此技能" : "可用",
  };
}

/**
 * 检测缺失的配置项
 */
export function detectMissingConfig(
  skillId: string,
  metadata?: SkillOpenClawMetadata
): { missing: string[]; fields: SkillConfigField[] } {
  if (!metadata) {
    return { missing: [], fields: [] };
  }

  const requirements = getRequirements(metadata);
  
  // 提取 env 类型的检测项
  const requiredEnv: string[] = [];
  for (const req of requirements) {
    if (req.type === "env") {
      requiredEnv.push(req.name);
    }
  }

  if (requiredEnv.length === 0) {
    return { missing: [], fields: [] };
  }

  const config = getSkillConfig(skillId);
  const missing: string[] = [];

  for (const envVar of requiredEnv) {
    // 先检查本地配置
    const hasLocalConfig = config?.values[envVar] !== undefined;
    // 再检查环境变量
    const hasEnvVar =
      process.env[envVar] !== undefined && process.env[envVar] !== "";

    if (!hasLocalConfig && !hasEnvVar) {
      missing.push(envVar);
    }
  }

  // 生成配置字段定义
  const fields = generateConfigFields(metadata);

  return { missing, fields };
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
  not_installed: {
    label: "未安装",
    color: "default",
    icon: "➕",
    actionLabel: "安装",
  },
  installing: {
    label: "安装中",
    color: "processing",
    icon: "⏳",
  },
  needs_deps: {
    label: "需安装依赖",
    color: "warning",
    icon: "📦",
    actionLabel: "安装依赖",
  },
  installing_deps: {
    label: "安装依赖中",
    color: "processing",
    icon: "⏳",
  },
  needs_auth: {
    label: "需登录",
    color: "warning",
    icon: "🔑",
    actionLabel: "登录",
  },
  needs_config: {
    label: "需配置",
    color: "warning",
    icon: "⚙️",
    actionLabel: "配置",
  },
  configuring: {
    label: "配置中",
    color: "processing",
    icon: "⚙️",
  },
  ready: {
    label: "已就绪",
    color: "success",
    icon: "✅",
    actionLabel: "启用",
  },
  active: {
    label: "运行中",
    color: "success",
    icon: "🟢",
    actionLabel: "禁用",
  },
  disabled: {
    label: "已禁用",
    color: "default",
    icon: "⏸️",
    actionLabel: "启用",
  },
  error: {
    label: "错误",
    color: "error",
    icon: "❌",
    actionLabel: "重试",
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
    not_installed: 0,
    installing: 0,
    needs_deps: 0,
    installing_deps: 0,
    needs_auth: 0,
    needs_config: 0,
    configuring: 0,
    ready: 0,
    active: 0,
    disabled: 0,
    error: 0,
    unsupported: 0,
  };

  statusMap.forEach((info) => {
    if (counts[info.status] !== undefined) {
      counts[info.status]++;
    }
  });

  return counts;
}
