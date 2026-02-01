/**
 * 依赖检测器
 *
 * 检测技能所需的 CLI 工具和环境变量是否满足
 *
 * @module skill-marketplace/dependency-checker
 */
import { execSync } from "node:child_process";
import * as os from "node:os";
// =============================================================================
// CLI 工具检测
// =============================================================================
/**
 * 检测 CLI 工具是否存在
 */
export function checkBinExists(bin) {
    try {
        const cmd = os.platform() === "win32" ? `where ${bin}` : `which ${bin}`;
        execSync(cmd, { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 批量检测 CLI 工具
 */
export function checkBins(bins) {
    const installed = [];
    const missing = [];
    for (const bin of bins) {
        if (checkBinExists(bin)) {
            installed.push(bin);
        }
        else {
            missing.push(bin);
        }
    }
    return { installed, missing };
}
/**
 * 检测任一 CLI 工具是否存在
 */
export function checkAnyBinExists(bins) {
    for (const bin of bins) {
        if (checkBinExists(bin)) {
            return { found: bin, checked: bins };
        }
    }
    return { found: null, checked: bins };
}
// =============================================================================
// 环境变量检测
// =============================================================================
/**
 * 检测环境变量是否存在
 */
export function checkEnvExists(envVar) {
    return process.env[envVar] !== undefined && process.env[envVar] !== "";
}
/**
 * 批量检测环境变量
 */
export function checkEnvVars(envVars) {
    const configured = [];
    const missing = [];
    for (const envVar of envVars) {
        if (checkEnvExists(envVar)) {
            configured.push(envVar);
        }
        else {
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
export function getCurrentOS() {
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
export function checkOSSupported(supportedOS) {
    if (!supportedOS || supportedOS.length === 0) {
        return true; // 未指定则默认支持所有系统
    }
    return supportedOS.includes(getCurrentOS());
}
/**
 * 过滤当前系统可用的安装选项
 */
export function filterInstallOptions(options) {
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
/**
 * 检测技能的所有依赖
 */
export function checkDependencies(requires, metadata) {
    const result = {
        satisfied: true,
        missingBins: [],
        missingEnv: [],
        missingConfig: [],
        installedBins: [],
        configuredEnv: [],
        osSupported: true,
        availableInstalls: [],
    };
    // 检测操作系统支持
    if (metadata?.os) {
        result.osSupported = checkOSSupported(metadata.os);
        if (!result.osSupported) {
            result.satisfied = false;
            return result;
        }
    }
    if (!requires) {
        return result;
    }
    // 检测必需的 CLI 工具
    if (requires.bins && requires.bins.length > 0) {
        const { installed, missing } = checkBins(requires.bins);
        result.installedBins.push(...installed);
        result.missingBins.push(...missing);
        if (missing.length > 0) {
            result.satisfied = false;
        }
    }
    // 检测任一 CLI 工具
    if (requires.anyBins && requires.anyBins.length > 0) {
        const { found } = checkAnyBinExists(requires.anyBins);
        if (found) {
            result.installedBins.push(found);
        }
        else {
            result.missingBins.push(`(任一) ${requires.anyBins.join(" / ")}`);
            result.satisfied = false;
        }
    }
    // 检测环境变量
    if (requires.env && requires.env.length > 0) {
        const { configured, missing } = checkEnvVars(requires.env);
        result.configuredEnv.push(...configured);
        result.missingEnv.push(...missing);
        if (missing.length > 0) {
            result.satisfied = false;
        }
    }
    // 配置项检测（暂时跳过，需要配置管理器支持）
    if (requires.config && requires.config.length > 0) {
        result.missingConfig.push(...requires.config);
        result.satisfied = false;
    }
    // 过滤可用的安装选项
    if (metadata?.install) {
        result.availableInstalls = filterInstallOptions(metadata.install);
    }
    return result;
}
/**
 * 快速检测技能是否就绪
 */
export function isSkillReady(requires, metadata) {
    const result = checkDependencies(requires, metadata);
    return result.satisfied;
}
/**
 * 检测技能需要什么类型的操作
 */
export function getRequiredAction(requires, metadata) {
    const result = checkDependencies(requires, metadata);
    if (!result.osSupported) {
        return "unsupported";
    }
    if (result.missingBins.length > 0) {
        return "needs_install";
    }
    if (result.missingEnv.length > 0 || result.missingConfig.length > 0) {
        return "needs_config";
    }
    return "ready";
}
