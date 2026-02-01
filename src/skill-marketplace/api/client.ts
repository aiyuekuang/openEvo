/**
 * 技能市场 - 远程 API 客户端
 *
 * [预留] 用于连接远程技能市场服务
 *
 * @module skill-marketplace/api/client
 */

import type {
  ApiResponse,
  SkillDetailResponse,
  SkillListResponse,
  SkillPackage,
  SkillRegistry,
  SkillSearchOptions,
  SkillSearchResult,
} from "../types.js";

/**
 * 默认官方市场 URL
 */
export const DEFAULT_MARKETPLACE_URL = "https://marketplace.openclaw.cn/api/v1";

/**
 * API 客户端配置
 */
export type MarketplaceClientConfig = {
  /** API 基础 URL */
  baseUrl: string;
  /** 认证令牌 (可选) */
  authToken?: string;
  /** 请求超时 (毫秒) */
  timeout?: number;
};

/**
 * 技能市场 API 客户端
 *
 * [预留] 当前版本使用本地静态目录，此客户端预留给未来远程市场使用
 */
export class MarketplaceClient {
  private readonly config: MarketplaceClientConfig;

  constructor(config: Partial<MarketplaceClientConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? DEFAULT_MARKETPLACE_URL,
      authToken: config.authToken,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * [预留] 搜索技能
   */
  async searchSkills(_options: SkillSearchOptions): Promise<SkillListResponse> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 获取技能详情
   */
  async getSkillDetail(_skillId: string): Promise<SkillDetailResponse> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 获取技能版本列表
   */
  async getSkillVersions(
    _skillId: string,
  ): Promise<ApiResponse<{ versions: string[]; latest: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 下载技能包
   */
  async downloadSkill(
    _skillId: string,
    _version?: string,
  ): Promise<ApiResponse<{ downloadUrl: string; checksum: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 获取推荐技能
   */
  async getFeaturedSkills(): Promise<SkillListResponse> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 获取热门技能
   */
  async getTrendingSkills(_limit?: number): Promise<SkillListResponse> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 获取分类列表
   */
  async getCategories(): Promise<
    ApiResponse<Array<{ id: string; label: string; count: number }>>
  > {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 提交技能评价
   */
  async submitReview(
    _skillId: string,
    _review: { rating: number; title?: string; comment?: string },
  ): Promise<ApiResponse<{ reviewId: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 发布技能
   */
  async publishSkill(
    _packagePath: string,
  ): Promise<ApiResponse<{ skillId: string; version: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 用户登录
   */
  async login(
    _credentials: { username: string; password: string } | { token: string },
  ): Promise<ApiResponse<{ token: string; expiresAt: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 用户登出
   */
  async logout(): Promise<ApiResponse<void>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }

  /**
   * [预留] 检查 API 健康状态
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; version: string }>> {
    // TODO: 实现远程 API 调用
    return {
      ok: false,
      error: "远程市场 API 暂未实现",
      code: "NOT_IMPLEMENTED",
    };
  }
}

/**
 * 创建市场客户端实例
 */
export function createMarketplaceClient(
  config?: Partial<MarketplaceClientConfig>,
): MarketplaceClient {
  return new MarketplaceClient(config);
}

/**
 * 从注册源配置创建客户端
 */
export function createClientFromRegistry(registry: SkillRegistry): MarketplaceClient {
  return new MarketplaceClient({
    baseUrl: registry.url,
  });
}
