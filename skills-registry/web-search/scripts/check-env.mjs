import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SKILL_ID = '@openclaw/web-search';
const ENV_KEY = 'BRAVE_SEARCH_API_KEY';

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
    const masked = key.slice(0, 6) + '...' + key.slice(-4);
    return {
      passed: true,
      message: `Brave Search API Key 已配置 (${masked})`,
      data: { configured: true },
    };
  }
  
  return {
    passed: false,
    message: '需要配置 BRAVE_SEARCH_API_KEY',
  };
}
