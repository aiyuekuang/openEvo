/**
 * 技能清单解析器
 *
 * 解析技能目录中的 skill.json 文件
 * 支持向后兼容 SKILL.md frontmatter 格式
 *
 * @module skill-marketplace/skill-manifest
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillManifest, SkillOpenClawMetadata } from "./skill-metadata.js";

// =============================================================================
// 常量
// =============================================================================

/** skill.json 文件名 */
export const SKILL_MANIFEST_FILE = "skill.json";

/** SKILL.md 文件名 */
export const SKILL_MD_FILE = "SKILL.md";

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 解析后的技能信息
 */
export type ParsedSkill = {
  /** 技能 ID (目录名) */
  id: string;
  /** 技能清单 (来自 skill.json 或 SKILL.md frontmatter) */
  manifest: SkillManifest;
  /** Markdown 内容 */
  content: string;
  /** 技能目录路径 */
  skillDir: string;
  /** 数据来源 */
  source: "skill.json" | "SKILL.md";
  /** 解析错误 */
  error?: string;
};

// =============================================================================
// 解析函数
// =============================================================================

/**
 * 解析 skill.json 文件
 *
 * @param skillDir - 技能目录路径
 * @returns 解析后的 SkillManifest 或 null
 */
export function parseSkillJson(skillDir: string): SkillManifest | null {
  const jsonPath = path.join(skillDir, SKILL_MANIFEST_FILE);

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(jsonPath, "utf-8");
    const manifest = JSON.parse(content) as SkillManifest;

    // 验证必填字段
    if (!manifest.name || !manifest.description) {
      console.warn(`[skill-manifest] ${skillDir}: skill.json 缺少必填字段 name/description`);
      return null;
    }

    return manifest;
  } catch (error) {
    console.error(`[skill-manifest] 解析 ${jsonPath} 失败:`, error);
    return null;
  }
}

/**
 * 从 SKILL.md frontmatter 解析元数据 (向后兼容)
 *
 * @param skillDir - 技能目录路径
 * @returns 解析后的 SkillManifest 或 null
 */
export function parseSkillMdFrontmatter(skillDir: string): {
  manifest: SkillManifest | null;
  content: string;
} {
  const mdPath = path.join(skillDir, SKILL_MD_FILE);

  if (!fs.existsSync(mdPath)) {
    return { manifest: null, content: "" };
  }

  try {
    const fileContent = fs.readFileSync(mdPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(fileContent);

    if (!frontmatter.name) {
      return { manifest: null, content: body };
    }

    // 解析 metadata JSON 字符串
    let openclaw: SkillOpenClawMetadata | undefined;
    if (frontmatter.metadata) {
      try {
        const parsed = JSON.parse(frontmatter.metadata);
        openclaw = parsed.openclaw;
      } catch {
        // 忽略解析错误
      }
    }

    // 转换为 SkillManifest 格式
    const manifest: SkillManifest = {
      name: frontmatter.name,
      description: frontmatter.description || "",
      homepage: frontmatter.homepage,
      // 从 openclaw 元数据提取
      version: openclaw?.version,
      emoji: openclaw?.emoji,
      category: openclaw?.category,
      tags: openclaw?.tags,
      requires: openclaw?.requires,
      capabilities: openclaw?.capabilities,
      minOpenClawVersion: openclaw?.minOpenClawVersion,
    };

    return { manifest, content: body };
  } catch (error) {
    console.error(`[skill-manifest] 解析 ${mdPath} 失败:`, error);
    return { manifest: null, content: "" };
  }
}

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yamlContent, body] = match;
  const frontmatter: Record<string, string> = {};

  // 简单的 YAML 解析（只处理 key: value 格式）
  for (const line of yamlContent.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * 解析技能目录
 *
 * 优先使用 skill.json，如果不存在则回退到 SKILL.md frontmatter
 *
 * @param skillDir - 技能目录路径
 * @returns 解析后的技能信息
 */
export function parseSkillDir(skillDir: string): ParsedSkill {
  const skillId = path.basename(skillDir);

  // 1. 优先尝试 skill.json
  const manifestFromJson = parseSkillJson(skillDir);
  if (manifestFromJson) {
    // 读取 SKILL.md 内容 (如果存在)
    const mdPath = path.join(skillDir, SKILL_MD_FILE);
    let content = "";
    if (fs.existsSync(mdPath)) {
      const fileContent = fs.readFileSync(mdPath, "utf-8");
      const { body } = parseFrontmatter(fileContent);
      content = body;
    }

    return {
      id: skillId,
      manifest: manifestFromJson,
      content,
      skillDir,
      source: "skill.json",
    };
  }

  // 2. 回退到 SKILL.md frontmatter
  const { manifest: manifestFromMd, content } = parseSkillMdFrontmatter(skillDir);
  if (manifestFromMd) {
    return {
      id: skillId,
      manifest: manifestFromMd,
      content,
      skillDir,
      source: "SKILL.md",
    };
  }

  // 3. 解析失败
  return {
    id: skillId,
    manifest: {
      name: skillId,
      description: "",
    },
    content: "",
    skillDir,
    source: "SKILL.md",
    error: "未找到 skill.json 或有效的 SKILL.md frontmatter",
  };
}

/**
 * 读取 SKILL.md 文件内容 (纯 Markdown，不含 frontmatter)
 */
export function readSkillContent(skillDir: string): string {
  const mdPath = path.join(skillDir, SKILL_MD_FILE);

  if (!fs.existsSync(mdPath)) {
    return "";
  }

  try {
    const fileContent = fs.readFileSync(mdPath, "utf-8");
    const { body } = parseFrontmatter(fileContent);
    return body;
  } catch {
    return "";
  }
}

/**
 * 检查技能目录是否有效
 */
export function isValidSkillDir(skillDir: string): boolean {
  const hasSkillJson = fs.existsSync(path.join(skillDir, SKILL_MANIFEST_FILE));
  const hasSkillMd = fs.existsSync(path.join(skillDir, SKILL_MD_FILE));
  return hasSkillJson || hasSkillMd;
}

/**
 * 扫描技能目录，返回所有技能
 *
 * @param skillsDir - 技能注册表目录 (如: skills-registry/)
 * @returns 技能 ID 到 ParsedSkill 的映射
 */
export function scanSkillsDirectory(skillsDir: string): Map<string, ParsedSkill> {
  const skills = new Map<string, ParsedSkill>();

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(skillsDir, entry.name);

        if (isValidSkillDir(skillDir)) {
          const skill = parseSkillDir(skillDir);
          skills.set(entry.name, skill);
        }
      }
    }
  } catch (error) {
    console.error("[skill-manifest] 扫描技能目录失败:", error);
  }

  return skills;
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 将 SkillManifest 转换为旧的 SkillOpenClawMetadata 格式
 * 用于向后兼容
 */
export function manifestToOpenClawMetadata(manifest: SkillManifest): SkillOpenClawMetadata {
  return {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    emoji: manifest.emoji,
    requires: manifest.requires,
    category: manifest.category,
    tags: manifest.tags,
    capabilities: manifest.capabilities,
    minOpenClawVersion: manifest.minOpenClawVersion,
    // 配置驱动检测 (新架构)
    checks: manifest.checks,
    actions: manifest.actions,
  };
}

/**
 * 写入 skill.json 文件
 */
export function writeSkillJson(skillDir: string, manifest: SkillManifest): void {
  const jsonPath = path.join(skillDir, SKILL_MANIFEST_FILE);
  const content = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(jsonPath, content, "utf-8");
}
