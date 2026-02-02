#!/usr/bin/env node
/**
 * 生成内置技能索引
 *
 * 从 skills-registry/_builtin/ 目录读取所有 skill.json，
 * 生成 src/skill-marketplace/builtin-skills.json
 *
 * 用法: node scripts/generate-builtin-index.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const builtinDir = path.join(rootDir, "skills/_builtin");
const outputPath = path.join(rootDir, "src/skill-marketplace/builtin-skills.json");

function main() {
  console.log("🔍 Scanning _builtin directory:", builtinDir);

  if (!fs.existsSync(builtinDir)) {
    console.error("❌ _builtin directory not found");
    process.exit(1);
  }

  const entries = fs.readdirSync(builtinDir, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillJsonPath = path.join(builtinDir, entry.name, "skill.json");

    if (!fs.existsSync(skillJsonPath)) {
      console.warn(`⚠️  skill.json not found: ${entry.name}`);
      continue;
    }

    try {
      const content = fs.readFileSync(skillJsonPath, "utf-8");
      const json = JSON.parse(content);

      if (!json.builtin) {
        console.warn(`⚠️  Skill ${entry.name} is not marked as builtin`);
        continue;
      }

      skills.push({
        id: json.name,
        name: json.displayName,
        description: json.description,
        icon: json.emoji,
        type: json.category === "tool" ? "tool" : json.category,
        toolNames: json.tools,
        tags: json.tags,
        platforms: json.platforms,
        docsUrl: json.docsUrl || `https://openclaw.cn/docs/tools/${json.name}`,
      });

      console.log(`✅ Loaded: ${json.displayName} (${entry.name})`);
    } catch (err) {
      console.error(`❌ Failed to load ${skillJsonPath}:`, err.message);
    }
  }

  // 按名称排序
  skills.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  // 写入 JSON 文件
  const output = {
    $schema: "./builtin-skills.schema.json",
    generatedAt: new Date().toISOString(),
    count: skills.length,
    skills,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n📦 Generated: ${outputPath}`);
  console.log(`   Total skills: ${skills.length}`);
}

main();
