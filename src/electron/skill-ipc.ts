/**
 * 技能市场 IPC 处理器（Electron 主进程）
 *
 * 注册技能相关的 IPC 处理函数
 *
 * @module electron/skill-ipc
 */

import type { IpcMain } from "electron";
import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// 类型定义
// =============================================================================

type SkillStatus = "ready" | "needs_config" | "needs_install" | "installing" | "configuring" | "error" | "disabled" | "unsupported";

type SkillStatusInfo = {
  status: SkillStatus;
  message?: string;
  missingBins?: string[];
  missingEnv?: string[];
  error?: string;
};

type SkillConfigValues = Record<string, string | number | boolean>;

type SavedSkillConfig = {
  skillId: string;
  values: SkillConfigValues;
  configuredAt: string;
};

type SkillRequirements = {
  bins?: string[];
  anyBins?: string[];
  env?: string[];
};

type SkillOpenClawMetadata = {
  emoji?: string;
  requires?: SkillRequirements;
  primaryEnv?: string;
};

type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
};

// =============================================================================
// 路径工具
// =============================================================================

function getSkillsConfigDir(): string {
  return path.join(os.homedir(), ".openclaw", "skills");
}

function getSkillConfigPath(skillId: string): string {
  const safePath = skillId.replace(/^@/, "").replace(/\//g, path.sep);
  return path.join(getSkillsConfigDir(), safePath, "config.json");
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// =============================================================================
// 配置管理
// =============================================================================

function getSkillConfig(skillId: string): SavedSkillConfig | null {
  const configPath = getSkillConfigPath(skillId);
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as SavedSkillConfig;
    }
  } catch (error) {
    console.error(`读取技能配置失败: ${skillId}`, error);
  }
  return null;
}

function saveSkillConfig(skillId: string, values: SkillConfigValues): SavedSkillConfig {
  const configPath = getSkillConfigPath(skillId);
  const config: SavedSkillConfig = {
    skillId,
    values,
    configuredAt: new Date().toISOString(),
  };
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  return config;
}

// =============================================================================
// 依赖检测
// =============================================================================

function checkBin(bin: string): boolean {
  try {
    execSync(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkEnvVar(envVar: string, skillId: string): boolean {
  // 先检查环境变量
  if (process.env[envVar]) {
    return true;
  }
  // 再检查技能配置
  const config = getSkillConfig(skillId);
  if (config?.values[envVar]) {
    return true;
  }
  return false;
}

// =============================================================================
// 技能元数据解析
// =============================================================================

/**
 * 获取已安装技能目录 (~/.openclaw/skills/)
 * 用户数据目录，存放已安装的技能
 */
function getSkillsDir(): string {
  const skillsDir = path.join(os.homedir(), ".openclaw", "skills");
  ensureDir(skillsDir);
  return skillsDir;
}

/**
 * 获取技能仓库目录 (skills-registry/)
 */
function getSkillsRegistryDir(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "..", "..", "skills-registry");
  } else {
    return path.join(app.getAppPath(), "skills-registry");
  }
}

/**
 * 复制目录（递归）
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 删除目录（递归）
 */
function removeDirSync(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function parseSkillMetadata(skillId: string): SkillOpenClawMetadata | null {
  // skillId 格式: @openclaw/notion -> notion
  const skillName = skillId.replace(/^@openclaw\//, "");
  
  // 先从 skills/ 读取（已安装），再从 skills-registry/ 读取
  const skillsDir = getSkillsDir();
  const registryDir = getSkillsRegistryDir();
  
  let skillMdPath = path.join(skillsDir, skillName, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    skillMdPath = path.join(registryDir, skillName, "SKILL.md");
  }

  try {
    if (!fs.existsSync(skillMdPath)) {
      return null;
    }
    const content = fs.readFileSync(skillMdPath, "utf-8");

    // 解析 frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return null;
    }

    // 简单解析 YAML
    const yamlContent = match[1];
    const lines = yamlContent.split("\n");
    let metadataStr = "";

    for (const line of lines) {
      if (line.startsWith("metadata:")) {
        metadataStr = line.slice("metadata:".length).trim();
        break;
      }
    }

    if (metadataStr) {
      const parsed = JSON.parse(metadataStr);
      return parsed.openclaw as SkillOpenClawMetadata;
    }
  } catch (error) {
    console.error(`解析技能元数据失败: ${skillId}`, error);
  }

  return null;
}

// =============================================================================
// 状态计算
// =============================================================================

function computeSkillStatus(skillId: string): SkillStatusInfo {
  const metadata = parseSkillMetadata(skillId);

  if (!metadata) {
    // 无元数据，默认为就绪
    return { status: "ready" };
  }

  const requires = metadata.requires || {};

  // 检查 bins
  const missingBins: string[] = [];
  if (requires.bins) {
    for (const bin of requires.bins) {
      if (!checkBin(bin)) {
        missingBins.push(bin);
      }
    }
  }

  // 检查 anyBins (满足其一即可)
  if (requires.anyBins && requires.anyBins.length > 0) {
    const anyFound = requires.anyBins.some((bin) => checkBin(bin));
    if (!anyFound) {
      missingBins.push(`(${requires.anyBins.join(" | ")})`);
    }
  }

  if (missingBins.length > 0) {
    return {
      status: "needs_install",
      missingBins,
      message: `缺少依赖: ${missingBins.join(", ")}`,
    };
  }

  // 检查 env
  const missingEnv: string[] = [];
  if (requires.env) {
    for (const envVar of requires.env) {
      if (!checkEnvVar(envVar, skillId)) {
        missingEnv.push(envVar);
      }
    }
  }

  if (missingEnv.length > 0) {
    return {
      status: "needs_config",
      missingEnv,
      message: `需要配置: ${missingEnv.join(", ")}`,
    };
  }

  return { status: "ready" };
}

// =============================================================================
// 配置字段生成
// =============================================================================

function generateConfigFields(skillId: string): ConfigField[] {
  const metadata = parseSkillMetadata(skillId);
  if (!metadata?.requires?.env) {
    return [];
  }

  return metadata.requires.env.map((envVar) => {
    const isApiKey =
      envVar.toLowerCase().includes("api_key") ||
      envVar.toLowerCase().includes("apikey") ||
      envVar.toLowerCase().includes("secret") ||
      envVar.toLowerCase().includes("token");

    const label = envVar
      .replace(/_/g, " ")
      .replace(/API KEY/gi, "API Key")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      key: envVar,
      label,
      type: isApiKey ? "password" : "text",
      required: true,
      placeholder: isApiKey ? "输入您的 API Key" : `输入 ${label}`,
    };
  });
}

// =============================================================================
// IPC 注册
// =============================================================================

/**
 * 注册技能市场 IPC 处理器
 */
export function registerSkillIpcHandlers(ipcMain: IpcMain): void {
  // 获取单个技能状态
  ipcMain.handle("skill:getStatus", async (_event, skillId: string) => {
    return computeSkillStatus(skillId);
  });

  // 获取所有技能状态
  ipcMain.handle("skill:getAllStatuses", async (_event, skillIds?: string[]) => {
    console.log("[skill-ipc] getAllStatuses called, skillIds:", skillIds?.length);
    const results: Record<string, SkillStatusInfo> = {};
    
    // 如果传入了 skillIds，只检测这些技能
    if (skillIds && skillIds.length > 0) {
      for (const skillId of skillIds) {
        const status = computeSkillStatus(skillId);
        results[skillId] = status;
        if (status.status !== "ready") {
          console.log(`[skill-ipc] ${skillId}: ${status.status}`, status.missingBins || status.missingEnv);
        }
      }
    } else {
      // 否则扫描 skills 目录
      const skillsDir = getSkillsDir();
      try {
        if (fs.existsSync(skillsDir)) {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const skillId = `@openclaw/${entry.name}`;
              results[skillId] = computeSkillStatus(skillId);
            }
          }
        }
      } catch (error) {
        console.error("扫描技能目录失败:", error);
      }
    }
    
    return results;
  });

  // 获取技能配置
  ipcMain.handle("skill:getConfig", async (_event, skillId: string) => {
    return getSkillConfig(skillId);
  });

  // 保存技能配置
  ipcMain.handle("skill:saveConfig", async (_event, skillId: string, values: SkillConfigValues) => {
    return saveSkillConfig(skillId, values);
  });

  // 安装技能（从 skills-registry 复制到 skills）
  ipcMain.handle("skill:install", async (_event, skillId: string) => {
    try {
      const skillName = skillId.replace(/^@openclaw\//, "");
      const registryDir = getSkillsRegistryDir();
      const skillsDir = getSkillsDir();
      
      const srcPath = path.join(registryDir, skillName);
      const destPath = path.join(skillsDir, skillName);
      
      console.log(`[skill-ipc] 安装技能: ${skillId}`);
      console.log(`[skill-ipc]   从: ${srcPath}`);
      console.log(`[skill-ipc]   到: ${destPath}`);
      
      if (!fs.existsSync(srcPath)) {
        console.error(`[skill-ipc] 技能不存在: ${srcPath}`);
        return false;
      }
      
      // 复制技能目录
      copyDirSync(srcPath, destPath);
      console.log(`[skill-ipc] 安装成功: ${skillId}`);
      return true;
    } catch (error) {
      console.error(`[skill-ipc] 安装失败: ${skillId}`, error);
      return false;
    }
  });

  // 卸载技能（从 skills 删除）
  ipcMain.handle("skill:uninstall", async (_event, skillId: string) => {
    try {
      const skillName = skillId.replace(/^@openclaw\//, "");
      const skillsDir = getSkillsDir();
      const skillPath = path.join(skillsDir, skillName);
      
      console.log(`[skill-ipc] 卸载技能: ${skillId}`);
      console.log(`[skill-ipc]   删除: ${skillPath}`);
      
      // 删除技能目录
      removeDirSync(skillPath);
      
      // 同时删除配置
      const configPath = getSkillConfigPath(skillId);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      
      console.log(`[skill-ipc] 卸载成功: ${skillId}`);
      return true;
    } catch (error) {
      console.error(`[skill-ipc] 卸载失败: ${skillId}`, error);
      return false;
    }
  });

  // 启用技能
  ipcMain.handle("skill:enable", async (_event, _skillId: string) => {
    // TODO: 实现
  });

  // 禁用技能
  ipcMain.handle("skill:disable", async (_event, _skillId: string) => {
    // TODO: 实现
  });

  // 获取配置字段
  ipcMain.handle("skill:getConfigFields", async (_event, skillId: string) => {
    return generateConfigFields(skillId);
  });
}
