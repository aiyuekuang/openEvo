/**
 * 技能元数据类型定义
 *
 * 定义技能依赖、安装选项、运行时状态等类型
 *
 * @module skill-marketplace/skill-metadata
 */
/**
 * 技能状态配置
 */
export const SKILL_STATUS_CONFIG = {
    not_installed: {
        label: '未安装',
        icon: '➕',
        color: 'default',
        description: '点击安装使用此技能',
        actions: ['install'],
    },
    installing: {
        label: '安装中',
        icon: '⏳',
        color: 'processing',
        description: '正在安装技能...',
        actions: [],
    },
    needs_deps: {
        label: '需安装依赖',
        icon: '📦',
        color: 'warning',
        description: '缺少必要的 CLI 工具',
        actions: ['install_deps', 'verify', 'uninstall'],
    },
    installing_deps: {
        label: '安装依赖中',
        icon: '⏳',
        color: 'processing',
        description: '正在安装依赖...',
        actions: [],
    },
    needs_auth: {
        label: '需登录',
        icon: '🔑',
        color: 'warning',
        description: 'CLI 工具需要登录认证',
        actions: ['verify', 'uninstall'],
    },
    needs_config: {
        label: '需配置',
        icon: '⚙️',
        color: 'warning',
        description: '需要配置 API Key 等信息',
        actions: ['configure', 'uninstall'],
    },
    configuring: {
        label: '配置中',
        icon: '⏳',
        color: 'processing',
        description: '正在保存配置...',
        actions: [],
    },
    ready: {
        label: '已就绪',
        icon: '✅',
        color: 'success',
        description: '可以启用此技能',
        actions: ['enable', 'configure', 'uninstall'],
    },
    active: {
        label: '运行中',
        icon: '🟢',
        color: 'success',
        description: 'Agent 可以调用此技能',
        actions: ['disable', 'configure'],
    },
    disabled: {
        label: '已禁用',
        icon: '⏸️',
        color: 'default',
        description: '技能已被禁用',
        actions: ['enable', 'uninstall'],
    },
    error: {
        label: '错误',
        icon: '❌',
        color: 'error',
        description: '出现错误，请重试',
        actions: ['retry', 'view_error', 'uninstall'],
    },
    unsupported: {
        label: '不支持',
        icon: '🚫',
        color: 'default',
        description: '当前系统不支持此技能',
        actions: [],
    },
};
/**
 * 获取依赖项数组
 */
export function getRequirements(metadata) {
    return metadata.requires ?? [];
}
