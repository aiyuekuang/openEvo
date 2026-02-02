/**
 * 通用环境变量/API Key 检测模板
 * 
 * 使用方法: 复制此文件并替换以下占位符
 * - {{SKILL_ID}} - 技能 ID (如: @openclaw/my-skill)
 * - {{ENV_NAME}} - 环境变量名 (如: OPENAI_API_KEY)
 * - {{SERVICE_NAME}} - 服务名称 (如: OpenAI)
 * 
 * 同时需要在 skill.json 的 checks 中添加 input 和 help 字段:
 * {
 *   "id": "env",
 *   "script": "scripts/check-env.js",
 *   "label": "{{SERVICE_NAME}} API Key",
 *   "input": {
 *     "key": "{{ENV_NAME}}",
 *     "type": "password",
 *     "placeholder": "sk-..."
 *   },
 *   "help": {
 *     "description": "如何获取 API Key",
 *     "url": "https://..."
 *   }
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SKILL_ID = '{{SKILL_ID}}';
const ENV_KEY = '{{ENV_NAME}}';

/**
 * 从 openclaw.json 读取技能配置
 */
function getConfigValue(skillId, key) {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config?.skills?.entries?.[skillId]?.env?.[key];
    }
  } catch {
    // 忽略读取错误
  }
  return undefined;
}

export async function check() {
  // 优先级: 环境变量 > openclaw.json 配置
  const key = process.env[ENV_KEY] || getConfigValue(SKILL_ID, ENV_KEY);
  
  if (key && key.length > 0) {
    // 隐藏大部分 key，只显示前几位
    const masked = key.slice(0, 6) + '...' + key.slice(-4);
    return {
      passed: true,
      message: `{{SERVICE_NAME}} API Key 已配置 (${masked})`,
      data: { configured: true },
    };
  }
  
  return {
    passed: false,
    message: '需要配置 {{ENV_NAME}}',
  };
}
