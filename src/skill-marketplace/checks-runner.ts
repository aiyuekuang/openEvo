/**
 * 配置驱动检测执行器
 *
 * 从 skill.json 的 checks/actions 配置执行检测脚本
 * 统一给 skill-status.ts 和 skill-ipc.ts 使用
 *
 * @module skill-marketplace/checks-runner
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type {
  CheckItem,
  ActionItem,
  CheckResult,
  ActionResult,
  ChecksStatusInfo,
  SkillStatus,
  SkillStatusInfo,
} from "./skill-metadata.js";

// =============================================================================
// 配置常量
// =============================================================================

/** 脚本执行配置 */
const SCRIPT_CONFIG = {
  /** 检测脚本超时时间 (ms) */
  CHECK_TIMEOUT: 10000,
  /** 操作脚本超时时间 (ms) */
  ACTION_TIMEOUT: 30000,
  /** 默认 Shell (只在 macOS 使用) */
  DEFAULT_SHELL: process.platform === "darwin" ? "/bin/zsh" : undefined,
  /** 额外的 PATH 路径前缀 */
  PATH_PREFIX: process.platform === "darwin"
    ? "/opt/homebrew/bin:/usr/local/bin"
    : "/usr/local/bin",
} as const;

/** 调试模式 */
const DEBUG = process.env.NODE_ENV !== "production";

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 获取技能目录路径
 *
 * @param skillId - 技能 ID (如 @openclaw/github 或 github)
 * @param skillsDir - 已安装技能目录 (~/.openclaw/skills)
 * @param registryDir - 技能注册表目录 (skills-registry)
 * @returns 技能目录的绝对路径
 */
export function getSkillDir(
  skillId: string,
  skillsDir: string,
  registryDir: string
): string {
  const skillName = skillId.replace(/^@openclaw\//, "");

  // 优先使用已安装的技能目录
  const installedDir = path.join(skillsDir, skillName);
  if (fs.existsSync(installedDir)) {
    return installedDir;
  }

  // 回退到注册表目录
  return path.join(registryDir, skillName);
}

/**
 * 从 check ID 推断状态类型
 *
 * 约定规则:
 * - cli/bin 开头 → needs_deps (需安装依赖)
 * - auth/login 开头 → needs_auth (需登录)
 * - env/config 开头 → needs_config (需配置)
 */
export function inferStatusFromCheckId(checkId: string): SkillStatus {
  if (checkId.match(/^(auth|login)/i)) {
    return "needs_auth";
  }
  if (checkId.match(/^(env|config)/i)) {
    return "needs_config";
  }
  // 默认为依赖缺失
  return "needs_deps";
}

// =============================================================================
// 脚本执行
// =============================================================================

/**
 * 异步执行检测脚本
 */
export async function runCheckScript(
  skillDir: string,
  scriptPath: string,
  timeout = SCRIPT_CONFIG.CHECK_TIMEOUT
): Promise<CheckResult> {
  const absolutePath = path.resolve(skillDir, scriptPath);

  if (!fs.existsSync(absolutePath)) {
    return {
      passed: false,
      message: `检测脚本不存在: ${scriptPath}`,
    };
  }

  try {
    const fileUrl = pathToFileURL(absolutePath).href;
    const module = (await import(fileUrl)) as {
      check?: () => Promise<CheckResult>;
      default?: () => Promise<CheckResult>;
    };
    const checkFn = module.check ?? module.default;

    if (typeof checkFn !== "function") {
      return {
        passed: false,
        message: "脚本必须导出 check() 函数",
      };
    }

    const result = await Promise.race([
      checkFn(),
      new Promise<CheckResult>((_, reject) =>
        setTimeout(() => reject(new Error(`超时 (${timeout}ms)`)), timeout)
      ),
    ]);

    return result;
  } catch (error) {
    return {
      passed: false,
      message: error instanceof Error ? error.message : "脚本执行错误",
    };
  }
}

/**
 * 异步执行操作脚本
 */
export async function runActionScript(
  skillDir: string,
  scriptPath: string,
  timeout = SCRIPT_CONFIG.ACTION_TIMEOUT
): Promise<ActionResult> {
  const absolutePath = path.resolve(skillDir, scriptPath);

  if (DEBUG) {
    console.log(`[runActionScript] skillDir: ${skillDir}`);
    console.log(`[runActionScript] scriptPath: ${scriptPath}`);
    console.log(`[runActionScript] absolutePath: ${absolutePath}`);
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      message: `操作脚本不存在: ${scriptPath}`,
    };
  }

  try {
    const fileUrl = pathToFileURL(absolutePath).href;
    if (DEBUG) {
      console.log(`[runActionScript] fileUrl: ${fileUrl}`);
    }
    const module = (await import(fileUrl)) as {
      execute?: () => Promise<ActionResult>;
      run?: () => Promise<ActionResult>;
      default?: () => Promise<ActionResult>;
    };
    const executeFn = module.execute ?? module.run ?? module.default;
    if (DEBUG) {
      console.log(`[runActionScript] executeFn type: ${typeof executeFn}`);
    }

    if (typeof executeFn !== "function") {
      return {
        success: false,
        message: "脚本必须导出 execute() 或 run() 函数",
      };
    }

    const result = await Promise.race([
      executeFn(),
      new Promise<ActionResult>((_, reject) =>
        setTimeout(() => reject(new Error(`超时 (${timeout}ms)`)), timeout)
      ),
    ]);

    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "脚本执行错误",
    };
  }
}

// =============================================================================
// 同步检测 (用于 computeSkillStatus)
// =============================================================================

/**
 * 同步执行 checks 配置，返回 SkillStatusInfo
 *
 * 使用 child_process.execSync 执行脚本，适用于需要同步获取状态的场景
 */
export function computeSkillStatusFromChecksSync(
  skillDir: string,
  checks: CheckItem[],
  actions?: Record<string, ActionItem>
): SkillStatusInfo {
  const passedChecks = new Set<string>();
  let firstFailedCheck: { check: CheckItem; result: CheckResult } | null = null;

  // 收集所有检测结果
  const checkResults: ChecksStatusInfo["results"] = [];

  // 按依赖顺序执行检测
  for (const check of checks) {
    // 检查依赖是否满足
    const dependsOn = check.dependsOn || [];
    const depsNotMet = dependsOn.filter((dep) => !passedChecks.has(dep));

    if (depsNotMet.length > 0) {
      // 依赖未满足，跳过此检测
      checkResults.push({
        id: check.id,
        label: check.label,
        description: check.description,
        passed: false,
        skipped: true,
      });
      continue;
    }

    // 执行检测脚本
    const scriptPath = path.join(skillDir, check.script);
    if (!fs.existsSync(scriptPath)) {
      // 脚本不存在，视为失败
      const failResult: CheckResult = {
        passed: false,
        message: `检测脚本不存在: ${check.script}`,
      };
      checkResults.push({
        id: check.id,
        label: check.label,
        description: check.description,
        passed: false,
        result: failResult,
      });
      if (!firstFailedCheck) {
        firstFailedCheck = { check, result: failResult };
      }
      continue;
    }

    try {
      // 使用 node 同步执行脚本
      // 使用 --input-type=module 让 -e 内联代码以 ES 模块模式执行
      const nodeCmd = `node --input-type=module -e "import('${scriptPath.replace(/\\/g, "/")}').then(m => { const fn = m.check || m.default; if (fn) fn().then(r => console.log(JSON.stringify(r))).catch(e => console.log(JSON.stringify({passed: false, message: e.message}))); else console.log(JSON.stringify({passed: false, message: 'No check function'})); })"`;

      const result = execSync(nodeCmd, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: SCRIPT_CONFIG.CHECK_TIMEOUT,
        shell: SCRIPT_CONFIG.DEFAULT_SHELL,
        env: {
          ...process.env,
          PATH: `${SCRIPT_CONFIG.PATH_PREFIX}:${process.env.PATH}`,
        },
      });

      const checkResult = JSON.parse(result.trim()) as CheckResult;

      checkResults.push({
        id: check.id,
        label: check.label,
        description: check.description,
        passed: checkResult.passed,
        result: checkResult,
      });

      if (checkResult.passed) {
        passedChecks.add(check.id);
      } else if (!firstFailedCheck) {
        firstFailedCheck = { check, result: checkResult };
      }
    } catch (error) {
      // 脚本执行失败
      const failResult: CheckResult = {
        passed: false,
        message: error instanceof Error ? error.message : "检测脚本执行失败",
      };
      checkResults.push({
        id: check.id,
        label: check.label,
        description: check.description,
        passed: false,
        result: failResult,
      });
      if (!firstFailedCheck) {
        firstFailedCheck = { check, result: failResult };
      }
    }
  }

  // 构建 checksInfo
  const checksInfo: ChecksStatusInfo = {
    allPassed: !firstFailedCheck,
    results: checkResults,
    availableActions: actions,
  };

  // 所有检测通过
  if (!firstFailedCheck) {
    return {
      status: "ready",
      installed: true,
      enabled: true,
      checksInfo,
    };
  }

  // 根据失败的检测类型返回不同状态
  const { check, result } = firstFailedCheck;
  const status = inferStatusFromCheckId(check.id);

  // 构建返回结果
  const statusInfo: SkillStatusInfo = {
    status,
    installed: true,
    enabled: false,
    message: result.message,
    checksInfo,
  };

  // 根据状态类型添加不同的信息
  if (status === "needs_auth") {
    statusInfo.auth = {
      message: result.message || check.label,
      action: result.action || "",
      helpUrl: result.tutorial?.helpUrl,
      tutorial: result.tutorial,
    };
  } else if (status === "needs_deps" || status === "needs_config") {
    // 对于依赖和配置类型，也传递 tutorial 信息
    if (result.action && actions && actions[result.action]) {
      statusInfo.auth = {
        message: result.message || check.label,
        action: result.action,
        helpUrl: result.tutorial?.helpUrl,
        tutorial: result.tutorial,
      };
    } else if (result.tutorial) {
      statusInfo.auth = {
        message: result.message || check.label,
        action: "",
        helpUrl: result.tutorial?.helpUrl,
        tutorial: result.tutorial,
      };
    }
  }

  return statusInfo;
}

// =============================================================================
// 异步检测 (用于 IPC handler)
// =============================================================================

/**
 * 异步执行 checks 配置，返回详细的 ChecksStatusInfo
 *
 * 用于 UI 展示每个检测项的详细结果
 */
export async function computeSkillStatusFromChecksAsync(
  skillDir: string,
  checks: CheckItem[],
  actions?: Record<string, ActionItem>
): Promise<ChecksStatusInfo> {
  const passedChecks = new Set<string>();
  const results: ChecksStatusInfo["results"] = [];

  // 按依赖顺序执行检测
  for (const check of checks) {
    // 检查依赖是否满足
    const dependsOn = check.dependsOn || [];
    const depsNotMet = dependsOn.filter((dep) => !passedChecks.has(dep));

    if (depsNotMet.length > 0) {
      // 依赖未满足，跳过此检测
      results.push({
        id: check.id,
        label: check.label,
        description: check.description,
        passed: false,
        skipped: true,
      });
      continue;
    }

    // 执行检测脚本
    const checkResult = await runCheckScript(skillDir, check.script);

    results.push({
      id: check.id,
      label: check.label,
      description: check.description,
      passed: checkResult.passed,
      result: checkResult,
    });

    if (checkResult.passed) {
      passedChecks.add(check.id);
    }
  }

  return {
    allPassed: results.every((r) => r.passed || r.skipped),
    results,
    availableActions: actions,
  };
}
