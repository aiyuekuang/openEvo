#!/usr/bin/env npx tsx
/**
 * 优化脚本：清理 skill.json 冗余字段
 *
 * 优化项:
 * 1. name 统一使用目录名
 * 2. 移除 install 中冗余的 bins 字段
 *
 * 用法:
 *   npx tsx scripts/optimize-skill-json.ts [--dry-run]
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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

// =============================================================================
// 优化
// =============================================================================

interface OptimizeResult {
  skillId: string;
  changes: string[];
}

function optimizeSkill(skillDir: string, dryRun: boolean): OptimizeResult {
  const skillId = path.basename(skillDir);
  const skillJsonPath = path.join(skillDir, "skill.json");
  const changes: string[] = [];

  if (!fs.existsSync(skillJsonPath)) {
    return { skillId, changes: [] };
  }

  const content = fs.readFileSync(skillJsonPath, "utf-8");
  const manifest: SkillManifest = JSON.parse(content);
  let changed = false;

  // 优化 1: name 统一使用目录名
  if (manifest.name !== skillId) {
    changes.push(`name: "${manifest.name}" → "${skillId}"`);
    manifest.name = skillId;
    changed = true;
  }

  // 优化 2: 移除冗余的 bins 字段
  const requires = manifest.requires as RequirementItem[] | undefined;
  if (requires) {
    for (const req of requires) {
      if (req.type === "bin" && req.install && Array.isArray(req.install)) {
        for (const opt of req.install) {
          if (opt.bins && opt.bins.length === 1 && opt.bins[0] === req.name) {
            changes.push(`requires[${req.name}].install[${opt.id}]: 移除冗余 bins`);
            delete opt.bins;
            changed = true;
          }
        }
      }
    }
  }

  // 写入
  if (changed && !dryRun) {
    fs.writeFileSync(skillJsonPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }

  return { skillId, changes };
}

// =============================================================================
// 主函数
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("skill.json 优化");
  console.log("=".repeat(60));
  if (dryRun) {
    console.log("模式: DRY-RUN\n");
  } else {
    console.log("");
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  let optimized = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const result = optimizeSkill(skillDir, dryRun);

    if (result.changes.length > 0) {
      optimized++;
      console.log(`✅ ${result.skillId}:`);
      for (const change of result.changes) {
        console.log(`   - ${change}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`优化了 ${optimized} 个技能`);
  console.log("=".repeat(60));
}

main();
