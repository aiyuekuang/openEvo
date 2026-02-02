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
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// 从 checks-runner 导入共享的函数
import {
  getSkillDir as getSkillDirFromRunner,
  runCheckScript,
  runActionScript,
  computeSkillStatusFromChecksSync,
  computeSkillStatusFromChecksAsync,
} from "../skill-marketplace/checks-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// 配置常量
// =============================================================================

/** 脚本执行配置 */
const SCRIPT_CONFIG = {
  /** 检测脚本超时时间 (ms) */
  CHECK_TIMEOUT: 10000,
  /** 操作脚本超时时间 (ms) */
  ACTION_TIMEOUT: 30000,
  /** 认证检测超时时间 (ms) */
  AUTH_TIMEOUT: 10000,
  /** 默认 Shell (只在 macOS 使用) */
  DEFAULT_SHELL: process.platform === "darwin" ? "/bin/zsh" : undefined,
  /** 额外的 PATH 路径前缀 */
  PATH_PREFIX: process.platform === "darwin" 
    ? "/opt/homebrew/bin:/usr/local/bin" 
    : "/usr/local/bin",
} as const;

/** 调试模式 - 生产环境应设为 false */
const DEBUG = process.env.NODE_ENV !== "production";

// =============================================================================
// 类型定义
// =============================================================================

// 完整的 12 状态枚举（与设计文档保持一致）
type SkillStatus =
  | "not_installed"      // 未安装
  | "installing"         // 安装中
  | "needs_deps"         // 需安装依赖
  | "installing_deps"    // 安装依赖中
  | "needs_auth"         // 需登录
  | "needs_config"       // 需配置
  | "configuring"        // 配置中
  | "ready"              // 已就绪
  | "active"             // 运行中
  | "disabled"           // 已禁用
  | "error"              // 错误
  | "unsupported";       // 不支持

type SkillStatusInfo = {
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
  /** 配置项定义 (从 skill.json config 字段读取) */
  configFields?: ConfigField[];
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
};

type SkillConfigValues = Record<string, string | number | boolean>;

type SavedSkillConfig = {
  skillId: string;
  values: SkillConfigValues;
  configuredAt: string;
};

/**
 * 认证检测配置
 */
type AuthCheck = {
  command: string;      // 检测命令
  expect: string;       // 成功时输出匹配的正则
  message: string;      // 失败提示
  action: string;       // 认证命令
  helpUrl?: string;     // 帮助链接
};


// =============================================================================
// 配置驱动检测类型 (新架构)
// =============================================================================

/**
 * 教程/帮助信息
 */
type SkillTutorial = {
  title: string;
  steps: string[];
  tips?: string[];
  helpUrl?: string;
};

/**
 * 检测结果
 */
type CheckResult = {
  passed: boolean;
  message?: string;
  details?: string;
  action?: string;
  tutorial?: SkillTutorial;
  data?: Record<string, unknown>;
};

/**
 * 操作结果
 */
type ActionResult = {
  success: boolean;
  message?: string;
  command?: string;
  openTerminal?: boolean;
  openUrl?: string;
};

/**
 * 检测项输入字段定义
 */
type CheckInputField = {
  key: string;           // 配置键名 (如 GOOGLE_AI_API_KEY)
  type: "text" | "password" | "url" | "number";  // 输入类型
  placeholder?: string;  // 占位符
};

/**
 * 检测项帮助信息
 */
type CheckHelpInfo = {
  description?: string;  // 描述文本
  url?: string;          // 帮助链接
};

/**
 * 检测项定义
 */
type CheckItem = {
  id: string;
  script: string;
  label: string;
  description?: string;
  dependsOn?: string[];
  /** 需要用户输入的配置项 */
  input?: CheckInputField;
  /** 帮助信息 */
  help?: CheckHelpInfo;
};

/**
 * 操作定义
 */
type ActionItem = {
  script: string;
  label: string;
  description?: string;
};

/**
 * 检测状态汇总
 */
type ChecksStatusInfo = {
  allPassed: boolean;
  results: Array<{
    id: string;
    label: string;
    description?: string;
    passed: boolean;
    skipped?: boolean;
    result?: CheckResult;
    /** 需要用户输入的配置项 */
    input?: CheckInputField;
    /** 帮助信息 */
    help?: CheckHelpInfo;
  }>;
  availableActions?: Record<string, ActionItem>;
};

/**
 * 安装方法类型（与 SKILL.md metadata.openclaw.install 对齐）
 * @see https://github.com/openclaw/openclaw/tree/main/skills-registry
 */
type InstallKind = 
  | "uv"      // Python 包 (uv tool install / uvx) - 跨平台
  | "pip"    // Python 包 (pip install) - 跨平台
  | "brew"   // macOS Homebrew - macOS only
  | "apt"    // Debian/Ubuntu apt - Linux only
  | "yum"    // RHEL/CentOS yum - Linux only
  | "dnf"    // Fedora dnf - Linux only
  | "go"     // Go install - 跨平台
  | "npm"    // npm install -g - 跨平台
  | "npx"    // npx (运行时安装) - 跨平台
  | "cargo"  // Rust cargo install - 跨平台
  | "winget" // Windows winget - Windows only
  | "choco"  // Windows Chocolatey - Windows only
  | "scoop"; // Windows Scoop - Windows only

/**
 * 平台类型
 */
type Platform = "darwin" | "linux" | "win32" | "all";

/**
 * 安装方法配置（从 SKILL.md 读取）
 * 
 * 示例：
 * ```json
 * "install": [
 *   { "id": "brew", "kind": "brew", "formula": "1password-cli", "platform": "darwin" },
 *   { "id": "winget", "kind": "winget", "package": "AgileBits.1Password.CLI", "platform": "win32" },
 *   { "id": "apt", "kind": "apt", "package": "1password-cli", "platform": "linux" }
 * ]
 * ```
 */
type InstallMethod = {
  id: string;           // 安装方法 ID
  kind: InstallKind;    // 安装类型
  package?: string;     // 包名（uv/pip/npm/cargo/winget/apt）
  formula?: string;     // Homebrew formula 名
  module?: string;      // Go module 路径
  bins?: string[];      // 安装后提供的命令
  label?: string;       // 显示标签
  platform?: Platform;  // 适用平台（省略则根据 kind 推断）
};

/**
 * 根据 kind 推断默认平台
 */
function getDefaultPlatformForKind(kind: InstallKind): Platform {
  switch (kind) {
    case 'brew': return 'darwin';
    case 'apt':
    case 'yum':
    case 'dnf': return 'linux';
    case 'winget':
    case 'choco':
    case 'scoop': return 'win32';
    // 跨平台工具
    case 'uv':
    case 'pip':
    case 'go':
    case 'npm':
    case 'npx':
    case 'cargo':
    default: return 'all';
  }
}

/**
 * 过滤出适用于当前平台的安装方法
 */
function filterInstallMethodsForPlatform(methods: InstallMethod[]): InstallMethod[] {
  const currentPlatform = process.platform as Platform;
  
  return methods.filter(method => {
    const methodPlatform = method.platform || getDefaultPlatformForKind(method.kind);
    return methodPlatform === 'all' || methodPlatform === currentPlatform;
  });
}

/**
 * 环境变量帮助信息
 */
type EnvHelp = {
  description: string;   // 说明文字
  helpUrl: string;       // 获取教程链接
  placeholder?: string;  // 输入框占位符
};

type SkillOpenClawMetadata = {
  // === 版本信息 ===
  version?: string;                     // 版本号 (semver: "1.0.0")
  minOpenClawVersion?: string;          // 最低兼容的 OpenClaw 版本
  
  // === 显示信息 ===
  emoji?: string;
  category?: string;
  tags?: string[];
  capabilities?: unknown[];
  
  // === 配置字段 ===
  /** 配置项定义 - UI 根据此字段自动生成配置表单 */
  config?: ConfigField[];
  
  // === 配置驱动检测 ===
  /** 检测项列表 */
  checks?: CheckItem[];
  /** 操作定义 */
  actions?: Record<string, ActionItem>;
  
  // === 其他 ===
  install?: InstallMethod[];            // 安装方法列表
  envHelp?: Record<string, EnvHelp>;    // 环境变量帮助信息
};

type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  helpUrl?: string;
};

// API Key 帮助信息配置（全局默认值，优先使用 SKILL.md 中的 envHelp）
const DEFAULT_API_KEY_HELP: Record<string, { description: string; helpUrl: string }> = {
  // 搜索
  BRAVE_SEARCH_API_KEY: {
    description: '免费注册即可获取，每月2000次免费调用',
    helpUrl: 'https://brave.com/search/api/',
  },
  SERPAPI_API_KEY: {
    description: 'SerpAPI 搜索 API，支持 Google/Bing/Baidu 等',
    helpUrl: 'https://serpapi.com/manage-api-key',
  },
  // 大模型 API
  OPENAI_API_KEY: {
    description: 'OpenAI API Key，支持 GPT-4/GPT-3.5',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  ANTHROPIC_API_KEY: {
    description: 'Anthropic Claude API Key',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  DEEPSEEK_API_KEY: {
    description: 'DeepSeek API Key，性价比超高',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  ZHIPU_API_KEY: {
    description: '智谱 GLM API Key',
    helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  QWEN_API_KEY: {
    description: '通义千问 API Key',
    helpUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  DASHSCOPE_API_KEY: {
    description: '阿里云百炼 API Key',
    helpUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  // 第三方服务
  NOTION_API_KEY: {
    description: 'Notion Integration Token',
    helpUrl: 'https://www.notion.so/my-integrations',
  },
  GITHUB_TOKEN: {
    description: 'GitHub Personal Access Token',
    helpUrl: 'https://github.com/settings/tokens',
  },
  // 企业微信/钉钉/飞书
  WECOM_CORPID: {
    description: '企业微信企业 ID',
    helpUrl: 'https://work.weixin.qq.com/wework_admin/frame#profile',
  },
  WECOM_SECRET: {
    description: '企业微信应用 Secret',
    helpUrl: 'https://work.weixin.qq.com/wework_admin/frame#apps',
  },
  DINGTALK_APP_KEY: {
    description: '钉钉应用 AppKey',
    helpUrl: 'https://open-dev.dingtalk.com/fe/app',
  },
  DINGTALK_APP_SECRET: {
    description: '钉钉应用 AppSecret',
    helpUrl: 'https://open-dev.dingtalk.com/fe/app',
  },
  FEISHU_APP_ID: {
    description: '飞书应用 App ID',
    helpUrl: 'https://open.feishu.cn/app',
  },
  FEISHU_APP_SECRET: {
    description: '飞书应用 App Secret',
    helpUrl: 'https://open.feishu.cn/app',
  },
};

// =============================================================================
// 路径工具
// =============================================================================

function getOpenClawConfigPath(): string {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// =============================================================================
// 配置管理 (存储到 openclaw.json 的 skills.entries)
// =============================================================================

type OpenClawConfigFile = {
  skills?: {
    entries?: Record<string, {
      enabled?: boolean;
      env?: Record<string, string>;
      config?: Record<string, unknown>;
      configuredAt?: string;
    }>;
  };
  [key: string]: unknown;
};

/**
 * 读取 openclaw.json 配置文件
 */
function readOpenClawConfig(): OpenClawConfigFile {
  const configPath = getOpenClawConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as OpenClawConfigFile;
    }
  } catch (error) {
    console.error("读取 openclaw.json 失败:", error);
  }
  return {};
}

/**
 * 写入 openclaw.json 配置文件
 */
function writeOpenClawConfig(config: OpenClawConfigFile): void {
  const configPath = getOpenClawConfigPath();
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * 获取技能配置 (从 openclaw.json 的 skills.entries)
 */
function getSkillConfig(skillId: string): SavedSkillConfig | null {
  try {
    const config = readOpenClawConfig();
    const entry = config.skills?.entries?.[skillId];
    if (entry) {
      // 将 env 字段转换为 values 格式
      const values: SkillConfigValues = { ...(entry.env || {}) };
      return {
        skillId,
        values,
        configuredAt: entry.configuredAt || new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error(`读取技能配置失败: ${skillId}`, error);
  }
  return null;
}

/**
 * 保存技能配置 (到 openclaw.json 的 skills.entries)
 */
function saveSkillConfig(skillId: string, values: SkillConfigValues): SavedSkillConfig {
  const config = readOpenClawConfig();
  
  // 确保 skills.entries 存在
  if (!config.skills) {
    config.skills = {};
  }
  if (!config.skills.entries) {
    config.skills.entries = {};
  }
  
  // 保存配置
  const existingEntry = config.skills.entries[skillId] || {};
  config.skills.entries[skillId] = {
    ...existingEntry,
    enabled: existingEntry.enabled ?? true,
    env: values as Record<string, string>,
    configuredAt: new Date().toISOString(),
  };
  
  writeOpenClawConfig(config);
  
  return {
    skillId,
    values,
    configuredAt: config.skills.entries[skillId].configuredAt!,
  };
}

/**
 * 获取技能的配置值 (供 check 脚本使用)
 * 优先级: 环境变量 > openclaw.json 配置
 */
function getSkillEnvValue(skillId: string, key: string): string | undefined {
  // 先检查环境变量
  if (process.env[key]) {
    return process.env[key];
  }
  // 再检查技能配置
  const config = getSkillConfig(skillId);
  if (config?.values[key]) {
    return String(config.values[key]);
  }
  return undefined;
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

/**
 * 获取登录 shell 用于执行命令
 */
function getLoginShell(): string {
  const shell = process.env.SHELL?.trim();
  return shell && shell.length > 0 ? shell : (SCRIPT_CONFIG.DEFAULT_SHELL || "/bin/sh");
}

/**
 * 检测 CLI 工具的认证状态
 * @param auth 认证检测配置
 * @returns 认证结果
 */
function checkAuthStatus(auth: AuthCheck): { authenticated: boolean; output?: string } {
  try {
    // 使用登录 shell 执行命令，确保加载用户的环境变量和认证信息
    const shell = getLoginShell();
    const output = execSync(`${shell} -l -c '${auth.command.replace(/'/g, "'\\''")}' 2>&1`, { 
      encoding: "utf-8",
      timeout: SCRIPT_CONFIG.AUTH_TIMEOUT,
      env: { ...process.env, HOME: os.homedir() },
    });
    
    // 检查输出是否匹配期望的正则
    const regex = new RegExp(auth.expect, "i");
    const authenticated = regex.test(output);
    
    if (DEBUG) console.log(`[auth-check] ${auth.command} -> ${authenticated ? "OK" : "FAIL"} (shell: ${shell})`);
    if (DEBUG && !authenticated) {
      console.log(`[auth-check] output: ${output.substring(0, 200)}`);
    }
    return { authenticated, output };
  } catch (error) {
    // 命令执行失败通常表示未认证
    const errMsg = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.log(`[auth-check] ${auth.command} -> ERROR: ${errMsg}`);
    return { authenticated: false };
  }
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
  
  // 优先尝试 skill.json (新格式)
  let skillJsonPath = path.join(skillsDir, skillName, "skill.json");
  if (!fs.existsSync(skillJsonPath)) {
    skillJsonPath = path.join(registryDir, skillName, "skill.json");
  }
  
  // 尝试从 skill.json 读取
  if (fs.existsSync(skillJsonPath)) {
    try {
      const content = fs.readFileSync(skillJsonPath, "utf-8");
      const manifest = JSON.parse(content);
      
      // 转换为 SkillOpenClawMetadata 格式
      return {
        version: manifest.version,
        emoji: manifest.emoji,
        // 配置字段
        config: manifest.config,
        // 配置驱动检测
        checks: manifest.checks,
        actions: manifest.actions,
        // 安装方法
        install: manifest.install,
        // 其他
        category: manifest.category,
        tags: manifest.tags,
        capabilities: manifest.capabilities,
        minOpenClawVersion: manifest.minOpenClawVersion,
      };
    } catch (error) {
      console.error(`解析 skill.json 失败: ${skillId}`, error);
    }
  }
  
  // 回退: 尝试从 SKILL.md frontmatter 读取 (旧格式)
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
// 脚本执行 - 使用 checks-runner.ts 中的共享实现
// =============================================================================

// runCheckScript 和 runActionScript 已从 checks-runner.ts 导入

// =============================================================================
// 状态计算 - 使用 checks-runner.ts 中的共享实现
// =============================================================================

/**
 * 获取技能目录路径 (包装 checks-runner 的函数，传入本地路径)
 */
function getSkillDir(skillId: string): string {
  const skillsDir = getSkillsDir();
  const registryDir = getSkillsRegistryDir();
  return getSkillDirFromRunner(skillId, skillsDir, registryDir);
}

/**
 * 计算技能状态
 */
function computeSkillStatus(skillId: string): SkillStatusInfo {
  const metadata = parseSkillMetadata(skillId);

  if (!metadata) {
    // 无元数据，默认为就绪
    return { status: "ready", installed: true, enabled: true };
  }

  // 使用 checks 格式 (配置驱动检测)
  if (metadata.checks && metadata.checks.length > 0) {
    const skillDir = getSkillDir(skillId);
    const checksResult = computeSkillStatusFromChecksSync(skillDir, metadata.checks, metadata.actions);

    // 转换为本地 SkillStatusInfo 类型
    const statusInfo: SkillStatusInfo = {
      status: checksResult.status as SkillStatus,
      installed: checksResult.installed,
      enabled: checksResult.enabled,
      message: checksResult.message,
      checksInfo: checksResult.checksInfo as ChecksStatusInfo,
      auth: checksResult.auth,
    };

    // 添加 configFields
    if (metadata.config && metadata.config.length > 0) {
      statusInfo.configFields = metadata.config;
    }
    // 添加 installMethods (从 metadata.install 读取)
    if (metadata.install && metadata.install.length > 0) {
      statusInfo.installMethods = filterInstallMethodsForPlatform(metadata.install);
    }
    return statusInfo;
  }

  // 无 checks 定义，默认为就绪
  const result: SkillStatusInfo = { status: "ready", installed: true, enabled: true };
  // 添加 configFields
  if (metadata.config && metadata.config.length > 0) {
    result.configFields = metadata.config;
  }
  return result;
}

// =============================================================================
// 配置字段生成
// =============================================================================

function generateConfigFields(skillId: string): ConfigField[] {
  // 配置字段现在由 check 脚本动态生成
  // 这里返回空数组，UI 应当使用 checksInfo 中的信息
  return [];
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
    if (DEBUG) console.log("[skill-ipc] getAllStatuses called, skillIds:", skillIds?.length);
    const results: Record<string, SkillStatusInfo> = {};
    
    // 如果传入了 skillIds，只检测这些技能
    if (skillIds && skillIds.length > 0) {
      for (const skillId of skillIds) {
        const status = computeSkillStatus(skillId);
        results[skillId] = status;
        if (DEBUG && status.status !== "ready") {
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
      
      if (DEBUG) {
        console.log(`[skill-ipc] 安装技能: ${skillId}`);
        console.log(`[skill-ipc]   从: ${srcPath}`);
        console.log(`[skill-ipc]   到: ${destPath}`);
      }
      
      if (!fs.existsSync(srcPath)) {
        console.error(`[skill-ipc] 技能不存在: ${srcPath}`);
        return false;
      }
      
      // 复制技能目录
      copyDirSync(srcPath, destPath);
      if (DEBUG) console.log(`[skill-ipc] 安装成功: ${skillId}`);
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
      
      if (DEBUG) {
        console.log(`[skill-ipc] 卸载技能: ${skillId}`);
        console.log(`[skill-ipc]   删除: ${skillPath}`);
      }
      
      // 删除技能目录
      removeDirSync(skillPath);
      
      // 从 openclaw.json 中删除配置
      try {
        const config = readOpenClawConfig();
        if (config.skills?.entries?.[skillId]) {
          delete config.skills.entries[skillId];
          writeOpenClawConfig(config);
        }
      } catch {
        // 忽略配置删除错误
      }
      
      if (DEBUG) console.log(`[skill-ipc] 卸载成功: ${skillId}`);
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
  
  // 获取详细检测状态 (配置驱动检测新架构)
  ipcMain.handle("skill:getChecksStatus", async (_event, skillId: string) => {
    const metadata = parseSkillMetadata(skillId);

    if (!metadata?.checks || metadata.checks.length === 0) {
      // 无 checks 定义，返回空
      return null;
    }

    // 执行异步检测，返回每个检测项的详细结果
    const skillDir = getSkillDir(skillId);
    return computeSkillStatusFromChecksAsync(skillDir, metadata.checks, metadata.actions);
  });
  
  // 执行 action 脚本 (配置驱动检测新架构)
  ipcMain.handle("skill:runAction", async (_event, skillId: string, actionId: string) => {
    const metadata = parseSkillMetadata(skillId);
    
    if (!metadata?.actions || !metadata.actions[actionId]) {
      return { success: false, message: `未找到 action: ${actionId}` };
    }
    
    const action = metadata.actions[actionId];
    const skillDir = getSkillDir(skillId);
    
    return runActionScript(skillDir, action.script);
  });

  // 获取已安装的技能列表（从文件系统检测）
  ipcMain.handle("skill:getInstalled", async () => {
    const installed: string[] = [];
    const skillsDir = getSkillsDir();
    
    try {
      if (fs.existsSync(skillsDir)) {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== '.gitkeep') {
            installed.push(`@openclaw/${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.error("[获取已安装技能失败]", error);
    }
    
    return installed;
  });

  // 检查单个技能是否已安装
  ipcMain.handle("skill:isInstalled", async (_event, skillId: string) => {
    const skillName = skillId.replace(/^@openclaw\//, "");
    const skillsDir = getSkillsDir();
    const skillPath = path.join(skillsDir, skillName);
    return fs.existsSync(skillPath);
  });

  // 安装依赖（配置驱动，根据 install.kind 使用正确的安装命令）
  // 支持两种调用方式：
  // 1. 新方式：传入 InstallMethod[] 数组（推荐）
  // 2. 旧方式：传入 string[] bins 名称（兼容，回退到系统包管理器）
  ipcMain.handle("skill:installDeps", async (event, installMethods: InstallMethod[] | string[]) => {
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const webContents = event.sender;
    
    // 发送日志到前端
    const sendLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
      webContents.send('skill:installLog', { message, type, timestamp: Date.now() });
    };
    
    // 检查命令是否存在
    const checkCmd = (cmd: string): boolean => {
      try {
        const checkCommand = isWindows ? `where ${cmd}` : `which ${cmd}`;
        execSync(checkCommand, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };
    
    // 使用 spawn 执行命令，实时输出
    const runCommand = (cmd: string, args: string[]): Promise<void> => {
      return new Promise((resolve, reject) => {
        sendLog(`$ ${cmd} ${args.join(' ')}`, 'info');
        
        const child = spawn(cmd, args, {
          shell: isWindows,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
        
        child.stdout?.on('data', (data) => {
          const lines = data.toString().split('\n').filter((l: string) => l.trim());
          lines.forEach((line: string) => sendLog(line, 'info'));
        });
        
        child.stderr?.on('data', (data) => {
          const lines = data.toString().split('\n').filter((l: string) => l.trim());
          lines.forEach((line: string) => sendLog(line, 'error'));
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`命令退出码: ${code}`));
          }
        });
        
        child.on('error', (err) => {
          reject(err);
        });
      });
    };
    
    // 根据 InstallMethod.kind 获取安装命令
    const getInstallCommand = (method: InstallMethod): { cmd: string; args: string[]; checkBin: string } | null => {
      const pkg = method.package || method.formula || method.module || '';
      const checkBin = method.bins?.[0] || pkg;
      
      switch (method.kind) {
        case 'uv':
          // Python 包使用 uv tool install
          if (!checkCmd('uv')) {
            sendLog('⚠ 未检测到 uv，尝试使用 pip 安装...', 'info');
            if (checkCmd('pip3')) {
              return { cmd: 'pip3', args: ['install', pkg], checkBin };
            } else if (checkCmd('pip')) {
              return { cmd: 'pip', args: ['install', pkg], checkBin };
            }
            return null;
          }
          return { cmd: 'uv', args: ['tool', 'install', pkg], checkBin };
          
        case 'pip':
          if (checkCmd('pip3')) {
            return { cmd: 'pip3', args: ['install', pkg], checkBin };
          } else if (checkCmd('pip')) {
            return { cmd: 'pip', args: ['install', pkg], checkBin };
          }
          return null;
          
        case 'brew':
          if (platform !== 'darwin' || !checkCmd('brew')) return null;
          return { cmd: 'brew', args: ['install', method.formula || pkg], checkBin };
          
        case 'apt':
          if (platform !== 'linux' || !checkCmd('apt-get')) return null;
          return { cmd: 'sudo', args: ['apt-get', 'install', '-y', pkg], checkBin };
          
        case 'yum':
          if (platform !== 'linux' || !checkCmd('yum')) return null;
          return { cmd: 'sudo', args: ['yum', 'install', '-y', pkg], checkBin };
          
        case 'dnf':
          if (platform !== 'linux' || !checkCmd('dnf')) return null;
          return { cmd: 'sudo', args: ['dnf', 'install', '-y', pkg], checkBin };
          
        case 'go':
          if (!checkCmd('go')) return null;
          return { cmd: 'go', args: ['install', method.module || pkg], checkBin };
          
        case 'npm':
          if (!checkCmd('npm')) return null;
          return { cmd: 'npm', args: ['install', '-g', pkg], checkBin };
          
        case 'npx':
          // npx 是运行时安装，不需要预安装
          if (!checkCmd('npx')) return null;
          sendLog(`ℹ ${pkg} 使用 npx 运行时安装，无需预安装`, 'info');
          return null;
          
        case 'cargo':
          if (!checkCmd('cargo')) return null;
          return { cmd: 'cargo', args: ['install', pkg], checkBin };
          
        case 'winget':
          if (platform !== 'win32' || !checkCmd('winget')) return null;
          return { cmd: 'winget', args: ['install', '--id', pkg, '-e', '--accept-source-agreements', '--accept-package-agreements'], checkBin };
          
        case 'choco':
          if (platform !== 'win32' || !checkCmd('choco')) return null;
          return { cmd: 'choco', args: ['install', pkg, '-y'], checkBin };
          
        case 'scoop':
          if (platform !== 'win32' || !checkCmd('scoop')) return null;
          return { cmd: 'scoop', args: ['install', pkg], checkBin };
          
        default:
          return null;
      }
    };
    
    // 获取手动安装命令（用于安装失败时提示用户）
    const getManualInstallCommand = (method: InstallMethod): string => {
      const pkg = method.package || method.formula || method.module || method.id;
      switch (method.kind) {
        case 'uv': return `uv tool install ${pkg}`;
        case 'pip': return `pip install ${pkg}`;
        case 'brew': return `brew install ${method.formula || pkg}`;
        case 'apt': return `sudo apt-get install ${pkg}`;
        case 'yum': return `sudo yum install ${pkg}`;
        case 'dnf': return `sudo dnf install ${pkg}`;
        case 'go': return `go install ${method.module || pkg}`;
        case 'npm': return `npm install -g ${pkg}`;
        case 'npx': return `npx ${pkg}`;
        case 'cargo': return `cargo install ${pkg}`;
        case 'winget': return `winget install ${pkg}`;
        case 'choco': return `choco install ${pkg}`;
        case 'scoop': return `scoop install ${pkg}`;
        default: return `# 请手动安装 ${pkg}`;
      }
    };
    
    // 兼容旧的 bins 数组调用方式
    const isLegacyMode = Array.isArray(installMethods) && installMethods.length > 0 && typeof installMethods[0] === 'string';
    
    if (isLegacyMode) {
      // 旧方式：使用系统默认包管理器
      const bins = installMethods as string[];
      if (DEBUG) console.log(`[skill-ipc] 安装依赖 (legacy mode): ${bins.join(', ')}`);
      sendLog('⚠ 使用系统默认包管理器安装（建议更新技能元数据以获得更好的安装体验）', 'info');
      
      // 检测系统默认包管理器（按平台进行检测）
      let defaultPm: { name: string; cmd: string; args: (pkg: string) => string[] } | null = null;
      
      if (platform === 'darwin') {
        // macOS: Homebrew
        if (checkCmd('brew')) {
          defaultPm = { name: 'Homebrew', cmd: 'brew', args: (pkg) => ['install', pkg] };
        }
      } else if (platform === 'linux') {
        // Linux: apt > dnf > yum
        if (checkCmd('apt-get')) {
          defaultPm = { name: 'apt', cmd: 'sudo', args: (pkg) => ['apt-get', 'install', '-y', pkg] };
        } else if (checkCmd('dnf')) {
          defaultPm = { name: 'dnf', cmd: 'sudo', args: (pkg) => ['dnf', 'install', '-y', pkg] };
        } else if (checkCmd('yum')) {
          defaultPm = { name: 'yum', cmd: 'sudo', args: (pkg) => ['yum', 'install', '-y', pkg] };
        }
      } else if (platform === 'win32') {
        // Windows: winget > choco > scoop
        if (checkCmd('winget')) {
          defaultPm = { name: 'winget', cmd: 'winget', args: (pkg) => ['install', '--id', pkg, '-e', '--accept-source-agreements', '--accept-package-agreements'] };
        } else if (checkCmd('choco')) {
          defaultPm = { name: 'Chocolatey', cmd: 'choco', args: (pkg) => ['install', pkg, '-y'] };
        } else if (checkCmd('scoop')) {
          defaultPm = { name: 'Scoop', cmd: 'scoop', args: (pkg) => ['install', pkg] };
        }
      }
      
      if (!defaultPm) {
        return { success: false, error: '未找到系统包管理器', manualCommands: bins.map(b => `# 请手动安装 ${b}`) };
      }
      
      sendLog(`检测到包管理器: ${defaultPm.name}`, 'info');
      
      for (const bin of bins) {
        if (checkCmd(bin)) {
          sendLog(`✓ ${bin} 已安装，跳过`, 'success');
          continue;
        }
        try {
          sendLog(`正在安装 ${bin}...`, 'info');
          await runCommand(defaultPm.cmd, defaultPm.args(bin));
          sendLog(`✓ ${bin} 安装成功`, 'success');
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          sendLog(`✗ 安装 ${bin} 失败: ${errMsg}`, 'error');
          return { 
            success: false, 
            error: `安装 ${bin} 失败: ${errMsg}`,
            manualCommands: [`${defaultPm.cmd} ${defaultPm.args(bin).join(' ')}`]
          };
        }
      }
      
      sendLog('全部依赖安装完成！', 'success');
      return { success: true };
    }
    
    // 新方式：使用 InstallMethod 配置
    const methods = installMethods as InstallMethod[];
    if (DEBUG) console.log(`[skill-ipc] 安装依赖 (config-driven): ${methods.map(m => m.id).join(', ')}`);
    
    const manualCommands: string[] = [];
    
    for (const method of methods) {
      const label = method.label || method.package || method.formula || method.id;
      const checkBin = method.bins?.[0] || '';
      
      // 检查是否已安装
      if (checkBin && checkCmd(checkBin)) {
        sendLog(`✓ ${label} 已安装，跳过`, 'success');
        continue;
      }
      
      // 获取安装命令
      const installCmd = getInstallCommand(method);
      
      if (!installCmd) {
        // 无法自动安装，记录手动命令
        const manualCmd = getManualInstallCommand(method);
        sendLog(`⚠ 无法自动安装 ${label}，需要手动安装`, 'error');
        manualCommands.push(manualCmd);
        continue;
      }
      
      try {
        sendLog(`正在安装 ${label} (${method.kind})...`, 'info');
        await runCommand(installCmd.cmd, installCmd.args);
        sendLog(`✓ ${label} 安装成功`, 'success');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        sendLog(`✗ 安装 ${label} 失败: ${errMsg}`, 'error');
        const manualCmd = getManualInstallCommand(method);
        return { 
          success: false, 
          error: `安装 ${label} 失败: ${errMsg}`,
          manualCommands: [manualCmd]
        };
      }
    }
    
    if (manualCommands.length > 0) {
      return { success: false, error: '部分依赖需要手动安装', manualCommands };
    }
    
    sendLog('全部依赖安装完成！', 'success');
    return { success: true };
  });

  // 在系统终端中执行认证命令
  ipcMain.handle("skill:runAuthCommand", async (_event, command: string) => {
    const platform = process.platform;
    
    if (DEBUG) console.log(`[skill-ipc] 在终端执行认证命令: ${command}`);
    
    try {
      if (platform === 'darwin') {
        // macOS: 使用 osascript 打开 Terminal.app 并执行命令
        const script = `
          tell application "Terminal"
            activate
            do script "${command.replace(/"/g, '\\"')}"
          end tell
        `;
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
        return { success: true };
      } else if (platform === 'linux') {
        // Linux: 尝试 gnome-terminal, konsole, xterm
        const terminals = [
          { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', `${command}; exec bash`] },
          { cmd: 'konsole', args: ['-e', 'bash', '-c', `${command}; exec bash`] },
          { cmd: 'xterm', args: ['-e', `bash -c "${command}; exec bash"`] },
        ];
        
        for (const term of terminals) {
          try {
            execSync(`which ${term.cmd}`, { stdio: 'ignore' });
            spawn(term.cmd, term.args, { detached: true, stdio: 'ignore' }).unref();
            return { success: true };
          } catch {
            continue;
          }
        }
        return { success: false, error: '未找到可用的终端模拟器' };
      } else if (platform === 'win32') {
        // Windows: 使用 cmd 打开新窗口
        spawn('cmd', ['/c', 'start', 'cmd', '/k', command], { detached: true, stdio: 'ignore' }).unref();
        return { success: true };
      }
      
      return { success: false, error: '不支持的平台' };
    } catch (error) {
      console.error('[skill-ipc] 打开终端失败:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
