#!/usr/bin/env npx tsx
/**
 * 迁移脚本：将 SKILL.md frontmatter 提取到 skill.json
 *
 * 功能:
 * 1. 读取每个 SKILL.md 的 frontmatter
 * 2. 生成 skill.json 文件
 * 3. 更新 SKILL.md，移除冗余的 metadata 字段
 *
 * 用法:
 *   npx tsx scripts/migrate-skill-json.ts [--dry-run] [--skill <skill-id>]
 *
 * 选项:
 *   --dry-run    只显示将要做的更改，不实际写入
 *   --skill      只迁移指定的技能
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillManifest, SkillOpenClawMetadata } from "../src/skill-marketplace/skill-metadata.js";

// =============================================================================
// 配置
// =============================================================================

const SKILLS_DIR = path.join(process.cwd(), "skills-registry");
const SKILL_MD_FILE = "SKILL.md";
const SKILL_JSON_FILE = "skill.json";

// =============================================================================
// 解析函数
// =============================================================================

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  homepage?: string;
  metadata?: string;
}

function parseFrontmatter(content: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
  rawYaml: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content, rawYaml: "" };
  }

  const [, yamlContent, body] = match;
  const frontmatter: ParsedFrontmatter = {};

  for (const line of yamlContent.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim() as keyof ParsedFrontmatter;
      let value = line.slice(colonIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body, rawYaml: yamlContent };
}

function parseOpenClawMetadata(metadataStr: string): SkillOpenClawMetadata | undefined {
  try {
    const parsed = JSON.parse(metadataStr);
    return parsed.openclaw as SkillOpenClawMetadata;
  } catch {
    return undefined;
  }
}

// =============================================================================
// 迁移逻辑
// =============================================================================

interface MigrationResult {
  skillId: string;
  success: boolean;
  message: string;
  skillJsonCreated: boolean;
  skillMdUpdated: boolean;
}

function migrateSkill(skillDir: string, dryRun: boolean): MigrationResult {
  const skillId = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, SKILL_MD_FILE);
  const skillJsonPath = path.join(skillDir, SKILL_JSON_FILE);

  // 检查 SKILL.md 是否存在
  if (!fs.existsSync(skillMdPath)) {
    return {
      skillId,
      success: false,
      message: "SKILL.md 不存在",
      skillJsonCreated: false,
      skillMdUpdated: false,
    };
  }

  // 如果 skill.json 已存在，跳过
  if (fs.existsSync(skillJsonPath)) {
    return {
      skillId,
      success: true,
      message: "skill.json 已存在，跳过",
      skillJsonCreated: false,
      skillMdUpdated: false,
    };
  }

  // 读取并解析 SKILL.md
  const content = fs.readFileSync(skillMdPath, "utf-8");
  const { frontmatter, body, rawYaml } = parseFrontmatter(content);

  if (!frontmatter.name) {
    return {
      skillId,
      success: false,
      message: "SKILL.md 缺少 name 字段",
      skillJsonCreated: false,
      skillMdUpdated: false,
    };
  }

  // 解析 openclaw metadata
  const openclaw = frontmatter.metadata
    ? parseOpenClawMetadata(frontmatter.metadata)
    : undefined;

  // 构建 skill.json
  const manifest: SkillManifest = {
    name: frontmatter.name,
    description: frontmatter.description || "",
  };

  if (frontmatter.homepage) {
    manifest.homepage = frontmatter.homepage;
  }

  if (openclaw) {
    if (openclaw.version) manifest.version = openclaw.version;
    if (openclaw.emoji) manifest.emoji = openclaw.emoji;
    if (openclaw.requires && openclaw.requires.length > 0) {
      manifest.requires = openclaw.requires;
    }
    if (openclaw.category) manifest.category = openclaw.category;
    if (openclaw.tags && openclaw.tags.length > 0) {
      manifest.tags = openclaw.tags;
    }
    if (openclaw.capabilities && openclaw.capabilities.length > 0) {
      manifest.capabilities = openclaw.capabilities;
    }
    if (openclaw.minOpenClawVersion) {
      manifest.minOpenClawVersion = openclaw.minOpenClawVersion;
    }
  }

  // 构建新的 SKILL.md (移除 metadata 字段，保留 name/description/homepage)
  const newFrontmatterLines: string[] = [];
  for (const line of rawYaml.split("\n")) {
    // 跳过 metadata 行
    if (line.startsWith("metadata:")) {
      continue;
    }
    newFrontmatterLines.push(line);
  }

  const newSkillMd = `---\n${newFrontmatterLines.join("\n")}\n---\n${body}`;

  if (dryRun) {
    console.log(`\n[DRY-RUN] ${skillId}:`);
    console.log(`  skill.json: ${JSON.stringify(manifest, null, 2).split("\n").slice(0, 5).join("\n")}...`);
    console.log(`  SKILL.md: 移除 metadata 字段`);
    return {
      skillId,
      success: true,
      message: "[DRY-RUN] 将创建 skill.json 并更新 SKILL.md",
      skillJsonCreated: true,
      skillMdUpdated: true,
    };
  }

  // 写入 skill.json
  fs.writeFileSync(skillJsonPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  // 更新 SKILL.md
  fs.writeFileSync(skillMdPath, newSkillMd, "utf-8");

  return {
    skillId,
    success: true,
    message: "迁移成功",
    skillJsonCreated: true,
    skillMdUpdated: true,
  };
}

// =============================================================================
// 主函数
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skillIndex = args.indexOf("--skill");
  const targetSkill = skillIndex >= 0 ? args[skillIndex + 1] : null;

  console.log("=".repeat(60));
  console.log("技能模块化迁移: SKILL.md -> skill.json");
  console.log("=".repeat(60));
  if (dryRun) {
    console.log("模式: DRY-RUN (不实际写入文件)");
  }
  if (targetSkill) {
    console.log(`目标技能: ${targetSkill}`);
  }
  console.log("");

  // 扫描技能目录
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const results: MigrationResult[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (targetSkill && entry.name !== targetSkill) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const result = migrateSkill(skillDir, dryRun);
    results.push(result);

    if (result.success) {
      if (result.skillJsonCreated) {
        created++;
        if (result.skillMdUpdated) updated++;
        console.log(`✅ ${result.skillId}: ${result.message}`);
      } else {
        skipped++;
        console.log(`⏭️  ${result.skillId}: ${result.message}`);
      }
    } else {
      failed++;
      console.log(`❌ ${result.skillId}: ${result.message}`);
    }
  }

  // 打印统计
  console.log("");
  console.log("=".repeat(60));
  console.log("迁移统计:");
  console.log(`  创建 skill.json: ${created}`);
  console.log(`  更新 SKILL.md:   ${updated}`);
  console.log(`  跳过:            ${skipped}`);
  console.log(`  失败:            ${failed}`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
