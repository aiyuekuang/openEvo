/**
 * 依赖检测器
 *
 * 检测技能所需的 CLI 工具和环境变量是否满足
 *
 * @module skill-marketplace/dependency-checker
 */

import { execSync } from "node:child_process";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  SkillInstallOption,
  SkillOpenClawMetadata,
  RequirementItem,
  Platform,
  BinRequirement,
  AnyBinRequirement,
  VersionRequirement,
  ServiceRequirement,
  FileRequirement,
  AuthRequirement,
  EnvRequirement,
  PlatformRequirement,
  SkillDependencyRequirement,
  ScriptRequirement,
} from "./skill-metadata.js";
import { getRequirements } from "./skill-metadata.js";
import { runCheckScript, isScriptPathSafe } from "./script-runner.js";

// AuthCheck 类型用于返回结果
type AuthCheck = AuthRequirement;

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 认证检测结果
 */
export type AuthCheckResult = {
  /** 是否通过认证 */
  authenticated: boolean;
  /** 认证失败的信息 */
  authInfo?: AuthCheck;
};

/**
 * 依赖检测结果
 */
export type DependencyCheckResult = {
  /** 是否满足所有依赖 */
  satisfied: boolean;
  /** 缺失的 CLI 工具 */
  missingBins: string[];
  /** 缺失的环境变量 */
  missingEnv: string[];
  /** 缺失的配置项 */
  missingConfig: string[];
  /** 已安装的 CLI 工具 */
  installedBins: string[];
  /** 已配置的环境变量 */
  configuredEnv: string[];
  /** 当前系统是否支持 */
  osSupported: boolean;
  /** 可用的安装选项 */
  availableInstalls: SkillInstallOption[];
  /** 认证失败信息 (当 CLI 未登录时) */
  authFailed?: AuthCheck;
};

// =============================================================================
// CLI 工具检测
// =============================================================================

/**
 * 检测 CLI 工具是否存在
 */
export function checkBinExists(bin: string): boolean {
  try {
    const cmd = os.platform() === "win32" ? `where ${bin}` : `which ${bin}`;
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 批量检测 CLI 工具
 */
export function checkBins(bins: string[]): { installed: string[]; missing: string[] } {
  const installed: string[] = [];
  const missing: string[] = [];

  for (const bin of bins) {
    if (checkBinExists(bin)) {
      installed.push(bin);
    } else {
      missing.push(bin);
    }
  }

  return { installed, missing };
}

/**
 * 检测任一 CLI 工具是否存在
 */
export function checkAnyBinExists(bins: string[]): { found: string | null; checked: string[] } {
  for (const bin of bins) {
    if (checkBinExists(bin)) {
      return { found: bin, checked: bins };
    }
  }
  return { found: null, checked: bins };
}

// =============================================================================
// 认证检测
// =============================================================================

/**
 * 检测 CLI 工具是否已认证/登录
 * 
 * @param auth - 认证检测配置
 * @returns 认证检测结果
 */
export function checkAuth(auth: AuthCheck | undefined): AuthCheckResult {
  if (!auth) {
    return { authenticated: true };
  }

  try {
    // 执行认证检测命令
    const output = execSync(auth.command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000, // 10 秒超时
    });

    // 检查输出是否匹配期望的正则
    const regex = new RegExp(auth.expect, "i");
    if (regex.test(output)) {
      return { authenticated: true };
    }

    // 输出不匹配，认证失败
    return {
      authenticated: false,
      authInfo: auth,
    };
  } catch {
    // 命令执行失败，认证失败
    return {
      authenticated: false,
      authInfo: auth,
    };
  }
}

// =============================================================================
// 环境变量检测
// =============================================================================

/**
 * 检测环境变量是否存在
 */
export function checkEnvExists(envVar: string): boolean {
  return process.env[envVar] !== undefined && process.env[envVar] !== "";
}

/**
 * 批量检测环境变量
 */
export function checkEnvVars(envVars: string[]): { configured: string[]; missing: string[] } {
  const configured: string[] = [];
  const missing: string[] = [];

  for (const envVar of envVars) {
    if (checkEnvExists(envVar)) {
      configured.push(envVar);
    } else {
      missing.push(envVar);
    }
  }

  return { configured, missing };
}

// =============================================================================
// 操作系统检测
// =============================================================================

/**
 * 获取当前操作系统类型
 */
export function getCurrentOS(): "darwin" | "linux" | "win32" {
  const platform = os.platform();
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  // 默认返回 linux
  return "linux";
}

/**
 * 检测操作系统是否支持
 */
export function checkOSSupported(supportedOS?: ("darwin" | "linux" | "win32")[]): boolean {
  if (!supportedOS || supportedOS.length === 0) {
    return true; // 未指定则默认支持所有系统
  }
  return supportedOS.includes(getCurrentOS());
}

/**
 * 过滤当前系统可用的安装选项
 */
export function filterInstallOptions(options: SkillInstallOption[]): SkillInstallOption[] {
  const currentOS = getCurrentOS();
  return options.filter((opt) => {
    if (!opt.os || opt.os.length === 0) {
      return true; // 未指定则默认支持所有系统
    }
    return opt.os.includes(currentOS);
  });
}

// =============================================================================
// 综合检测
// =============================================================================

// =============================================================================
// 版本检测
// =============================================================================

/**
 * 比较版本号
 * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((x) => parseInt(x, 10) || 0);
  const partsB = b.split(".").map((x) => parseInt(x, 10) || 0);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return 0;
}

/**
 * 获取 CLI 工具版本
 */
export function getBinVersion(bin: string, versionCommand?: string): string | null {
  try {
    const cmd = versionCommand || `${bin} --version`;
    const output = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
    // 提取版本号 (xx.xx.xx 格式)
    const match = output.match(/(\d+\.\d+(?:\.\d+)?)/); 
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 检测 CLI 版本是否满足要求
 */
export function checkVersionSatisfied(bin: string, minVersion: string, versionCommand?: string): boolean {
  const currentVersion = getBinVersion(bin, versionCommand);
  if (!currentVersion) {
    return false;
  }
  return compareVersions(currentVersion, minVersion) >= 0;
}

// =============================================================================
// 文件检测
// =============================================================================

/**
 * 展开 ~ 路径
 */
export function expandPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * 检测文件是否存在
 */
export function checkFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(expandPath(filePath));
  } catch {
    return false;
  }
}

// =============================================================================
// 服务检测
// =============================================================================

/**
 * 检测服务是否运行
 */
export function checkServiceRunning(command: string, expect?: string): boolean {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    if (expect) {
      const regex = new RegExp(expect, "i");
      return regex.test(output);
    }
    return true; // 命令执行成功即表示服务运行
  } catch {
    return false;
  }
}

// =============================================================================
// 新结构检测（RequirementItem 数组）
// =============================================================================

/**
 * 单个检测项的结果
 */
export type RequirementCheckResult = {
  /** 检测项类型 */
  type: RequirementItem["type"];
  /** 是否通过 */
  passed: boolean;
  /** 提示消息 */
  message?: string;
  /** 安装选项 (仅 bin/anyBin/version) */
  install?: SkillInstallOption[];
  /** 认证信息 (仅 auth) */
  authInfo?: AuthRequirement;
  /** 环境变量信息 (仅 env) */
  envInfo?: EnvRequirement;
  /** 服务信息 (仅 service) */
  serviceInfo?: ServiceRequirement;
  /** 文件信息 (仅 file) */
  fileInfo?: FileRequirement;
  /** 技能依赖信息 (仅 skill) */
  skillInfo?: SkillDependencyRequirement;
  /** 脚本信息 (仅 script) */
  scriptInfo?: ScriptRequirement;
};

/**
 * 新结构检测结果
 */
export type RequirementsCheckResult = {
  /** 所有检测是否通过 */
  allPassed: boolean;
  /** 第一个失败的检测项 */
  firstFailed?: RequirementCheckResult;
  /** 所有检测结果 */
  results: RequirementCheckResult[];
  /** 快速查询: 缺失的 CLI */
  missingBins: string[];
  /** 快速查询: 缺失的环境变量 */
  missingEnv: string[];
  /** 快速查询: 认证失败 */
  authFailed?: AuthRequirement;
};

/**
 * 检测单个 RequirementItem
 */
export function checkRequirementItem(
  item: RequirementItem,
  installedSkills?: string[]
): RequirementCheckResult {
  switch (item.type) {
    case "platform": {
      const supported = checkOSSupported(item.os);
      return {
        type: "platform",
        passed: supported,
        message: supported ? undefined : item.message,
      };
    }

    case "bin": {
      const exists = checkBinExists(item.name);
      return {
        type: "bin",
        passed: exists,
        message: exists ? undefined : item.message,
        install: exists ? undefined : filterInstallOptions(item.install || []),
      };
    }

    case "anyBin": {
      const { found } = checkAnyBinExists(item.names);
      return {
        type: "anyBin",
        passed: !!found,
        message: found ? undefined : item.message,
        install: found ? undefined : filterInstallOptions(item.install || []),
      };
    }

    case "version": {
      // 先检测工具是否存在
      if (!checkBinExists(item.bin)) {
        return {
          type: "version",
          passed: false,
          message: `${item.bin} 未安装`,
          install: filterInstallOptions(item.install || []),
        };
      }
      const satisfied = checkVersionSatisfied(item.bin, item.minVersion, item.command);
      return {
        type: "version",
        passed: satisfied,
        message: satisfied ? undefined : item.message,
        install: satisfied ? undefined : filterInstallOptions(item.install || []),
      };
    }

    case "service": {
      const running = checkServiceRunning(item.command, item.expect);
      return {
        type: "service",
        passed: running,
        message: running ? undefined : item.message,
        serviceInfo: running ? undefined : item,
      };
    }

    case "file": {
      const exists = checkFileExists(item.path);
      return {
        type: "file",
        passed: exists,
        message: exists ? undefined : item.message,
        fileInfo: exists ? undefined : item,
      };
    }

    case "auth": {
      const authResult = checkAuth(item);
      return {
        type: "auth",
        passed: authResult.authenticated,
        message: authResult.authenticated ? undefined : item.message,
        authInfo: authResult.authenticated ? undefined : item,
      };
    }

    case "env": {
      const exists = checkEnvExists(item.name);
      return {
        type: "env",
        passed: exists,
        message: exists ? undefined : item.message,
        envInfo: exists ? undefined : item,
      };
    }

    case "skill": {
      const installed = installedSkills?.includes(item.skillId) ?? false;
      return {
        type: "skill",
        passed: installed,
        message: installed ? undefined : item.message,
        skillInfo: installed ? undefined : item,
      };
    }

    case "script": {
      // script 类型需要异步检测，返回 pending 状态
      // 实际检测由 checkRequirementItemAsync 处理
      return {
        type: "script",
        passed: true, // 同步版本跳过，需要使用异步版本
        message: undefined,
        scriptInfo: item,
      };
    }

    default:
      return {
        type: (item as RequirementItem).type,
        passed: true,
      };
  }
}

/**
 * 异步检测单个 RequirementItem
 * 
 * 支持 script 类型的异步检测
 */
export async function checkRequirementItemAsync(
  item: RequirementItem,
  skillDir: string,
  installedSkills?: string[]
): Promise<RequirementCheckResult> {
  // 对于 script 类型，执行异步检测
  if (item.type === "script") {
    // 检查路径安全性
    if (!isScriptPathSafe(skillDir, item.path)) {
      return {
        type: "script",
        passed: false,
        message: `不安全的脚本路径: ${item.path}`,
        scriptInfo: item,
      };
    }

    // 执行检测脚本
    const scriptResult = await runCheckScript(skillDir, item.path);
    return {
      type: "script",
      passed: scriptResult.passed,
      message: scriptResult.passed ? undefined : (scriptResult.message ?? item.message),
      scriptInfo: scriptResult.passed ? undefined : item,
    };
  }

  // 其他类型使用同步检测
  return checkRequirementItem(item, installedSkills);
}

/**
 * 异步检测所有 RequirementItem
 * 
 * 支持 script 类型的异步检测
 */
export async function checkRequirementsAsync(
  requirements: RequirementItem[],
  skillDir: string,
  installedSkills?: string[]
): Promise<RequirementsCheckResult> {
  const results: RequirementCheckResult[] = [];
  const missingBins: string[] = [];
  const missingEnv: string[] = [];
  let firstFailed: RequirementCheckResult | undefined;
  let authFailed: AuthRequirement | undefined;

  for (const item of requirements) {
    const result = await checkRequirementItemAsync(item, skillDir, installedSkills);
    results.push(result);

    if (!result.passed) {
      if (!firstFailed) {
        firstFailed = result;
      }

      // 收集缺失信息
      if (result.type === "bin" && "name" in item) {
        missingBins.push(item.name);
      } else if (result.type === "anyBin" && "names" in item) {
        missingBins.push(`(任一) ${item.names.join(" / ")}`);
      } else if (result.type === "env" && "name" in item) {
        missingEnv.push(item.name);
      } else if (result.type === "auth" && result.authInfo) {
        authFailed = result.authInfo;
      }
    }
  }

  return {
    allPassed: !firstFailed,
    firstFailed,
    results,
    missingBins,
    missingEnv,
    authFailed,
  };
}

/**
 * 检测所有 RequirementItem (同步版本)
 * 
 * 按数组顺序检测，遇到第一个失败即返回
 * 注意: script 类型会被跳过，需要使用 checkRequirementsAsync
 */
export function checkRequirements(
  requirements: RequirementItem[],
  installedSkills?: string[]
): RequirementsCheckResult {
  const results: RequirementCheckResult[] = [];
  const missingBins: string[] = [];
  const missingEnv: string[] = [];
  let firstFailed: RequirementCheckResult | undefined;
  let authFailed: AuthRequirement | undefined;

  for (const item of requirements) {
    const result = checkRequirementItem(item, installedSkills);
    results.push(result);

    if (!result.passed) {
      if (!firstFailed) {
        firstFailed = result;
      }

      // 收集缺失信息
      if (result.type === "bin" && "name" in item) {
        missingBins.push(item.name);
      } else if (result.type === "anyBin" && "names" in item) {
        missingBins.push(`(任一) ${item.names.join(" / ")}`);
      } else if (result.type === "env" && "name" in item) {
        missingEnv.push(item.name);
      } else if (result.type === "auth" && result.authInfo) {
        authFailed = result.authInfo;
      }
    }
  }

  return {
    allPassed: !firstFailed,
    firstFailed,
    results,
    missingBins,
    missingEnv,
    authFailed,
  };
}

// =============================================================================
// 综合检测
// =============================================================================

/**
 * 检测技能的所有依赖
 */
export function checkDependencies(
  requires: RequirementItem[] | undefined,
  metadata?: SkillOpenClawMetadata,
  installedSkills?: string[]
): DependencyCheckResult {
  const result: DependencyCheckResult = {
    satisfied: true,
    missingBins: [],
    missingEnv: [],
    missingConfig: [],
    installedBins: [],
    configuredEnv: [],
    osSupported: true,
    availableInstalls: [],
  };

  // 获取 RequirementItem 数组
  const requirements: RequirementItem[] = metadata
    ? getRequirements(metadata)
    : (requires ?? []);

  if (requirements.length === 0) {
    return result;
  }

  // 使用新检测逻辑
  const checkResult = checkRequirements(requirements, installedSkills);

  result.satisfied = checkResult.allPassed;
  result.missingBins = checkResult.missingBins;
  result.missingEnv = checkResult.missingEnv;
  
  if (checkResult.authFailed) {
    result.authFailed = checkResult.authFailed;
  }

  // 收集安装选项
  for (const r of checkResult.results) {
    if (!r.passed && r.install && r.install.length > 0) {
      result.availableInstalls.push(...r.install);
    }
  }

  // 检测平台支持
  const platformResult = checkResult.results.find((r) => r.type === "platform");
  if (platformResult && !platformResult.passed) {
    result.osSupported = false;
  }

  return result;
}

/**
 * 快速检测技能是否就绪
 */
export function isSkillReady(
  requires: RequirementItem[] | undefined,
  metadata?: SkillOpenClawMetadata
): boolean {
  const result = checkDependencies(requires, metadata);
  return result.satisfied;
}

/**
 * 检测技能需要什么类型的操作
 */
export function getRequiredAction(
  requires: RequirementItem[] | undefined,
  metadata?: SkillOpenClawMetadata
): "ready" | "needs_install" | "needs_config" | "needs_auth" | "unsupported" {
  // 获取 RequirementItem 数组
  const requirements: RequirementItem[] = metadata
    ? getRequirements(metadata)
    : (requires ?? []);

  if (requirements.length === 0) {
    return "ready";
  }

  const checkResult = checkRequirements(requirements);

  if (!checkResult.firstFailed) {
    return "ready";
  }

  // 根据第一个失败的类型返回操作
  switch (checkResult.firstFailed.type) {
    case "platform":
      return "unsupported";
    case "bin":
    case "anyBin":
    case "version":
    case "service":
    case "skill":
      return "needs_install";
    case "auth":
      return "needs_auth";
    case "env":
    case "file":
      return "needs_config";
    default:
      return "ready";
  }
}
