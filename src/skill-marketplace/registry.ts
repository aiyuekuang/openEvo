/**
 * 技能市场 - 本地已安装技能注册表
 *
 * 管理已安装技能的本地状态
 *
 * @module skill-marketplace/registry
 */

import fs from "node:fs/promises";
import path from "node:path";

import { resolveConfigDir } from "../utils.js";
import type { InstalledSkill, SkillSource } from "./types.js";

const MARKETPLACE_DIR = "marketplace";
const INSTALLED_FILE = "installed.json";

/**
 * 已安装技能注册表数据结构
 */
type InstalledRegistry = {
  version: number;
  skills: Record<string, InstalledSkill>;
  lastUpdated: string;
};

/**
 * 获取市场数据目录
 */
function getMarketplaceDir(): string {
  return path.join(resolveConfigDir(), MARKETPLACE_DIR);
}

/**
 * 获取已安装技能文件路径
 */
function getInstalledFilePath(): string {
  return path.join(getMarketplaceDir(), INSTALLED_FILE);
}

/**
 * 确保市场目录存在
 */
async function ensureMarketplaceDir(): Promise<void> {
  await fs.mkdir(getMarketplaceDir(), { recursive: true });
}

/**
 * 读取已安装技能注册表
 */
export async function loadInstalledRegistry(): Promise<InstalledRegistry> {
  const filePath = getInstalledFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as InstalledRegistry;
    return {
      version: data.version ?? 1,
      skills: data.skills ?? {},
      lastUpdated: data.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return {
      version: 1,
      skills: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * 保存已安装技能注册表
 */
export async function saveInstalledRegistry(registry: InstalledRegistry): Promise<void> {
  await ensureMarketplaceDir();
  const filePath = getInstalledFilePath();
  registry.lastUpdated = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * 获取所有已安装的技能
 */
export async function getInstalledSkills(): Promise<InstalledSkill[]> {
  const registry = await loadInstalledRegistry();
  return Object.values(registry.skills);
}

/**
 * 获取已安装技能 by ID
 */
export async function getInstalledSkill(skillId: string): Promise<InstalledSkill | null> {
  const registry = await loadInstalledRegistry();
  return registry.skills[skillId] ?? null;
}

/**
 * 检查技能是否已安装
 */
export async function isSkillInstalled(skillId: string): Promise<boolean> {
  const skill = await getInstalledSkill(skillId);
  return skill !== null;
}

/**
 * 添加已安装技能记录
 */
export async function addInstalledSkill(params: {
  id: string;
  version: string;
  source: SkillSource;
  installPath?: string;
}): Promise<InstalledSkill> {
  const registry = await loadInstalledRegistry();
  const now = new Date().toISOString();

  const skill: InstalledSkill = {
    id: params.id,
    version: params.version,
    source: params.source,
    installedAt: now,
    updatedAt: now,
    status: "active",
    installPath: params.installPath,
  };

  registry.skills[params.id] = skill;
  await saveInstalledRegistry(registry);

  return skill;
}

/**
 * 更新已安装技能记录
 */
export async function updateInstalledSkill(
  skillId: string,
  updates: Partial<Omit<InstalledSkill, "id" | "installedAt">>,
): Promise<InstalledSkill | null> {
  const registry = await loadInstalledRegistry();
  const existing = registry.skills[skillId];

  if (!existing) {
    return null;
  }

  const updated: InstalledSkill = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  registry.skills[skillId] = updated;
  await saveInstalledRegistry(registry);

  return updated;
}

/**
 * 移除已安装技能记录
 */
export async function removeInstalledSkill(skillId: string): Promise<boolean> {
  const registry = await loadInstalledRegistry();

  if (!registry.skills[skillId]) {
    return false;
  }

  delete registry.skills[skillId];
  await saveInstalledRegistry(registry);

  return true;
}

/**
 * 设置技能状态
 */
export async function setSkillStatus(
  skillId: string,
  status: InstalledSkill["status"],
  error?: string,
): Promise<InstalledSkill | null> {
  return updateInstalledSkill(skillId, { status, error });
}

/**
 * 启用技能
 */
export async function enableSkill(skillId: string): Promise<InstalledSkill | null> {
  return setSkillStatus(skillId, "active");
}

/**
 * 禁用技能
 */
export async function disableSkill(skillId: string): Promise<InstalledSkill | null> {
  return setSkillStatus(skillId, "disabled");
}

/**
 * 锁定技能版本 (不自动更新)
 */
export async function lockSkillVersion(skillId: string): Promise<InstalledSkill | null> {
  return updateInstalledSkill(skillId, { locked: true });
}

/**
 * 解锁技能版本
 */
export async function unlockSkillVersion(skillId: string): Promise<InstalledSkill | null> {
  return updateInstalledSkill(skillId, { locked: false });
}

/**
 * 获取活跃的技能 (非禁用)
 */
export async function getActiveSkills(): Promise<InstalledSkill[]> {
  const skills = await getInstalledSkills();
  return skills.filter((skill) => skill.status === "active");
}

/**
 * 获取有错误的技能
 */
export async function getErrorSkills(): Promise<InstalledSkill[]> {
  const skills = await getInstalledSkills();
  return skills.filter((skill) => skill.status === "error");
}

/**
 * 清空所有已安装技能记录 (谨慎使用)
 */
export async function clearInstalledRegistry(): Promise<void> {
  await saveInstalledRegistry({
    version: 1,
    skills: {},
    lastUpdated: new Date().toISOString(),
  });
}
