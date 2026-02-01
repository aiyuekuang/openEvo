/**
 * 技能市场 - 安装/卸载模块
 *
 * @module skill-marketplace/install
 */

import fs from "node:fs/promises";
import path from "node:path";

import { resolveConfigDir } from "../utils.js";
import { getBuiltinSkillById } from "./builtin-catalog.js";
import {
  addInstalledSkill,
  getInstalledSkill,
  removeInstalledSkill,
  setSkillStatus,
} from "./registry.js";
import { getSkillById } from "./search.js";
import type {
  InstalledSkill,
  SkillInstallResult,
  SkillPackage,
  SkillSource,
  SkillUninstallResult,
} from "./types.js";

/**
 * 日志接口
 */
export type SkillInstallLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

const defaultLogger: SkillInstallLogger = {};

/**
 * 获取技能安装目录
 */
function getSkillsInstallDir(): string {
  return path.join(resolveConfigDir(), "extensions");
}

/**
 * 确保安装目录存在
 */
async function ensureInstallDir(): Promise<string> {
  const dir = getSkillsInstallDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 解析技能 ID (支持版本号: @openclaw/wecom@1.0.0)
 */
function parseSkillSpec(spec: string): { id: string; version?: string } {
  // 处理 scoped 包: @scope/name@version
  const match = spec.match(/^(@[^@/]+\/[^@]+)(?:@(.+))?$/);
  if (match) {
    return { id: match[1], version: match[2] };
  }
  // 普通包: name@version
  const parts = spec.split("@");
  if (parts.length === 2 && parts[0]) {
    return { id: parts[0], version: parts[1] };
  }
  return { id: spec };
}

/**
 * 安装技能
 */
export async function installSkill(
  skillSpec: string,
  options: {
    logger?: SkillInstallLogger;
    force?: boolean;
  } = {},
): Promise<SkillInstallResult> {
  const logger = options.logger ?? defaultLogger;
  const { id: skillId, version: requestedVersion } = parseSkillSpec(skillSpec);

  // 检查是否已安装
  const existing = await getInstalledSkill(skillId);
  if (existing && !options.force) {
    return {
      ok: false,
      error: `技能 ${skillId} 已安装 (版本: ${existing.version})。使用 --force 强制重新安装。`,
    };
  }

  // 查找技能包信息
  const skillPackage = getSkillById(skillId);
  if (!skillPackage) {
    return {
      ok: false,
      error: `找不到技能: ${skillId}`,
    };
  }

  // 检查版本
  if (requestedVersion && requestedVersion !== skillPackage.version) {
    return {
      ok: false,
      error: `请求的版本 ${requestedVersion} 不可用，当前版本: ${skillPackage.version}`,
    };
  }

  logger.info?.(`正在安装 ${skillPackage.name} (${skillPackage.version})...`);

  try {
    // 根据来源类型安装
    const installResult = await installBySource(skillPackage, logger);
    if (!installResult.ok) {
      return installResult;
    }

    // 记录安装
    const installed = await addInstalledSkill({
      id: skillId,
      version: skillPackage.version,
      source: skillPackage.source,
      installPath: installResult.installPath,
    });

    logger.info?.(`✓ ${skillPackage.name} 安装成功`);

    return { ok: true, skill: installed };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error?.(`安装失败: ${errorMsg}`);
    return { ok: false, error: errorMsg };
  }
}

/**
 * 根据来源类型安装
 */
async function installBySource(
  skill: SkillPackage,
  logger: SkillInstallLogger,
): Promise<{ ok: true; installPath?: string } | { ok: false; error: string }> {
  const source = skill.source;

  switch (source.type) {
    case "builtin":
      // 内置技能无需实际安装文件，只需记录
      logger.info?.(`  内置技能，无需下载`);
      return { ok: true };

    case "npm":
      // TODO: 实现 npm 安装
      logger.info?.(`  npm 安装: ${source.spec}`);
      return {
        ok: false,
        error: "npm 安装暂未实现，请使用内置技能",
      };

    case "local":
      // TODO: 实现本地路径安装
      logger.info?.(`  本地安装: ${source.path}`);
      return {
        ok: false,
        error: "本地安装暂未实现",
      };

    case "git":
      // TODO: 实现 Git 仓库安装
      logger.info?.(`  Git 安装: ${source.url}`);
      return {
        ok: false,
        error: "Git 安装暂未实现",
      };

    case "url":
      // TODO: 实现 URL 下载安装
      logger.info?.(`  URL 安装: ${source.url}`);
      return {
        ok: false,
        error: "URL 安装暂未实现",
      };

    default:
      return {
        ok: false,
        error: `不支持的安装来源类型`,
      };
  }
}

/**
 * 卸载技能
 */
export async function uninstallSkill(
  skillId: string,
  options: {
    logger?: SkillInstallLogger;
  } = {},
): Promise<SkillUninstallResult> {
  const logger = options.logger ?? defaultLogger;

  // 检查是否已安装
  const installed = await getInstalledSkill(skillId);
  if (!installed) {
    return {
      ok: false,
      error: `技能 ${skillId} 未安装`,
    };
  }

  const skillPackage = getSkillById(skillId);
  const displayName = skillPackage?.name ?? skillId;

  logger.info?.(`正在卸载 ${displayName}...`);

  try {
    // 如果有安装路径，删除文件
    if (installed.installPath) {
      try {
        await fs.rm(installed.installPath, { recursive: true, force: true });
        logger.info?.(`  已删除: ${installed.installPath}`);
      } catch (err) {
        logger.warn?.(`  删除文件失败: ${err}`);
      }
    }

    // 移除注册记录
    await removeInstalledSkill(skillId);

    logger.info?.(`✓ ${displayName} 卸载成功`);

    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error?.(`卸载失败: ${errorMsg}`);
    return { ok: false, error: errorMsg };
  }
}

/**
 * 启用技能
 */
export async function enableSkill(
  skillId: string,
  options: { logger?: SkillInstallLogger } = {},
): Promise<{ ok: boolean; error?: string }> {
  const logger = options.logger ?? defaultLogger;

  const installed = await getInstalledSkill(skillId);
  if (!installed) {
    return { ok: false, error: `技能 ${skillId} 未安装` };
  }

  if (installed.status === "active") {
    return { ok: true }; // 已经是启用状态
  }

  await setSkillStatus(skillId, "active");
  logger.info?.(`✓ ${skillId} 已启用`);

  return { ok: true };
}

/**
 * 禁用技能
 */
export async function disableSkill(
  skillId: string,
  options: { logger?: SkillInstallLogger } = {},
): Promise<{ ok: boolean; error?: string }> {
  const logger = options.logger ?? defaultLogger;

  const installed = await getInstalledSkill(skillId);
  if (!installed) {
    return { ok: false, error: `技能 ${skillId} 未安装` };
  }

  if (installed.status === "disabled") {
    return { ok: true }; // 已经是禁用状态
  }

  await setSkillStatus(skillId, "disabled");
  logger.info?.(`✓ ${skillId} 已禁用`);

  return { ok: true };
}

/**
 * 更新技能
 */
export async function updateSkill(
  skillId: string,
  options: {
    logger?: SkillInstallLogger;
  } = {},
): Promise<SkillInstallResult> {
  const logger = options.logger ?? defaultLogger;

  const installed = await getInstalledSkill(skillId);
  if (!installed) {
    return { ok: false, error: `技能 ${skillId} 未安装` };
  }

  // 检查是否锁定
  if (installed.locked) {
    return { ok: false, error: `技能 ${skillId} 已锁定版本，请先解锁` };
  }

  const skillPackage = getSkillById(skillId);
  if (!skillPackage) {
    return { ok: false, error: `找不到技能: ${skillId}` };
  }

  // 检查是否有新版本
  if (installed.version === skillPackage.version) {
    logger.info?.(`${skillId} 已是最新版本 (${installed.version})`);
    return { ok: true, skill: installed };
  }

  logger.info?.(`发现新版本: ${installed.version} -> ${skillPackage.version}`);

  // 重新安装
  return installSkill(skillId, { logger, force: true });
}

/**
 * 检查可更新的技能
 */
export async function checkUpdates(): Promise<
  Array<{
    id: string;
    currentVersion: string;
    latestVersion: string;
  }>
> {
  const { getInstalledSkills } = await import("./registry.js");
  const installedSkills = await getInstalledSkills();
  const updates: Array<{
    id: string;
    currentVersion: string;
    latestVersion: string;
  }> = [];

  for (const installed of installedSkills) {
    if (installed.locked) continue;

    const skillPackage = getSkillById(installed.id);
    if (!skillPackage) continue;

    if (installed.version !== skillPackage.version) {
      updates.push({
        id: installed.id,
        currentVersion: installed.version,
        latestVersion: skillPackage.version,
      });
    }
  }

  return updates;
}

/**
 * 批量安装技能
 */
export async function installSkills(
  skillIds: string[],
  options: { logger?: SkillInstallLogger } = {},
): Promise<{
  success: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const logger = options.logger ?? defaultLogger;
  const success: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const skillId of skillIds) {
    const result = await installSkill(skillId, { logger });
    if (result.ok) {
      success.push(skillId);
    } else {
      failed.push({ id: skillId, error: result.error });
    }
  }

  return { success, failed };
}
