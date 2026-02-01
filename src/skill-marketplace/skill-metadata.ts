/**
 * 技能元数据类型定义
 *
 * 定义技能依赖、安装选项、运行时状态等类型
 *
 * @module skill-marketplace/skill-metadata
 */

// =============================================================================
// 技能依赖要求
// =============================================================================

/**
 * 技能依赖要求
 */
export type SkillRequirements = {
  /** 需要的 CLI 工具 */
  bins?: string[];
  /** 需要的任一 CLI 工具（满足一个即可） */
  anyBins?: string[];
  /** 需要的环境变量 */
  env?: string[];
  /** 需要的配置项 */
  config?: string[];
};

/**
 * 安装方式类型
 */
export type InstallKind =
  | "brew" // Homebrew
  | "apt" // apt-get
  | "node" // npm/npx
  | "go" // go install
  | "pip" // pip install
  | "uv" // uv tool
  | "download"; // 下载二进制

/**
 * 技能安装选项
 */
export type SkillInstallOption = {
  /** 安装选项 ID */
  id: string;
  /** 安装方式 */
  kind: InstallKind;
  /** 显示标签 */
  label: string;
  /** 适用的操作系统 */
  os?: ("darwin" | "linux" | "win32")[];

  // brew 相关
  /** brew formula 名称 */
  formula?: string;
  /** brew tap */
  tap?: string;
  /** brew cask */
  cask?: string;

  // node 相关
  /** npm 包名 */
  package?: string;

  // go 相关
  /** go module 路径 */
  module?: string;

  // pip/uv 相关
  /** pip/uv 包名 */
  pyPackage?: string;

  // apt 相关
  /** apt 包名 */
  aptPackage?: string;

  // download 相关
  /** 下载 URL */
  url?: string;
  /** 压缩包类型 */
  archive?: "tar.gz" | "tar.bz2" | "zip";
  /** 是否解压 */
  extract?: boolean;
  /** 解压时跳过的目录层级 */
  stripComponents?: number;
  /** 目标目录 */
  targetDir?: string;

  /** 安装后提供的 CLI 工具 */
  bins?: string[];
};

/**
 * 技能的 OpenClaw 元数据
 */
export type SkillOpenClawMetadata = {
  /** 图标 emoji */
  emoji?: string;
  /** 技能 key（用于配置引用） */
  skillKey?: string;
  /** 适用的操作系统 */
  os?: ("darwin" | "linux" | "win32")[];
  /** 依赖要求 */
  requires?: SkillRequirements;
  /** 主要环境变量（用于配置弹窗标题） */
  primaryEnv?: string;
  /** 安装选项 */
  install?: SkillInstallOption[];
};

// =============================================================================
// 技能运行时状态
// =============================================================================

/**
 * 技能状态
 */
export type SkillStatus =
  | "ready" // ✅ 可用：依赖已安装，配置已完成
  | "needs_config" // ⚙️ 需配置：依赖OK，但缺少 API Key 等配置
  | "needs_install" // 📦 需安装：缺少 CLI 依赖
  | "installing" // ⏳ 安装中
  | "configuring" // ⚙️ 配置中
  | "error" // ❌ 错误
  | "disabled" // 🚫 已禁用
  | "unsupported"; // 🚫 不支持当前系统

/**
 * 技能状态详情
 */
export type SkillStatusInfo = {
  /** 当前状态 */
  status: SkillStatus;
  /** 状态消息 */
  message?: string;
  /** 缺失的 CLI 工具 */
  missingBins?: string[];
  /** 缺失的环境变量 */
  missingEnv?: string[];
  /** 缺失的配置项 */
  missingConfig?: string[];
  /** 可用的安装选项 */
  availableInstalls?: SkillInstallOption[];
  /** 错误信息 */
  error?: string;
};

// =============================================================================
// 技能配置
// =============================================================================

/**
 * 技能配置项定义
 */
export type SkillConfigField = {
  /** 字段 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 描述 */
  description?: string;
  /** 字段类型 */
  type: "text" | "password" | "url" | "number" | "boolean" | "select";
  /** select 类型的选项 */
  options?: { value: string; label: string }[];
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: string | number | boolean;
  /** 占位符 */
  placeholder?: string;
  /** 帮助链接 */
  helpUrl?: string;
};

/**
 * 技能配置值
 */
export type SkillConfigValues = Record<string, string | number | boolean>;

/**
 * 已保存的技能配置
 */
export type SavedSkillConfig = {
  /** 技能 ID */
  skillId: string;
  /** 配置值 */
  values: SkillConfigValues;
  /** 配置时间 */
  configuredAt: string;
  /** 最后验证时间 */
  lastValidatedAt?: string;
  /** 验证状态 */
  validated?: boolean;
};

// =============================================================================
// 已安装技能状态
// =============================================================================

/**
 * 已安装技能记录
 */
export type InstalledSkillRecord = {
  /** 技能 ID */
  skillId: string;
  /** 安装时间 */
  installedAt: string;
  /** 安装方式 */
  installMethod?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 禁用时间 */
  disabledAt?: string;
};

/**
 * 技能安装状态存储
 */
export type SkillInstallState = {
  /** 已安装技能列表 */
  installed: InstalledSkillRecord[];
  /** 上次更新时间 */
  updatedAt: string;
};
