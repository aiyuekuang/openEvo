/**
 * 技能市场模块
 *
 * 允许用户发现、安装、管理 AI 技能/插件
 *
 * @module skill-marketplace
 */

// 类型导出
export type {
  ApiResponse,
  InstalledSkill,
  InstalledSkillStatus,
  SkillAuthor,
  SkillCapability,
  SkillCategory,
  SkillCategoryMeta,
  SkillDetailResponse,
  SkillInstallResult,
  SkillListResponse,
  SkillMarketplaceConfig,
  SkillPackage,
  SkillRating,
  SkillRegistry,
  SkillReview,
  SkillSearchOptions,
  SkillSearchResult,
  SkillSource,
  SkillUninstallResult,
} from "./types.js";

export { SKILL_CATEGORIES } from "./types.js";

// 内置目录
export {
  BUILTIN_SKILLS,
  getBuiltinSkillById,
  getBuiltinSkills,
  getBuiltinSkillsByCategory,
  getFeaturedSkills as getBuiltinFeaturedSkills,
} from "./builtin-catalog.js";

// 本地注册表
export {
  clearInstalledRegistry,
  disableSkill as disableInstalledSkill,
  enableSkill as enableInstalledSkill,
  getActiveSkills,
  getErrorSkills,
  getInstalledSkill,
  getInstalledSkills,
  isSkillInstalled,
  loadInstalledRegistry,
  lockSkillVersion,
  unlockSkillVersion,
} from "./registry.js";

// 搜索
export {
  browseByCategory,
  getFeaturedSkills,
  getInstalledSkillPackages,
  getLatestSkills,
  getSimilarSkills,
  getSkillById,
  getTrendingSkills,
  searchSkills,
} from "./search.js";

// 安装
export {
  checkUpdates,
  disableSkill,
  enableSkill,
  installSkill,
  installSkills,
  uninstallSkill,
  updateSkill,
} from "./install.js";

export type { SkillInstallLogger } from "./install.js";

// CLI
export { createSkillCommand, registerSkillCommand } from "./cli.js";

// API 客户端 (预留)
export {
  createClientFromRegistry,
  createMarketplaceClient,
  DEFAULT_MARKETPLACE_URL,
  MarketplaceClient,
} from "./api/client.js";

export type { MarketplaceClientConfig } from "./api/client.js";
