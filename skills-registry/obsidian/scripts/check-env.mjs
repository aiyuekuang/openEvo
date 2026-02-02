import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SKILL_ID = '@openclaw/obsidian';
const ENV_KEY = 'OBSIDIAN_VAULT_PATH';

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
    return {
      passed: true,
      message: `Obsidian Vault 路径已配置 (${key})`,
      data: { configured: true },
    };
  }
  
  return {
    passed: false,
    message: '需要配置 OBSIDIAN_VAULT_PATH',
  };
}
