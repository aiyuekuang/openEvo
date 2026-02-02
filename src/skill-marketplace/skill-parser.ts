/**
 * 技能元数据解析器
 *
 * 解析 SKILL.md 文件中的 frontmatter 元数据
 * 同时支持新的 skill.json 模式
 *
 * @module skill-marketplace/skill-parser
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillOpenClawMetadata, SkillConfigField } from "./skill-metadata.js";
import { getRequirements } from "./skill-metadata.js";
import {
  parseSkillDir as parseSkillManifest,
  manifestToOpenClawMetadata,
  type ParsedSkill,
} from "./skill-manifest.js";

// =============================================================================
// 类型定义
// =============================================================================

/**
 * SKILL.md frontmatter 结构
 */
export type SkillFrontmatter = {
  name: string;
  description: string;
  homepage?: string;
  metadata?: string; // JSON 字符串
};

/**
 * 解析后的技能信息
 */
export type ParsedSkillInfo = {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 主页 URL */
  homepage?: string;
  /** OpenClaw 元数据 */
  openclaw?: SkillOpenClawMetadata;
  /** Markdown 内容 */
  content: string;
  /** 解析错误 */
  error?: string;
};

// =============================================================================
// 解析函数
// =============================================================================

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
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
function parseMetadataJson(metadataStr: string): SkillOpenClawMetadata | undefined {
  try {
    const parsed = JSON.parse(metadataStr);
    return parsed.openclaw as SkillOpenClawMetadata;
  } catch {
    return undefined;
  }
}

/**
 * 解析 SKILL.md 文件内容
 */
export function parseSkillContent(content: string): ParsedSkillInfo {
  try {
    const { frontmatter, body } = parseFrontmatter(content);

    const result: ParsedSkillInfo = {
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
  } catch (error) {
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
export function parseSkillFile(filePath: string): ParsedSkillInfo {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseSkillContent(content);
  } catch (error) {
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
 *
 * 优先使用 skill.json，如果不存在则回退到 SKILL.md frontmatter
 */
export function parseSkillDir(skillDir: string): ParsedSkillInfo {
  // 使用新的模块化解析器
  const parsed = parseSkillManifest(skillDir);

  // 转换为 ParsedSkillInfo 格式
  return {
    name: parsed.manifest.name,
    description: parsed.manifest.description,
    homepage: parsed.manifest.homepage,
    openclaw: manifestToOpenClawMetadata(parsed.manifest),
    content: parsed.content,
    error: parsed.error,
  };
}

// =============================================================================
// 配置字段生成
// =============================================================================

/**
 * API Key 帮助信息配置（全局默认值，优先使用 SKILL.md 中的 envHelp）
 * 根据环境变量名提供获取 API Key 的帮助链接和说明
 */
const DEFAULT_API_KEY_HELP: Record<string, { description: string; helpUrl: string }> = {
  // 搜索
  BRAVE_SEARCH_API_KEY: {
    description: '免费注册即可获取，每月2000次免费调用',
    helpUrl: 'https://brave.com/search/api/',
  },
  SERPAPI_API_KEY: {
    description: 'SerpAPI 搜索 API，支持 Google/Bing/Baidu 等',
    helpUrl: 'https://serpapi.com/manage-api-key',
  },
  GOOGLE_SEARCH_API_KEY: {
    description: 'Google Custom Search API Key',
    helpUrl: 'https://developers.google.com/custom-search/v1/introduction',
  },
  
  // 大模型 API
  OPENAI_API_KEY: {
    description: 'OpenAI API Key，支持 GPT-4/GPT-3.5',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  ANTHROPIC_API_KEY: {
    description: 'Anthropic Claude API Key',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  DEEPSEEK_API_KEY: {
    description: 'DeepSeek API Key，性价比超高',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  ZHIPU_API_KEY: {
    description: '智谱 GLM API Key',
    helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  QWEN_API_KEY: {
    description: '通义千问 API Key',
    helpUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  DASHSCOPE_API_KEY: {
    description: '阿里云百炼 API Key',
    helpUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  WENXIN_API_KEY: {
    description: '文心一言 API Key',
    helpUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  },
  WENXIN_SECRET_KEY: {
    description: '文心一言 Secret Key',
    helpUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  },
  
  // 笔记/第三方服务
  NOTION_API_KEY: {
    description: 'Notion Integration Token，在 Notion Integrations 创建',
    helpUrl: 'https://www.notion.so/my-integrations',
  },
  GITHUB_TOKEN: {
    description: 'GitHub Personal Access Token',
    helpUrl: 'https://github.com/settings/tokens',
  },
  SLACK_BOT_TOKEN: {
    description: 'Slack Bot Token (xoxb-...)',
    helpUrl: 'https://api.slack.com/apps',
  },
  DISCORD_BOT_TOKEN: {
    description: 'Discord Bot Token',
    helpUrl: 'https://discord.com/developers/applications',
  },
  
  // 企业微信/钉钉/飞书
  WECOM_CORPID: {
    description: '企业微信企业 ID',
    helpUrl: 'https://work.weixin.qq.com/wework_admin/frame#profile',
  },
  WECOM_SECRET: {
    description: '企业微信应用 Secret',
    helpUrl: 'https://work.weixin.qq.com/wework_admin/frame#apps',
  },
  DINGTALK_APP_KEY: {
    description: '钉钉应用 AppKey',
    helpUrl: 'https://open-dev.dingtalk.com/fe/app',
  },
  DINGTALK_APP_SECRET: {
    description: '钉钉应用 AppSecret',
    helpUrl: 'https://open-dev.dingtalk.com/fe/app',
  },
  FEISHU_APP_ID: {
    description: '飞书应用 App ID',
    helpUrl: 'https://open.feishu.cn/app',
  },
  FEISHU_APP_SECRET: {
    description: '飞书应用 App Secret',
    helpUrl: 'https://open.feishu.cn/app',
  },
};

/**
 * 从规范化的 requires 数组中提取环境变量名列表
 */
function extractEnvVarsFromRequirements(metadata: SkillOpenClawMetadata): string[] {
  const requirements = getRequirements(metadata);
  const envVars: string[] = [];
  
  for (const req of requirements) {
    if (req.type === "env") {
      envVars.push(req.name);
    }
  }
  
  return envVars;
}

/**
 * 根据环境变量名生成配置字段定义
 */
export function generateConfigFields(metadata: SkillOpenClawMetadata): SkillConfigField[] {
  const fields: SkillConfigField[] = [];
  const requirements = getRequirements(metadata);

  // 从 requires 数组中提取 env 类型的检测项
  for (const req of requirements) {
    if (req.type !== "env") continue;
    
    const envVar = req.name;
    
    // 根据命名推断字段类型
    const isApiKey =
      envVar.toLowerCase().includes("api_key") ||
      envVar.toLowerCase().includes("apikey") ||
      envVar.toLowerCase().includes("secret") ||
      envVar.toLowerCase().includes("token");

    const isUrl = envVar.toLowerCase().includes("url") || envVar.toLowerCase().includes("endpoint");

    // 生成友好的标签名
    const label = envVar
      .replace(/_/g, " ")
      .replace(/API KEY/gi, "API Key")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    // 优先使用 RequirementItem 中的信息，其次回退到全局默认值
    const defaultHelp = DEFAULT_API_KEY_HELP[envVar];

    fields.push({
      key: envVar,
      label,
      description: req.description || defaultHelp?.description,
      type: isApiKey ? "password" : isUrl ? "url" : "text",
      required: true,
      placeholder: req.placeholder || (isApiKey ? "输入您的 API Key" : `输入 ${label}`),
      helpUrl: req.helpUrl || defaultHelp?.helpUrl,
    });
  }

  return fields;
}

/**
 * 获取技能的主要配置项名称
 * 
 * 返回 requires 数组中第一个 env 类型的名称
 */
export function getPrimaryConfigName(metadata: SkillOpenClawMetadata): string | undefined {
  const envVars = extractEnvVarsFromRequirements(metadata);
  return envVars[0];
}

// =============================================================================
// 技能目录扫描
// =============================================================================

/**
 * 扫描技能目录，返回所有技能的元数据
 */
export function scanSkillsDir(skillsDir: string): Map<string, ParsedSkillInfo> {
  const skills = new Map<string, ParsedSkillInfo>();

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
  } catch (error) {
    console.error("扫描技能目录失败:", error);
  }

  return skills;
}
