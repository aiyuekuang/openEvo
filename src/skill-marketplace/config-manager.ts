/**
 * 技能配置管理器
 *
 * 读写技能配置（API Key 等）到本地文件
 *
 * @module skill-marketplace/config-manager
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SkillConfigValues, SavedSkillConfig, SkillInstallState, InstalledSkillRecord } from "./skill-metadata.js";

// =============================================================================
// 路径常量
// =============================================================================

/**
 * 获取 OpenClaw 配置目录
 */
export function getOpenClawDir(): string {
  return path.join(os.homedir(), ".openclaw");
}

/**
 * 获取技能配置目录
 */
export function getSkillsConfigDir(): string {
  return path.join(getOpenClawDir(), "skills");
}

/**
 * 获取技能配置文件路径
 */
export function getSkillConfigPath(skillId: string): string {
  // 将 @openclaw/notion 转为 openclaw/notion
  const safePath = skillId.replace(/^@/, "").replace(/\//g, path.sep);
  return path.join(getSkillsConfigDir(), safePath, "config.json");
}

/**
 * 获取技能安装状态文件路径
 */
export function getInstallStatePath(): string {
  return path.join(getSkillsConfigDir(), "installed.json");
}

// =============================================================================
// 文件操作工具
// =============================================================================

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 安全读取 JSON 文件
 */
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`读取 JSON 文件失败: ${filePath}`, error);
  }
  return defaultValue;
}

/**
 * 安全写入 JSON 文件
 */
function writeJsonFile(filePath: string, data: unknown): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`写入 JSON 文件失败: ${filePath}`, error);
    throw error;
  }
}

// =============================================================================
// 技能配置管理
// =============================================================================

/**
 * 获取技能配置
 */
export function getSkillConfig(skillId: string): SavedSkillConfig | null {
  const configPath = getSkillConfigPath(skillId);
  const config = readJsonFile<SavedSkillConfig | null>(configPath, null);
  return config;
}

/**
 * 保存技能配置
 */
export function saveSkillConfig(skillId: string, values: SkillConfigValues): SavedSkillConfig {
  const configPath = getSkillConfigPath(skillId);
  const config: SavedSkillConfig = {
    skillId,
    values,
    configuredAt: new Date().toISOString(),
  };
  writeJsonFile(configPath, config);
  return config;
}

/**
 * 删除技能配置
 */
export function deleteSkillConfig(skillId: string): void {
  const configPath = getSkillConfigPath(skillId);
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  } catch (error) {
    console.error(`删除技能配置失败: ${skillId}`, error);
  }
}

/**
 * 检测技能是否已配置
 */
export function isSkillConfigured(skillId: string, requiredEnv: string[]): boolean {
  const config = getSkillConfig(skillId);
  if (!config) {
    return false;
  }

  // 检查所有必需的环境变量是否都已配置
  for (const envVar of requiredEnv) {
    if (!config.values[envVar]) {
      return false;
    }
  }

  return true;
}

/**
 * 获取技能配置值
 */
export function getSkillConfigValue(skillId: string, key: string): string | number | boolean | undefined {
  const config = getSkillConfig(skillId);
  return config?.values[key];
}

// =============================================================================
// 技能安装状态管理
// =============================================================================

/**
 * 获取安装状态
 */
export function getInstallState(): SkillInstallState {
  const statePath = getInstallStatePath();
  return readJsonFile<SkillInstallState>(statePath, {
    installed: [],
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 保存安装状态
 */
export function saveInstallState(state: SkillInstallState): void {
  const statePath = getInstallStatePath();
  state.updatedAt = new Date().toISOString();
  writeJsonFile(statePath, state);
}

/**
 * 获取已安装技能记录
 */
export function getInstalledSkill(skillId: string): InstalledSkillRecord | null {
  const state = getInstallState();
  return state.installed.find((s) => s.skillId === skillId) || null;
}

/**
 * 标记技能为已安装
 */
export function markSkillInstalled(skillId: string, installMethod?: string): void {
  const state = getInstallState();
  const existing = state.installed.findIndex((s) => s.skillId === skillId);

  const record: InstalledSkillRecord = {
    skillId,
    installedAt: new Date().toISOString(),
    installMethod,
    enabled: true,
  };

  if (existing >= 0) {
    state.installed[existing] = record;
  } else {
    state.installed.push(record);
  }

  saveInstallState(state);
}

/**
 * 标记技能为已卸载
 */
export function markSkillUninstalled(skillId: string): void {
  const state = getInstallState();
  state.installed = state.installed.filter((s) => s.skillId !== skillId);
  saveInstallState(state);

  // 同时删除配置
  deleteSkillConfig(skillId);
}

/**
 * 启用/禁用技能
 */
export function setSkillEnabled(skillId: string, enabled: boolean): void {
  const state = getInstallState();
  const skill = state.installed.find((s) => s.skillId === skillId);

  if (skill) {
    skill.enabled = enabled;
    skill.disabledAt = enabled ? undefined : new Date().toISOString();
    saveInstallState(state);
  }
}

/**
 * 检测技能是否已安装
 */
export function isSkillInstalled(skillId: string): boolean {
  const skill = getInstalledSkill(skillId);
  return skill !== null;
}

/**
 * 检测技能是否启用
 */
export function isSkillEnabled(skillId: string): boolean {
  const skill = getInstalledSkill(skillId);
  return skill?.enabled ?? false;
}

/**
 * 获取所有已安装技能 ID
 */
export function getInstalledSkillIds(): string[] {
  const state = getInstallState();
  return state.installed.map((s) => s.skillId);
}

/**
 * 获取所有启用的技能 ID
 */
export function getEnabledSkillIds(): string[] {
  const state = getInstallState();
  return state.installed.filter((s) => s.enabled).map((s) => s.skillId);
}

// =============================================================================
// 环境变量注入
// =============================================================================

/**
 * 将技能配置注入到环境变量
 * 用于运行时让 CLI 工具能够读取配置
 */
export function injectConfigToEnv(skillId: string): void {
  const config = getSkillConfig(skillId);
  if (!config) {
    return;
  }

  for (const [key, value] of Object.entries(config.values)) {
    if (typeof value === "string" || typeof value === "number") {
      process.env[key] = String(value);
    }
  }
}

/**
 * 批量注入所有已启用技能的配置到环境变量
 */
export function injectAllEnabledConfigs(): void {
  const enabledIds = getEnabledSkillIds();
  for (const skillId of enabledIds) {
    injectConfigToEnv(skillId);
  }
}
