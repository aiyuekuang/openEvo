/**
 * 技能市场 - 搜索功能
 *
 * 本地搜索：关键词匹配、分类过滤
 *
 * @module skill-marketplace/search
 */

import { getBuiltinSkills } from "./builtin-catalog.js";
import { getInstalledSkills } from "./registry.js";
import type {
  SkillCategory,
  SkillPackage,
  SkillSearchOptions,
  SkillSearchResult,
} from "./types.js";

/**
 * 默认分页大小
 */
const DEFAULT_LIMIT = 20;

/**
 * 文本匹配分数计算
 * 返回 0-1 之间的相关性分数
 */
function calculateMatchScore(skill: SkillPackage, query: string): number {
  const q = query.toLowerCase();
  let score = 0;

  // 名称完全匹配
  if (skill.name.toLowerCase() === q) {
    score += 100;
  }
  // 名称包含
  else if (skill.name.toLowerCase().includes(q)) {
    score += 50;
  }

  // ID 匹配
  if (skill.id.toLowerCase().includes(q)) {
    score += 30;
  }

  // 描述匹配
  if (skill.description.toLowerCase().includes(q)) {
    score += 20;
  }

  // 标签匹配
  const matchedTags = skill.tags.filter((tag) => tag.toLowerCase().includes(q));
  score += matchedTags.length * 15;

  // 长描述匹配
  if (skill.longDescription?.toLowerCase().includes(q)) {
    score += 5;
  }

  return score;
}

/**
 * 排序技能列表
 */
function sortSkills(
  skills: SkillPackage[],
  sortBy: SkillSearchOptions["sortBy"],
  sortOrder: SkillSearchOptions["sortOrder"],
  query?: string,
): SkillPackage[] {
  const order = sortOrder === "asc" ? 1 : -1;

  return [...skills].sort((a, b) => {
    // 如果有搜索词，优先按相关性排序
    if (query && !sortBy) {
      const scoreA = calculateMatchScore(a, query);
      const scoreB = calculateMatchScore(b, query);
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // 分数高的在前
      }
    }

    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name) * order;
      case "downloads":
        return (a.downloads - b.downloads) * order;
      case "rating":
        return (a.rating.average - b.rating.average) * order;
      case "updatedAt":
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * order;
      default:
        // 默认: 推荐 > 认证 > 下载量
        if (a.featured !== b.featured) {
          return a.featured ? -1 : 1;
        }
        if (a.verified !== b.verified) {
          return a.verified ? -1 : 1;
        }
        return (b.downloads - a.downloads) * order;
    }
  });
}

/**
 * 搜索技能
 */
export async function searchSkills(options: SkillSearchOptions = {}): Promise<SkillSearchResult> {
  const {
    query,
    category,
    tags,
    installedOnly,
    verifiedOnly,
    featuredOnly,
    sortBy,
    sortOrder = "desc",
    offset = 0,
    limit = DEFAULT_LIMIT,
  } = options;

  // 获取所有技能 (内置 + 已安装)
  let skills = getBuiltinSkills();

  // 获取已安装技能 ID 集合
  const installedSkills = await getInstalledSkills();
  const installedIds = new Set(installedSkills.map((s) => s.id));

  // 过滤: 只显示已安装
  if (installedOnly) {
    skills = skills.filter((skill) => installedIds.has(skill.id));
  }

  // 过滤: 只显示官方认证
  if (verifiedOnly) {
    skills = skills.filter((skill) => skill.verified);
  }

  // 过滤: 只显示推荐
  if (featuredOnly) {
    skills = skills.filter((skill) => skill.featured);
  }

  // 过滤: 分类
  if (category) {
    skills = skills.filter((skill) => skill.category === category);
  }

  // 过滤: 标签
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    skills = skills.filter((skill) => skill.tags.some((t) => tagSet.has(t.toLowerCase())));
  }

  // 过滤: 关键词搜索
  if (query) {
    const q = query.toLowerCase();
    skills = skills.filter((skill) => {
      const score = calculateMatchScore(skill, q);
      return score > 0;
    });
  }

  // 排序
  skills = sortSkills(skills, sortBy, sortOrder, query);

  // 总数
  const total = skills.length;

  // 分页
  const paginatedSkills = skills.slice(offset, offset + limit);

  return {
    skills: paginatedSkills,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * 按分类浏览技能
 */
export async function browseByCategory(category?: SkillCategory): Promise<SkillSearchResult> {
  return searchSkills({
    category,
    sortBy: "downloads",
    sortOrder: "desc",
  });
}

/**
 * 获取推荐技能
 */
export async function getFeaturedSkills(): Promise<SkillPackage[]> {
  const result = await searchSkills({ featuredOnly: true });
  return result.skills;
}

/**
 * 获取热门技能 (按下载量)
 */
export async function getTrendingSkills(limit = 10): Promise<SkillPackage[]> {
  const result = await searchSkills({
    sortBy: "downloads",
    sortOrder: "desc",
    limit,
  });
  return result.skills;
}

/**
 * 获取最新技能
 */
export async function getLatestSkills(limit = 10): Promise<SkillPackage[]> {
  const result = await searchSkills({
    sortBy: "updatedAt",
    sortOrder: "desc",
    limit,
  });
  return result.skills;
}

/**
 * 获取已安装技能的详细信息
 */
export async function getInstalledSkillPackages(): Promise<SkillPackage[]> {
  const result = await searchSkills({ installedOnly: true });
  return result.skills;
}

/**
 * 根据 ID 获取技能
 */
export function getSkillById(skillId: string): SkillPackage | undefined {
  return getBuiltinSkills().find((skill) => skill.id === skillId);
}

/**
 * 获取相似技能 (同分类 + 相同标签)
 */
export async function getSimilarSkills(
  skillId: string,
  limit = 5,
): Promise<SkillPackage[]> {
  const skill = getSkillById(skillId);
  if (!skill) return [];

  const allSkills = getBuiltinSkills().filter((s) => s.id !== skillId);

  // 计算相似度分数
  const scored = allSkills.map((s) => {
    let score = 0;

    // 同分类
    if (s.category === skill.category) {
      score += 50;
    }

    // 相同标签
    const commonTags = s.tags.filter((t) =>
      skill.tags.some((st) => st.toLowerCase() === t.toLowerCase()),
    );
    score += commonTags.length * 10;

    return { skill: s, score };
  });

  // 排序并取前 N 个
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.skill);
}
