/**
 * 技能市场 - 类型定义
 *
 * @module skill-marketplace/types
 */

// =============================================================================
// 技能分类
// =============================================================================

/**
 * 技能分类
 */
export type SkillCategory =
  | "channel" // 渠道集成 (企业微信/钉钉/飞书)
  | "provider" // 模型提供商 (DeepSeek/智谱/文心)
  | "tool" // 工具技能 (搜索/天气/翻译)
  | "memory" // 记忆系统
  | "automation" // 自动化
  | "analytics" // 分析统计
  | "security" // 安全合规
  | "integration" // 第三方集成
  | "utility"; // 实用工具

/**
 * 分类元数据
 */
export type SkillCategoryMeta = {
  id: SkillCategory;
  label: string;
  labelEn: string;
  description: string;
  icon: string;
  order: number;
};

/**
 * 所有分类的元数据
 */
export const SKILL_CATEGORIES: SkillCategoryMeta[] = [
  {
    id: "channel",
    label: "渠道集成",
    labelEn: "Channels",
    description: "企业微信、钉钉、飞书等消息渠道",
    icon: "💬",
    order: 1,
  },
  {
    id: "provider",
    label: "模型提供商",
    labelEn: "Providers",
    description: "DeepSeek、智谱、文心等 AI 模型",
    icon: "🤖",
    order: 2,
  },
  {
    id: "tool",
    label: "工具技能",
    labelEn: "Tools",
    description: "搜索、天气、翻译等实用工具",
    icon: "🔧",
    order: 3,
  },
  {
    id: "memory",
    label: "记忆系统",
    labelEn: "Memory",
    description: "长期记忆、知识库集成",
    icon: "🧠",
    order: 4,
  },
  {
    id: "automation",
    label: "自动化",
    labelEn: "Automation",
    description: "定时任务、工作流自动化",
    icon: "⚡",
    order: 5,
  },
  {
    id: "analytics",
    label: "分析统计",
    labelEn: "Analytics",
    description: "使用统计、对话分析",
    icon: "📊",
    order: 6,
  },
  {
    id: "security",
    label: "安全合规",
    labelEn: "Security",
    description: "内容审核、敏感词过滤",
    icon: "🔒",
    order: 7,
  },
  {
    id: "integration",
    label: "第三方集成",
    labelEn: "Integrations",
    description: "外部服务 API 集成",
    icon: "🔗",
    order: 8,
  },
  {
    id: "utility",
    label: "实用工具",
    labelEn: "Utilities",
    description: "其他实用功能",
    icon: "🛠️",
    order: 9,
  },
];

// =============================================================================
// 技能作者
// =============================================================================

/**
 * 技能作者信息
 */
export type SkillAuthor = {
  name: string;
  email?: string;
  url?: string;
  /** 是否官方认证开发者 */
  verified?: boolean;
};

// =============================================================================
// 技能能力声明
// =============================================================================

/**
 * 技能能力声明 - 描述技能提供的功能
 */
export type SkillCapability =
  | { type: "tool"; names: string[] }
  | { type: "hook"; events: string[] }
  | { type: "channel"; id: string }
  | { type: "provider"; id: string }
  | { type: "command"; names: string[] }
  | { type: "service"; id: string };

// =============================================================================
// 技能评分
// =============================================================================

/**
 * 技能评分统计
 */
export type SkillRating = {
  /** 平均分 (1-5) */
  average: number;
  /** 评分人数 */
  count: number;
  /** 1-5星分布 */
  distribution: [number, number, number, number, number];
};

/**
 * 技能评价
 */
export type SkillReview = {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  title?: string;
  comment?: string;
  createdAt: string;
  /** 有用数 */
  helpful: number;
  /** 评价的版本 */
  version: string;
};

// =============================================================================
// 技能包
// =============================================================================

/**
 * 技能包安装来源
 */
export type SkillSource =
  | { type: "builtin"; skillPath?: string } // 内置技能，skillPath 用于定位 SKILL.md 文件
  | { type: "npm"; spec: string } // npm 包
  | { type: "local"; path: string } // 本地路径
  | { type: "git"; url: string; ref?: string } // Git 仓库
  | { type: "url"; url: string }; // 远程 URL

/**
 * 技能包定义 - 完整的技能元数据
 */
export type SkillPackage = {
  /** 唯一标识 (如: @openclaw/wecom) */
  id: string;
  /** 显示名称 */
  name: string;
  /** 语义化版本 */
  version: string;
  /** 简介 */
  description: string;
  /** 详细描述 (Markdown) */
  longDescription?: string;
  /** 作者信息 */
  author: SkillAuthor;
  /** 许可证 */
  license: string;
  /** 主页 URL */
  homepage?: string;
  /** 仓库 URL */
  repository?: string;

  // 分类与标签
  /** 技能分类 */
  category: SkillCategory;
  /** 标签 */
  tags: string[];

  // 能力声明
  /** 技能能力 */
  capabilities: SkillCapability[];

  // 依赖
  /** 依赖的其他技能 */
  dependencies?: Record<string, string>;
  /** 对等依赖 */
  peerDependencies?: Record<string, string>;

  // 兼容性
  /** 引擎要求 */
  engines: {
    /** OpenClaw 最低版本 */
    openclaw: string;
    /** Node.js 版本 */
    node?: string;
  };

  // 安装来源
  /** 安装来源 */
  source: SkillSource;

  // 资源
  /** 图标 (emoji 或 URL) */
  icon?: string;
  /** 截图 URL 列表 */
  screenshots?: string[];
  /** README 内容 */
  readme?: string;
  /** 更新日志 */
  changelog?: string;

  // 市场元数据
  /** 发布时间 */
  publishedAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 下载次数 */
  downloads: number;
  /** 评分 */
  rating: SkillRating;
  /** 是否官方认证 */
  verified: boolean;
  /** 是否推荐 */
  featured?: boolean;
  /** 是否已废弃 */
  deprecated?: boolean;
  /** 废弃原因 */
  deprecatedReason?: string;
};

// =============================================================================
// 已安装技能
// =============================================================================

/**
 * 已安装技能的状态
 */
export type InstalledSkillStatus = "active" | "disabled" | "error";

/**
 * 已安装技能记录
 */
export type InstalledSkill = {
  /** 技能 ID */
  id: string;
  /** 已安装版本 */
  version: string;
  /** 安装来源 */
  source: SkillSource;
  /** 安装时间 */
  installedAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 状态 */
  status: InstalledSkillStatus;
  /** 错误信息 (如果状态为 error) */
  error?: string;
  /** 安装路径 */
  installPath?: string;
  /** 是否锁定版本 (不自动更新) */
  locked?: boolean;
};

// =============================================================================
// 市场配置
// =============================================================================

/**
 * 技能注册源
 */
export type SkillRegistry = {
  /** 名称 */
  name: string;
  /** API URL */
  url: string;
  /** 类型 */
  type: "official" | "community" | "private";
  /** 优先级 (越高越优先) */
  priority: number;
  /** 是否启用 */
  enabled: boolean;
};

/**
 * 技能市场配置
 */
export type SkillMarketplaceConfig = {
  /** 是否启用 */
  enabled: boolean;
  /** 注册源列表 */
  registries: SkillRegistry[];
  /** 自动更新 */
  autoUpdate: boolean;
  /** 更新检查间隔 (小时) */
  updateCheckInterval: number;
  /** 自定义安装目录 */
  installDir?: string;
  /** 允许未认证技能 */
  allowUntrusted: boolean;
};

// =============================================================================
// 搜索与过滤
// =============================================================================

/**
 * 搜索选项
 */
export type SkillSearchOptions = {
  /** 搜索关键词 */
  query?: string;
  /** 分类过滤 */
  category?: SkillCategory;
  /** 标签过滤 */
  tags?: string[];
  /** 只显示已安装 */
  installedOnly?: boolean;
  /** 只显示官方认证 */
  verifiedOnly?: boolean;
  /** 只显示推荐 */
  featuredOnly?: boolean;
  /** 排序方式 */
  sortBy?: "name" | "downloads" | "rating" | "updatedAt";
  /** 排序方向 */
  sortOrder?: "asc" | "desc";
  /** 分页: 偏移 */
  offset?: number;
  /** 分页: 数量 */
  limit?: number;
};

/**
 * 搜索结果
 */
export type SkillSearchResult = {
  /** 技能列表 */
  skills: SkillPackage[];
  /** 总数 */
  total: number;
  /** 是否有更多 */
  hasMore: boolean;
};

// =============================================================================
// API 响应类型 (预留)
// =============================================================================

/**
 * API 响应基础类型
 */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/**
 * 技能列表响应
 */
export type SkillListResponse = ApiResponse<SkillSearchResult>;

/**
 * 技能详情响应
 */
export type SkillDetailResponse = ApiResponse<SkillPackage>;

/**
 * 安装结果
 */
export type SkillInstallResult =
  | { ok: true; skill: InstalledSkill }
  | { ok: false; error: string };

/**
 * 卸载结果
 */
export type SkillUninstallResult = { ok: true } | { ok: false; error: string };
