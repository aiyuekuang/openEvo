/**
 * 技能元数据解析器
 *
 * 解析 SKILL.md 文件中的 frontmatter 元数据
 *
 * @module skill-marketplace/skill-parser
 */
import * as fs from "node:fs";
import * as path from "node:path";
// =============================================================================
// 解析函数
// =============================================================================
/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
        return { frontmatter: {}, body: content };
    }
    const [, yamlContent, body] = match;
    const frontmatter = {};
    // 简单的 YAML 解析（只处理 key: value 格式）
    for (const line of yamlContent.split("\n")) {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();
            // 移除引号
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            frontmatter[key] = value;
        }
    }
    return { frontmatter, body };
}
/**
 * 解析 metadata JSON 字符串
 */
function parseMetadataJson(metadataStr) {
    try {
        const parsed = JSON.parse(metadataStr);
        return parsed.openclaw;
    }
    catch {
        return undefined;
    }
}
/**
 * 解析 SKILL.md 文件内容
 */
export function parseSkillContent(content) {
    try {
        const { frontmatter, body } = parseFrontmatter(content);
        const result = {
            name: frontmatter.name || "Unknown",
            description: frontmatter.description || "",
            homepage: frontmatter.homepage,
            content: body,
        };
        // 解析 metadata JSON
        if (frontmatter.metadata) {
            result.openclaw = parseMetadataJson(frontmatter.metadata);
        }
        return result;
    }
    catch (error) {
        return {
            name: "Unknown",
            description: "",
            content: "",
            error: error instanceof Error ? error.message : "解析失败",
        };
    }
}
/**
 * 从文件路径解析技能信息
 */
export function parseSkillFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return parseSkillContent(content);
    }
    catch (error) {
        return {
            name: "Unknown",
            description: "",
            content: "",
            error: error instanceof Error ? error.message : "读取文件失败",
        };
    }
}
/**
 * 从技能目录解析技能信息
 */
export function parseSkillDir(skillDir) {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    return parseSkillFile(skillMdPath);
}
// =============================================================================
// 配置字段生成
// =============================================================================
/**
 * 根据环境变量名生成配置字段定义
 */
export function generateConfigFields(metadata) {
    const fields = [];
    const envVars = metadata.requires?.env || [];
    for (const envVar of envVars) {
        // 根据命名推断字段类型
        const isApiKey = envVar.toLowerCase().includes("api_key") ||
            envVar.toLowerCase().includes("apikey") ||
            envVar.toLowerCase().includes("secret") ||
            envVar.toLowerCase().includes("token");
        const isUrl = envVar.toLowerCase().includes("url") || envVar.toLowerCase().includes("endpoint");
        // 生成友好的标签名
        const label = envVar
            .replace(/_/g, " ")
            .replace(/API KEY/gi, "API Key")
            .replace(/\b\w/g, (c) => c.toUpperCase());
        fields.push({
            key: envVar,
            label,
            type: isApiKey ? "password" : isUrl ? "url" : "text",
            required: true,
            placeholder: isApiKey ? "输入您的 API Key" : `输入 ${label}`,
        });
    }
    return fields;
}
/**
 * 获取技能的主要配置项名称
 */
export function getPrimaryConfigName(metadata) {
    if (metadata.primaryEnv) {
        return metadata.primaryEnv;
    }
    const envVars = metadata.requires?.env || [];
    return envVars[0];
}
// =============================================================================
// 技能目录扫描
// =============================================================================
/**
 * 扫描技能目录，返回所有技能的元数据
 */
export function scanSkillsDir(skillsDir) {
    const skills = new Map();
    try {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const skillDir = path.join(skillsDir, entry.name);
                const skillMdPath = path.join(skillDir, "SKILL.md");
                if (fs.existsSync(skillMdPath)) {
                    const info = parseSkillFile(skillMdPath);
                    skills.set(entry.name, info);
                }
            }
        }
    }
    catch (error) {
        console.error("扫描技能目录失败:", error);
    }
    return skills;
}
