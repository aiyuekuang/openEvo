#!/usr/bin/env npx tsx
/**
 * 分析脚本：检查 skill.json 字段使用情况和潜在问题
 *
 * 检查项:
 * 1. name 是否与目录名一致
 * 2. install.bins 是否冗余
 * 3. 字段使用统计
 *
 * 用法:
 *   npx tsx scripts/analyze-skill-json.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

const SKILLS_DIR = path.join(process.cwd(), "skills-registry");

// =============================================================================
// 类型
// =============================================================================

interface InstallOption {
  id: string;
  kind: string;
  formula?: string;
  aptPackage?: string;
  bins?: string[];
  label?: string;
}

interface RequirementItem {
  type: string;
  name?: string;
  names?: string[];
  install?: InstallOption[];
  [key: string]: unknown;
}

interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  emoji?: string;
  homepage?: string;
  category?: string;
  tags?: string[];
  requires?: RequirementItem[];
  capabilities?: unknown[];
  [key: string]: unknown;
}

// =============================================================================
// 分析
// =============================================================================

interface Issue {
  skillId: string;
  type: "warning" | "error" | "suggestion";
  message: string;
}

function analyzeSkills(): void {
  console.log("=".repeat(60));
  console.log("skill.json 分析报告");
  console.log("=".repeat(60));

  const stats = {
    total: 0,
    withVersion: 0,
    withEmoji: 0,
    withHomepage: 0,
    withCategory: 0,
    withTags: 0,
    withRequires: 0,
    withCapabilities: 0,
    requireTypes: {} as Record<string, number>,
  };

  const issues: Issue[] = [];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillId = entry.name;
    const skillJsonPath = path.join(SKILLS_DIR, skillId, "skill.json");
    
    if (!fs.existsSync(skillJsonPath)) {
      issues.push({ skillId, type: "error", message: "缺少 skill.json" });
      continue;
    }

    try {
      const content = fs.readFileSync(skillJsonPath, "utf-8");
      const manifest: SkillManifest = JSON.parse(content);

      stats.total++;

      // 统计字段使用
      if (manifest.version) stats.withVersion++;
      if (manifest.emoji) stats.withEmoji++;
      if (manifest.homepage) stats.withHomepage++;
      if (manifest.category) stats.withCategory++;
      if (manifest.tags && manifest.tags.length > 0) stats.withTags++;
      if (manifest.capabilities && manifest.capabilities.length > 0) stats.withCapabilities++;

      if (manifest.requires && manifest.requires.length > 0) {
        stats.withRequires++;
        for (const req of manifest.requires) {
          stats.requireTypes[req.type] = (stats.requireTypes[req.type] || 0) + 1;
        }
      }

      // 检查问题 1: name 与目录名不一致
      if (manifest.name !== skillId) {
        issues.push({
          skillId,
          type: "warning",
          message: `name "${manifest.name}" ≠ 目录名 "${skillId}"`,
        });
      }

      // 检查问题 2: install.bins 冗余
      if (manifest.requires) {
        for (const req of manifest.requires) {
          if (req.type === "bin" && req.install && Array.isArray(req.install)) {
            for (const opt of req.install) {
              if (opt.bins && opt.bins.length === 1 && opt.bins[0] === req.name) {
                issues.push({
                  skillId,
                  type: "suggestion",
                  message: `requires[${req.name}].install.bins 冗余 (与 name 相同)`,
                });
              }
            }
          }
        }
      }

      // 检查问题 3: 缺少 emoji
      if (!manifest.emoji) {
        issues.push({
          skillId,
          type: "suggestion",
          message: "缺少 emoji 图标",
        });
      }

      // 检查问题 4: description 太短
      if (manifest.description.length < 20) {
        issues.push({
          skillId,
          type: "suggestion",
          message: `description 太短 (${manifest.description.length} 字符)`,
        });
      }

    } catch (e) {
      issues.push({
        skillId,
        type: "error",
        message: `解析失败: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // 输出统计
  console.log("\n📊 字段使用统计:\n");
  console.log(`  总技能数: ${stats.total}`);
  console.log(`  有 version: ${stats.withVersion} (${pct(stats.withVersion, stats.total)})`);
  console.log(`  有 emoji: ${stats.withEmoji} (${pct(stats.withEmoji, stats.total)})`);
  console.log(`  有 homepage: ${stats.withHomepage} (${pct(stats.withHomepage, stats.total)})`);
  console.log(`  有 category: ${stats.withCategory} (${pct(stats.withCategory, stats.total)})`);
  console.log(`  有 tags: ${stats.withTags} (${pct(stats.withTags, stats.total)})`);
  console.log(`  有 requires: ${stats.withRequires} (${pct(stats.withRequires, stats.total)})`);
  console.log(`  有 capabilities: ${stats.withCapabilities} (${pct(stats.withCapabilities, stats.total)})`);

  console.log("\n  requires 类型分布:");
  const sortedTypes = Object.entries(stats.requireTypes).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    console.log(`    ${type}: ${count}`);
  }

  // 输出问题
  const errors = issues.filter((i) => i.type === "error");
  const warnings = issues.filter((i) => i.type === "warning");
  const suggestions = issues.filter((i) => i.type === "suggestion");

  if (errors.length > 0) {
    console.log("\n❌ 错误 (" + errors.length + "):");
    for (const issue of errors) {
      console.log(`  ${issue.skillId}: ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log("\n⚠️  警告 (" + warnings.length + "):");
    for (const issue of warnings) {
      console.log(`  ${issue.skillId}: ${issue.message}`);
    }
  }

  if (suggestions.length > 0) {
    console.log("\n💡 建议 (" + suggestions.length + "):");
    // 按类型分组
    const grouped = new Map<string, string[]>();
    for (const issue of suggestions) {
      const key = issue.message.split(" ")[0]; // 简单分组
      if (!grouped.has(issue.message)) {
        grouped.set(issue.message, []);
      }
      grouped.get(issue.message)!.push(issue.skillId);
    }
    for (const [msg, skills] of grouped) {
      if (skills.length <= 3) {
        console.log(`  ${msg}: ${skills.join(", ")}`);
      } else {
        console.log(`  ${msg}: ${skills.slice(0, 3).join(", ")} 等 ${skills.length} 个`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`总结: ${errors.length} 错误, ${warnings.length} 警告, ${suggestions.length} 建议`);
  console.log("=".repeat(60));
}

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(0)}%`;
}

analyzeSkills();
