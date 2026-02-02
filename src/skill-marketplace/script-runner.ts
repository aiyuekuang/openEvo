/**
 * 脚本执行器
 *
 * 执行技能目录中的自定义检测脚本和操作脚本
 *
 * @module skill-marketplace/script-runner
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { SkillTutorial, CheckResult, ActionResult } from "./skill-metadata.js";

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 检测脚本返回结果
 * 
 * @deprecated 使用 CheckResult 替代
 */
export type ScriptCheckResult = {
  /** 检测是否通过 */
  passed: boolean;
  /** 失败时的提示消息 */
  message?: string;
  /** 详细说明 */
  details?: string;
  /** 操作提示/操作 ID */
  action?: string;
  /** 帮助链接 */
  helpUrl?: string;
  /** 教程/帮助信息 */
  tutorial?: SkillTutorial;
  /** 额外数据 (如版本号等) */
  data?: Record<string, unknown>;
};

/**
 * 检测脚本模块接口
 */
type CheckScriptModule = {
  /** 检测函数 */
  check?: () => ScriptCheckResult | Promise<ScriptCheckResult>;
  /** 默认导出的检测函数 */
  default?: () => ScriptCheckResult | Promise<ScriptCheckResult>;
};

/**
 * 操作脚本模块接口
 */
type ActionScriptModule = {
  /** 执行函数 */
  execute?: () => ActionResult | Promise<ActionResult>;
  /** 默认导出的执行函数 */
  default?: () => ActionResult | Promise<ActionResult>;
};

// =============================================================================
// 脚本执行
// =============================================================================

/**
 * 执行检测脚本
 *
 * @param skillDir - 技能目录的绝对路径
 * @param scriptPath - 脚本相对路径 (如: "scripts/check-auth.js")
 * @param timeout - 超时时间 (毫秒, 默认 10000)
 * @returns 检测结果
 *
 * @example
 * ```typescript
 * const result = await runCheckScript(
 *   '/path/to/skills-registry/github',
 *   'scripts/check-auth.js'
 * );
 * if (!result.passed) {
 *   console.log(result.message); // "需要登录 GitHub"
 *   console.log(result.action);  // "gh auth login"
 * }
 * ```
 */
export async function runCheckScript(
  skillDir: string,
  scriptPath: string,
  timeout = 10000
): Promise<ScriptCheckResult> {
  const absolutePath = path.resolve(skillDir, scriptPath);

  // 检查脚本是否存在
  if (!fs.existsSync(absolutePath)) {
    return {
      passed: false,
      message: `检测脚本不存在: ${scriptPath}`,
    };
  }

  try {
    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      executeCheckScript(absolutePath),
      createCheckTimeout(timeout),
    ]);

    return result;
  } catch (error) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `脚本执行错误: ${error.message}`
          : "脚本执行错误",
    };
  }
}

/**
 * 执行操作脚本
 *
 * @param skillDir - 技能目录的绝对路径
 * @param scriptPath - 脚本相对路径 (如: "scripts/login.js")
 * @param timeout - 超时时间 (毫秒, 默认 30000)
 * @returns 操作结果
 *
 * @example
 * ```typescript
 * const result = await runActionScript(
 *   '/path/to/skills-registry/github',
 *   'scripts/login.js'
 * );
 * if (result.command) {
 *   // 执行返回的命令
 * }
 * if (result.openUrl) {
 *   // 打开浏览器
 * }
 * ```
 */
export async function runActionScript(
  skillDir: string,
  scriptPath: string,
  timeout = 30000
): Promise<ActionResult> {
  const absolutePath = path.resolve(skillDir, scriptPath);

  // 检查脚本是否存在
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      message: `操作脚本不存在: ${scriptPath}`,
    };
  }

  try {
    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      executeActionScript(absolutePath),
      createActionTimeout(timeout),
    ]);

    return result;
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? `脚本执行错误: ${error.message}`
          : "脚本执行错误",
    };
  }
}

/**
 * 执行检测脚本模块
 */
async function executeCheckScript(scriptPath: string): Promise<ScriptCheckResult> {
  // 动态导入脚本模块
  const fileUrl = pathToFileURL(scriptPath).href;
  const module = (await import(fileUrl)) as CheckScriptModule;

  // 优先使用 check 函数，其次使用默认导出
  const checkFn = module.check ?? module.default;

  if (typeof checkFn !== "function") {
    return {
      passed: false,
      message: "脚本必须导出 check() 函数或默认导出检测函数",
    };
  }

  // 执行检测函数
  const result = await checkFn();

  // 验证返回值格式
  if (typeof result !== "object" || typeof result.passed !== "boolean") {
    return {
      passed: false,
      message: "脚本返回值格式错误，必须包含 passed: boolean",
    };
  }

  return result;
}

/**
 * 执行操作脚本模块
 */
async function executeActionScript(scriptPath: string): Promise<ActionResult> {
  // 动态导入脚本模块
  const fileUrl = pathToFileURL(scriptPath).href;
  const module = (await import(fileUrl)) as ActionScriptModule;

  // 优先使用 execute 函数，其次使用默认导出
  const executeFn = module.execute ?? module.default;

  if (typeof executeFn !== "function") {
    return {
      success: false,
      message: "脚本必须导出 execute() 函数或默认导出执行函数",
    };
  }

  // 执行操作函数
  const result = await executeFn();

  // 验证返回值格式
  if (typeof result !== "object" || typeof result.success !== "boolean") {
    return {
      success: false,
      message: "脚本返回值格式错误，必须包含 success: boolean",
    };
  }

  return result;
}

/**
 * 创建检测脚本超时 Promise
 */
function createCheckTimeout(ms: number): Promise<ScriptCheckResult> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`脚本执行超时 (${ms}ms)`));
    }, ms);
  });
}

/**
 * 创建操作脚本超时 Promise
 */
function createActionTimeout(ms: number): Promise<ActionResult> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`脚本执行超时 (${ms}ms)`));
    }, ms);
  });
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 检查脚本路径是否安全
 *
 * 防止路径遍历攻击
 */
export function isScriptPathSafe(skillDir: string, scriptPath: string): boolean {
  const absolutePath = path.resolve(skillDir, scriptPath);
  const normalizedSkillDir = path.resolve(skillDir);

  // 确保脚本路径在技能目录内
  return absolutePath.startsWith(normalizedSkillDir + path.sep);
}

/**
 * 获取脚本的绝对路径
 */
export function getScriptAbsolutePath(
  skillDir: string,
  scriptPath: string
): string | null {
  if (!isScriptPathSafe(skillDir, scriptPath)) {
    return null;
  }
  return path.resolve(skillDir, scriptPath);
}
