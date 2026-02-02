#!/usr/bin/env npx tsx
/**
 * 测试 GitHub 技能的 auth 检测
 */

import { parseSkillJson, manifestToOpenClawMetadata } from "../src/skill-marketplace/skill-manifest.js";
import { checkDependencies } from "../src/skill-marketplace/dependency-checker.js";
import * as path from "path";

const skillsDir = "./skills-registry";
const skillDir = path.join(skillsDir, "github");

console.log("=== 测试 skill.json 读取 ===");
const manifest = parseSkillJson(skillDir);
console.log("manifest found:", !!manifest);
console.log("manifest.name:", manifest?.name);
console.log("manifest.requires:", manifest?.requires?.length, "项");

if (manifest) {
  console.log("\n=== 转换为 metadata ===");
  const metadata = manifestToOpenClawMetadata(manifest);
  console.log("metadata.requires:", metadata.requires?.length, "项");
  
  console.log("\n=== 检测依赖 ===");
  const result = checkDependencies(metadata.requires, metadata);
  console.log("satisfied:", result.satisfied);
  console.log("missingBins:", result.missingBins);
  console.log("authFailed:", JSON.stringify(result.authFailed, null, 2));
}
