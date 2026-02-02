/**
 * 内置技能加载器
 *
 * 从 skills-registry/_builtin/ 目录动态加载内置技能
 *
 * @module skill-marketplace/builtin-loader
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 内置技能 JSON 格式
 */
export interface BuiltinSkillJson {
  name: string;
  displayName: string;
  description: string;
  version: string;
  emoji: string;
  category: string;
  tags: string[];
  builtin: true;
  tools: string[];
  platforms: string[];
  docsUrl?: string;
}

/**
 * 内置技能展示格式 (用于前端)
 */
export interface BuiltinSkillInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  tools: string[];
  tags: string[];
  platforms: string[];
  docsUrl?: string;
}

// 缓存已加载的内置技能
let cachedBuiltinSkills: BuiltinSkillInfo[] | null = null;

/**
 * 获取 _builtin 目录路径
 */
function getBuiltinDir(): string {
  // ESM 环境下获取当前文件目录
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // 从 src/skill-marketplace/ 向上到项目根目录，再进入 skills/_builtin
  return path.resolve(__dirname, "../../skills/_builtin");
}

/**
 * 同步加载所有内置技能
 */
export function loadBuiltinSkillsSync(): BuiltinSkillInfo[] {
  if (cachedBuiltinSkills) {
    return cachedBuiltinSkills;
  }

  const builtinDir = getBuiltinDir();
  const skills: BuiltinSkillInfo[] = [];

  if (!fs.existsSync(builtinDir)) {
    console.warn(`[builtin-loader] _builtin directory not found: ${builtinDir}`);
    return skills;
  }

  const entries = fs.readdirSync(builtinDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillJsonPath = path.join(builtinDir, entry.name, "skill.json");

    if (!fs.existsSync(skillJsonPath)) {
      console.warn(`[builtin-loader] skill.json not found: ${skillJsonPath}`);
      continue;
    }

    try {
      const content = fs.readFileSync(skillJsonPath, "utf-8");
      const json = JSON.parse(content) as BuiltinSkillJson;

      if (!json.builtin) {
        console.warn(`[builtin-loader] Skill ${entry.name} is not marked as builtin`);
        continue;
      }

      skills.push({
        id: json.name,
        name: json.name,
        displayName: json.displayName,
        description: json.description,
        icon: json.emoji,
        tools: json.tools,
        tags: json.tags,
        platforms: json.platforms,
        docsUrl: json.docsUrl,
      });
    } catch (err) {
      console.error(`[builtin-loader] Failed to load ${skillJsonPath}:`, err);
    }
  }

  cachedBuiltinSkills = skills;
  return skills;
}

/**
 * 异步加载所有内置技能
 */
export async function loadBuiltinSkills(): Promise<BuiltinSkillInfo[]> {
  if (cachedBuiltinSkills) {
    return cachedBuiltinSkills;
  }

  const builtinDir = getBuiltinDir();
  const skills: BuiltinSkillInfo[] = [];

  try {
    await fs.promises.access(builtinDir);
  } catch {
    console.warn(`[builtin-loader] _builtin directory not found: ${builtinDir}`);
    return skills;
  }

  const entries = await fs.promises.readdir(builtinDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillJsonPath = path.join(builtinDir, entry.name, "skill.json");

    try {
      await fs.promises.access(skillJsonPath);
    } catch {
      console.warn(`[builtin-loader] skill.json not found: ${skillJsonPath}`);
      continue;
    }

    try {
      const content = await fs.promises.readFile(skillJsonPath, "utf-8");
      const json = JSON.parse(content) as BuiltinSkillJson;

      if (!json.builtin) {
        console.warn(`[builtin-loader] Skill ${entry.name} is not marked as builtin`);
        continue;
      }

      skills.push({
        id: json.name,
        name: json.name,
        displayName: json.displayName,
        description: json.description,
        icon: json.emoji,
        tools: json.tools,
        tags: json.tags,
        platforms: json.platforms,
        docsUrl: json.docsUrl,
      });
    } catch (err) {
      console.error(`[builtin-loader] Failed to load ${skillJsonPath}:`, err);
    }
  }

  cachedBuiltinSkills = skills;
  return skills;
}

/**
 * 清除缓存 (用于开发/测试)
 */
export function clearBuiltinSkillsCache(): void {
  cachedBuiltinSkills = null;
}

/**
 * 检查技能是否为内置
 */
export function isBuiltinSkill(skillId: string): boolean {
  const skills = loadBuiltinSkillsSync();
  return skills.some((s) => s.id === skillId);
}
