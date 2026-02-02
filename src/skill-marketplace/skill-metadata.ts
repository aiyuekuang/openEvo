/**
 * 技能元数据类型定义
 *
 * 定义技能依赖、安装选项、运行时状态等类型
 *
 * @module skill-marketplace/skill-metadata
 */

// =============================================================================
// 基础类型
// =============================================================================

/**
 * 支持的操作系统平台
 */
export type Platform = "darwin" | "linux" | "win32";

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
 * 环境变量帮助信息
 */
export type EnvHelp = {
  /** 说明文字 (如: "免费注册即可获取，每月2000次免费调用") */
  description: string;
  /** 获取教程链接 */
  helpUrl: string;
  /** 输入框占位符 */
  placeholder?: string;
};


// =============================================================================
// 配置驱动检测 - checks & actions (新架构)
// =============================================================================

/**
 * 教程/帮助信息
 * 
 * 检测失败时展示给用户的详细引导
 */
export type SkillTutorial = {
  /** 教程标题 */
  title: string;
  /** 步骤列表 */
  steps: string[];
  /** 提示列表 */
  tips?: string[];
  /** 帮助文档链接 */
  helpUrl?: string;
};

/**
 * 检测结果 (脚本返回值)
 * 
 * 检测脚本必须导出 check() 函数，返回此类型
 */
export type CheckResult = {
  /** 检测是否通过 */
  passed: boolean;
  /** 失败时的提示消息 (给用户看) */
  message?: string;
  /** 详细说明 */
  details?: string;
  /** 推荐操作 ID (指向 actions) */
  action?: string;
  /** 教程/帮助信息 */
  tutorial?: SkillTutorial;
  /** 额外数据 (如版本号等) */
  data?: Record<string, unknown>;
};

/**
 * 操作结果 (action 脚本返回值)
 */
export type ActionResult = {
  /** 操作是否成功 */
  success: boolean;
  /** 结果消息 */
  message?: string;
  /** 要执行的命令 (让软件执行) */
  command?: string;
  /** 是否在终端中打开执行 */
  openTerminal?: boolean;
  /** 打开浏览器链接 */
  openUrl?: string;
};

/**
 * 检测项定义
 * 
 * 定义一个检测点，指向具体的检测脚本
 */
export type CheckItem = {
  /** 检测项 ID (唯一标识) */
  id: string;
  /** 检测脚本路径 (相对于技能目录) */
  script: string;
  /** 显示标签 */
  label: string;
  /** 描述说明 */
  description?: string;
  /** 依赖的其他检测项 ID (必须先通过才执行本检测) */
  dependsOn?: string[];
};

/**
 * 操作定义
 * 
 * 定义用户可执行的操作，如安装、登录等
 */
export type ActionItem = {
  /** 操作脚本路径 (相对于技能目录) */
  script: string;
  /** 显示标签 */
  label: string;
  /** 描述说明 */
  description?: string;
};

/**
 * 所有检测项的结果汇总
 */
export type ChecksStatusInfo = {
  /** 所有检测是否通过 */
  allPassed: boolean;
  /** 每个检测项的结果 */
  results: Array<{
    /** 检测项 ID */
    id: string;
    /** 检测项标签 */
    label: string;
    /** 检测项描述 */
    description?: string;
    /** 是否通过 */
    passed: boolean;
    /** 是否被跳过 (因依赖未满足) */
    skipped?: boolean;
    /** 检测结果详情 */
    result?: CheckResult;
  }>;
  /** 可用的操作 */
  availableActions?: Record<string, ActionItem>;
};

// =============================================================================
// skill.json 结构定义
// =============================================================================

/**
 * 技能能力声明
 */
export type SkillCapability =
  | { type: "tool"; names: string[] }     // 提供的工具
  | { type: "command"; names: string[] }  // 提供的命令
  | { type: "agent"; names: string[] };   // 提供的 Agent

/**
 * 技能清单文件结构 (skill.json)
 * 
 * 类似 npm 的 package.json，定义技能的元数据和依赖
 * 
 * @example
 * ```json
 * {
 *   "name": "github",
 *   "version": "1.0.0",
 *   "description": "GitHub CLI 管理 Issue、PR、CI",
 *   "emoji": "🐙",
 *   "checks": [
 *     { "id": "cli", "script": "scripts/check-cli.js", "label": "GitHub CLI" },
 *     { "id": "auth", "script": "scripts/check-auth.js", "label": "GitHub 登录", "dependsOn": ["cli"] }
 *   ],
 *   "actions": {
 *     "install-cli": { "script": "scripts/install-cli.js", "label": "安装 GitHub CLI" },
 *     "login": { "script": "scripts/login.js", "label": "登录 GitHub" }
 *   }
 * }
 * ```
 */
export type SkillManifest = {
  // === 基本信息 ===
  /** 技能名称 (必填) */
  name: string;
  /** 技能版本 (semver 格式) */
  version?: string;
  /** 技能描述 (必填) */
  description: string;

  // === 显示信息 ===
  /** 图标 emoji */
  emoji?: string;
  /** 主页 URL */
  homepage?: string;
  /** 技能分类 */
  category?: string;
  /** 标签 */
  tags?: string[];

  // === 配置字段 ===
  /**
   * 配置项定义
   * 
   * 定义技能需要的配置项（如 API Key、用户名等）
   * UI 会根据此字段自动生成配置表单
   * 
   * @example
   * ```json
   * "config": [
   *   {
   *     "key": "GOOGLE_AI_API_KEY",
   *     "label": "Google AI API Key",
   *     "type": "password",
   *     "required": true,
   *     "helpUrl": "https://aistudio.google.com/apikey"
   *   }
   * ]
   * ```
   */
  config?: SkillConfigField[];

  // === 配置驱动检测 (新架构) ===
  /**
   * 检测项列表
   * 
   * 每个检测项指向一个 JS 脚本，脚本返回 CheckResult
   * 支持依赖关系 (dependsOn)
   */
  checks?: CheckItem[];
  
  /**
   * 操作定义 (配合 checks 使用)
   * 
   * key 是操作 ID，检测脚本通过 action 字段引用
   */
  actions?: Record<string, ActionItem>;

  // === 依赖检测 (旧架构，向后兼容) ===
  /**
   * 依赖项列表 (RequirementItem 数组)
   * @deprecated 推荐使用 checks/actions 架构
   */
  requires?: RequirementItem[];

  // === 能力声明 ===
  /** 技能提供的能力 (工具/命令/Agent) */
  capabilities?: SkillCapability[];

  // === 元信息 ===
  /** 作者 */
  author?: string;
  /** 许可证 */
  license?: string;
  /** 最低兼容的 OpenClaw 版本 */
  minOpenClawVersion?: string;
};

// =============================================================================
// 技能运行时状态
// =============================================================================

/**
 * 技能生命周期状态
 * 
 * 状态流转:
 * not_installed → installing → [needs_deps → installing_deps →] [needs_config → configuring →] ready → active
 *                                                                                              ↓
 *                                                                                           disabled
 */
export type SkillStatus =
  // === 未安装阶段 ===
  | "not_installed"      // 未安装 - 在市场中可见
  
  // === 安装阶段 ===
  | "installing"         // 安装中 - 复制技能文件
  
  // === 依赖阶段 ===
  | "needs_deps"         // 需安装依赖 - 缺少 CLI 工具
  | "installing_deps"    // 安装依赖中
  
  // === 认证阶段 ===
  | "needs_auth"         // 需登录 - CLI 工具未认证
  
  // === 配置阶段 ===
  | "needs_config"       // 需配置 - 缺少 API Key 等
  | "configuring"        // 配置中
  
  // === 可用阶段 ===
  | "ready"              // 已就绪 - 可用但未启用
  | "active"             // 运行中 - 已启用，Agent 可调用
  
  // === 特殊状态 ===
  | "disabled"           // 已禁用 - 用户手动禁用
  | "error"              // 错误
  | "unsupported";       // 不支持当前系统

/**
 * 技能操作类型
 */
export type SkillAction =
  | "install"           // 安装技能
  | "uninstall"         // 卸载技能
  | "install_deps"      // 安装依赖
  | "verify"            // 验证依赖
  | "configure"         // 配置
  | "enable"            // 启用
  | "disable"           // 禁用
  | "retry"             // 重试
  | "view_error";       // 查看错误

/**
 * 技能状态配置
 */
export const SKILL_STATUS_CONFIG: Record<SkillStatus, {
  label: string;
  icon: string;
  color: 'default' | 'processing' | 'success' | 'warning' | 'error';
  description: string;
  actions: SkillAction[];
}> = {
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
 * 技能状态详情
 */
export type SkillStatusInfo = {
  /** 当前状态 */
  status: SkillStatus;
  
  /** 是否已安装到本地 */
  installed: boolean;
  
  /** 是否已启用 */
  enabled: boolean;
  
  /** 状态消息 */
  message?: string;
  
  /** 依赖信息 */
  deps?: {
    /** 缺失的 CLI */
    missing: string[];
    /** 可用的安装方式 */
    installOptions: SkillInstallOption[];
  };
  
  /** 配置信息 */
  config?: {
    /** 缺失的配置项 */
    missing: string[];
    /** 配置字段定义 */
    fields: SkillConfigField[];
  };
  
  /** 认证信息 (需要登录时) */
  auth?: {
    /** 提示消息 */
    message: string;
    /** 认证命令 (显示给用户) */
    action: string;
    /** 帮助链接 */
    helpUrl?: string;
    /** 教程引导 (配置驱动检测填充) */
    tutorial?: SkillTutorial;
  };
  
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: string;
  };

  /** 配置驱动检测的结果 (使用 checks 架构时填充) */
  checksInfo?: ChecksStatusInfo;

  // === 向后兼容字段 (deprecated) ===
  /** @deprecated 使用 deps.missing */
  missingBins?: string[];
  /** @deprecated 使用 config.missing */
  missingEnv?: string[];
  /** @deprecated 使用 config.missing */
  missingConfig?: string[];
  /** @deprecated 使用 deps.installOptions */
  availableInstalls?: SkillInstallOption[];
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

// =============================================================================
// 依赖检测类型 (RequirementItem 系列)
// =============================================================================

/**
 * 技能元数据（包含依赖项，兼容旧 SKILL.md 格式）
 */
export type SkillOpenClawMetadata = {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description?: string;
  /** 版本 */
  version?: string;
  /** 图标 emoji */
  emoji?: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 依赖项列表 (旧架构，向后兼容) */
  requires?: RequirementItem[];
  /** 能力声明 */
  capabilities?: SkillCapability[];
  /** 最低 OpenClaw 版本 */
  minOpenClawVersion?: string;
  /** 支持的操作系统 */
  os?: Platform[];

  // === 配置驱动检测 (新架构) ===
  /** 检测项列表 */
  checks?: CheckItem[];
  /** 操作定义 */
  actions?: Record<string, ActionItem>;
};

/**
 * 平台检测项
 */
export type PlatformRequirement = {
  type: "platform";
  os: Platform[];
  message?: string;
};

/**
 * CLI 工具检测项
 */
export type BinRequirement = {
  type: "bin";
  name: string;
  message?: string;
  install?: SkillInstallOption[];
};

/**
 * 任一 CLI 工具检测项
 */
export type AnyBinRequirement = {
  type: "anyBin";
  names: string[];
  message?: string;
  install?: SkillInstallOption[];
};

/**
 * 版本检测项
 */
export type VersionRequirement = {
  type: "version";
  bin: string;
  minVersion: string;
  command?: string;
  message?: string;
  install?: SkillInstallOption[];
};

/**
 * 服务检测项
 */
export type ServiceRequirement = {
  type: "service";
  command: string;
  expect?: string;
  message?: string;
};

/**
 * 文件检测项
 */
export type FileRequirement = {
  type: "file";
  path: string;
  message?: string;
};

/**
 * 认证检测项
 */
export type AuthRequirement = {
  type: "auth";
  command: string;
  expect: string;
  action?: string;
  message?: string;
  helpUrl?: string;
};

/**
 * 环境变量检测项
 */
export type EnvRequirement = {
  type: "env";
  name: string;
  message?: string;
  description?: string;
  placeholder?: string;
  helpUrl?: string;
  help?: EnvHelp;
};

/**
 * 技能依赖检测项
 */
export type SkillDependencyRequirement = {
  type: "skill";
  skillId: string;
  message?: string;
};

/**
 * 脚本检测项
 */
export type ScriptRequirement = {
  type: "script";
  path: string;
  message?: string;
};

/**
 * 所有检测项类型的联合
 */
export type RequirementItem =
  | PlatformRequirement
  | BinRequirement
  | AnyBinRequirement
  | VersionRequirement
  | ServiceRequirement
  | FileRequirement
  | AuthRequirement
  | EnvRequirement
  | SkillDependencyRequirement
  | ScriptRequirement;

/**
 * 获取依赖项数组
 */
export function getRequirements(
  metadata: SkillOpenClawMetadata
): RequirementItem[] {
  return metadata.requires ?? [];
}

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

