/**
 * 技能市场 IPC 处理器
 *
 * 提供给 Electron 主进程注册的 IPC 处理函数
 *
 * @module skill-marketplace/ipc-handlers
 */
import { ipcMain } from "electron";
import * as path from "node:path";
import { parseSkillDir, generateConfigFields, scanSkillsDir } from "./skill-parser.js";
import { checkDependencies } from "./dependency-checker.js";
import { getSkillConfig, saveSkillConfig, markSkillInstalled, markSkillUninstalled, setSkillEnabled, } from "./config-manager.js";
import { computeSkillStatus } from "./skill-status.js";
// =============================================================================
// IPC 通道名称
// =============================================================================
export const IPC_CHANNELS = {
    // 技能状态
    GET_SKILL_STATUS: "skill:getStatus",
    GET_ALL_SKILLS_STATUS: "skill:getAllStatus",
    // 技能配置
    GET_SKILL_CONFIG: "skill:getConfig",
    SAVE_SKILL_CONFIG: "skill:saveConfig",
    GET_CONFIG_FIELDS: "skill:getConfigFields",
    // 技能安装
    CHECK_DEPENDENCIES: "skill:checkDependencies",
    INSTALL_SKILL: "skill:install",
    UNINSTALL_SKILL: "skill:uninstall",
    ENABLE_SKILL: "skill:enable",
    DISABLE_SKILL: "skill:disable",
    // 技能扫描
    SCAN_SKILLS: "skill:scan",
    GET_SKILL_METADATA: "skill:getMetadata",
};
// =============================================================================
// 处理器注册
// =============================================================================
/**
 * 注册所有技能市场 IPC 处理器
 */
export function registerSkillMarketplaceHandlers(skillsDir) {
    // 获取技能状态
    ipcMain.handle(IPC_CHANNELS.GET_SKILL_STATUS, async (_event, skillId, metadata) => {
        try {
            return computeSkillStatus(skillId, metadata);
        }
        catch (error) {
            return { status: "error", error: String(error) };
        }
    });
    // 获取所有技能状态
    ipcMain.handle(IPC_CHANNELS.GET_ALL_SKILLS_STATUS, async (_event, skills) => {
        const results = {};
        for (const skill of skills) {
            try {
                results[skill.id] = computeSkillStatus(skill.id, skill.metadata);
            }
            catch (error) {
                results[skill.id] = { status: "error", error: String(error) };
            }
        }
        return results;
    });
    // 获取技能配置
    ipcMain.handle(IPC_CHANNELS.GET_SKILL_CONFIG, async (_event, skillId) => {
        return getSkillConfig(skillId);
    });
    // 保存技能配置
    ipcMain.handle(IPC_CHANNELS.SAVE_SKILL_CONFIG, async (_event, skillId, values) => {
        try {
            const config = saveSkillConfig(skillId, values);
            // 标记为已安装
            markSkillInstalled(skillId);
            return { success: true, config };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 获取配置字段定义
    ipcMain.handle(IPC_CHANNELS.GET_CONFIG_FIELDS, async (_event, metadata) => {
        return generateConfigFields(metadata);
    });
    // 检测依赖
    ipcMain.handle(IPC_CHANNELS.CHECK_DEPENDENCIES, async (_event, metadata) => {
        return checkDependencies(metadata.requires, metadata);
    });
    // 安装技能（标记为已安装）
    ipcMain.handle(IPC_CHANNELS.INSTALL_SKILL, async (_event, skillId, installMethod) => {
        try {
            markSkillInstalled(skillId, installMethod);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 卸载技能
    ipcMain.handle(IPC_CHANNELS.UNINSTALL_SKILL, async (_event, skillId) => {
        try {
            markSkillUninstalled(skillId);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 启用技能
    ipcMain.handle(IPC_CHANNELS.ENABLE_SKILL, async (_event, skillId) => {
        try {
            setSkillEnabled(skillId, true);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 禁用技能
    ipcMain.handle(IPC_CHANNELS.DISABLE_SKILL, async (_event, skillId) => {
        try {
            setSkillEnabled(skillId, false);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 扫描技能目录
    ipcMain.handle(IPC_CHANNELS.SCAN_SKILLS, async () => {
        try {
            const skills = scanSkillsDir(skillsDir);
            return { success: true, skills: Object.fromEntries(skills) };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // 获取技能元数据
    ipcMain.handle(IPC_CHANNELS.GET_SKILL_METADATA, async (_event, skillName) => {
        try {
            const skillDir = path.join(skillsDir, skillName);
            const info = parseSkillDir(skillDir);
            return { success: true, info };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
}
/**
 * 移除所有技能市场 IPC 处理器
 */
export function removeSkillMarketplaceHandlers() {
    for (const channel of Object.values(IPC_CHANNELS)) {
        ipcMain.removeHandler(channel);
    }
}
