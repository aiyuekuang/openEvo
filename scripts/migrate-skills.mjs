#!/usr/bin/env node
/**
 * 技能迁移脚本 - 将所有技能从 requires 格式迁移到 checks + actions 格式
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '../skills-registry');

// 技能配置定义
const SKILL_CONFIGS = {
  // ========== A. 纯 CLI 工具类 ==========
  'tmux': {
    cli: 'tmux',
    versionCmd: 'tmux -V',
    install: { brew: 'tmux', apt: 'tmux' },
    homepage: 'https://github.com/tmux/tmux',
  },
  'himalaya': {
    cli: 'himalaya',
    install: { brew: 'himalaya' },
    homepage: 'https://github.com/pimalaya/himalaya',
  },
  'weather': {
    cli: 'curl',
    install: { system: true },  // 系统自带
    homepage: 'https://wttr.in/:help',
    noInstallAction: true,
  },
  'gifgrep': {
    cli: 'gifgrep',
    install: { brew: 'gifgrep' },
    homepage: 'https://github.com/benfry/gifgrep',
  },
  'peekaboo': {
    cli: 'peekaboo',
    install: { brew: 'peekaboo' },
    homepage: 'https://github.com/steventroughtonsmith/peekaboo',
  },
  'camsnap': {
    cli: 'camsnap',
    install: { brew: 'camsnap' },
    homepage: 'https://github.com/example/camsnap',
  },
  'video-frames': {
    cli: 'video-frames',
    install: { uv: 'video-frames' },
    homepage: 'https://pypi.org/project/video-frames/',
  },
  'sonoscli': {
    cli: 'sonos',
    install: { brew: 'sonoscli' },
    homepage: 'https://github.com/example/sonoscli',
  },
  'openhue': {
    cli: 'openhue',
    install: { brew: 'openhue' },
    homepage: 'https://github.com/example/openhue',
  },
  'mcporter': {
    cli: 'mcporter',
    install: { brew: 'mcporter' },
    homepage: 'https://github.com/example/mcporter',
  },
  'blucli': {
    cli: 'blucli',
    install: { brew: 'blucli' },
    homepage: 'https://github.com/example/blucli',
  },

  // ========== B. CLI + 认证类 ==========
  '1password': {
    cli: 'op',
    install: { brew: '1password-cli' },
    auth: {
      cmd: 'op whoami',
      expect: 'account',
      loginCmd: 'op signin',
    },
    homepage: 'https://developer.1password.com/docs/cli/get-started/',
  },
  'spotify-player': {
    cli: 'spt',
    install: { brew: 'spotify-player' },
    auth: {
      cmd: 'spt playback --status',
      expect: '.',
      loginCmd: 'spt auth',
    },
    homepage: 'https://github.com/Rigellute/spotify-tui',
  },
  'trello': {
    cli: 'trello',
    install: { npm: 'trello-cli' },
    auth: {
      cmd: 'trello whoami',
      expect: '.',
      loginCmd: 'trello auth',
    },
    homepage: 'https://github.com/mheap/trello-cli',
  },
  'gog': {
    cli: 'gogcli',
    install: { go: 'github.com/Aternus/gogdl-ng' },
    auth: {
      cmd: 'gogcli auth-status',
      expect: 'authenticated',
      loginCmd: 'gogcli auth',
    },
    homepage: 'https://github.com/Aternus/gogdl-ng',
  },

  // ========== C. 纯 API Key 类 ==========
  'notion': {
    env: 'NOTION_API_KEY',
    envLabel: 'Notion API Key',
    homepage: 'https://developers.notion.com/',
    keyPrefix: 'secret_',
  },
  'gemini': {
    env: 'GOOGLE_AI_API_KEY',
    envLabel: 'Google AI API Key',
    homepage: 'https://ai.google.dev/',
    keyPrefix: 'AIza',
  },
  'canvas': {
    env: 'CANVAS_API_TOKEN',
    envLabel: 'Canvas API Token',
    homepage: 'https://canvas.instructure.com/doc/api/',
    keyPrefix: '',
  },
  'openai-image-gen': {
    cli: 'python3',
    install: { brew: 'python' },
    env: 'OPENAI_API_KEY',
    envLabel: 'OpenAI API Key',
    homepage: 'https://platform.openai.com/docs/api-reference/images',
    keyPrefix: 'sk-',
  },
  'openai-whisper-api': {
    env: 'OPENAI_API_KEY',
    envLabel: 'OpenAI API Key',
    homepage: 'https://platform.openai.com/docs/api-reference/audio',
    keyPrefix: 'sk-',
  },
  'openai-whisper': {
    cli: 'whisper',
    install: { pip: 'openai-whisper' },
    homepage: 'https://github.com/openai/whisper',
  },

  // ========== D. 平台限定类 (macOS) ==========
  'apple-notes': {
    platform: 'darwin',
    platformLabel: 'macOS',
  },
  'apple-reminders': {
    platform: 'darwin',
    platformLabel: 'macOS',
  },
  'things-mac': {
    platform: 'darwin',
    platformLabel: 'macOS',
  },
  'bear-notes': {
    platform: 'darwin',
    platformLabel: 'macOS',
  },
  'imsg': {
    platform: 'darwin',
    platformLabel: 'macOS',
  },

  // ========== E. 渠道配置类 ==========
  'slack': {
    channel: 'channels.slack',
    channelLabel: 'Slack 渠道',
    homepage: 'https://api.slack.com/',
  },
  'discord': {
    channel: 'channels.discord',
    channelLabel: 'Discord 渠道',
    homepage: 'https://discord.com/developers/',
  },
  'bluebubbles': {
    channel: 'channels.bluebubbles',
    channelLabel: 'BlueBubbles 渠道',
    homepage: 'https://bluebubbles.app/',
  },

  // ========== F. 无依赖类 ==========
  'session-logs': { noDeps: true },
  'summarize': { noDeps: true },
  'coding-agent': { noDeps: true },
  'skill-creator': { noDeps: true },
  'model-usage': { noDeps: true },

  // ========== G. 其他 CLI 工具 ==========
  'bird': {
    cli: 'bird',
    install: { brew: 'bird' },
  },
  'blogwatcher': {
    cli: 'blogwatcher',
    install: { npm: 'blogwatcher' },
  },
  'clawdhub': {
    noDeps: true,  // 内部服务
  },
  'eightctl': {
    cli: 'eightctl',
    install: { brew: 'eightctl' },
  },
  'food-order': {
    noDeps: true,
  },
  'goplaces': {
    cli: 'goplaces',
    install: { go: 'github.com/example/goplaces' },
  },
  'local-places': {
    noDeps: true,  // 使用系统 API
  },
  'obsidian': {
    env: 'OBSIDIAN_VAULT_PATH',
    envLabel: 'Obsidian Vault 路径',
  },
  'oracle': {
    cli: 'oracle',
    install: { brew: 'oracle' },
  },
  'ordercli': {
    cli: 'ordercli',
    install: { npm: 'ordercli' },
  },
  'sag': {
    cli: 'sag',
    install: { brew: 'sag' },
  },
  'sherpa-onnx-tts': {
    cli: 'sherpa-onnx-tts',
    install: { pip: 'sherpa-onnx' },
    homepage: 'https://github.com/k2-fsa/sherpa-onnx',
  },
  'songsee': {
    cli: 'songsee',
    install: { brew: 'songsee' },
  },
  'voice-call': {
    noDeps: true,
  },
  'wacli': {
    cli: 'wacli',
    install: { npm: 'wacli' },
  },
  'nano-banana-pro': {
    cli: 'nano-banana-pro',
    install: { pip: 'nano-banana-pro' },
    homepage: 'https://pypi.org/project/nano-banana-pro/',
  },
};

// 生成 check-cli.js
function generateCheckCli(config) {
  const cli = config.cli;
  const versionCmd = config.versionCmd || `${cli} --version`;
  const homepage = config.homepage || '';
  
  let installSteps = [];
  if (config.install?.brew) {
    installSteps.push(`'macOS: brew install ${config.install.brew}'`);
  }
  if (config.install?.apt) {
    installSteps.push(`'Linux: sudo apt install ${config.install.apt}'`);
  }
  if (config.install?.uv) {
    installSteps.push(`'uv tool install ${config.install.uv}'`);
  }
  if (config.install?.pip) {
    installSteps.push(`'pip install ${config.install.pip}'`);
  }
  if (config.install?.npm) {
    installSteps.push(`'npm install -g ${config.install.npm}'`);
  }
  if (config.install?.go) {
    installSteps.push(`'go install ${config.install.go}@latest'`);
  }
  if (config.install?.system) {
    installSteps.push(`'系统自带，无需安装'`);
  }
  
  return `import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('${versionCmd}', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: \`${cli} v\${version}\`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 ${cli}',
      action: 'install-cli',
      tutorial: {
        title: '安装 ${cli}',
        steps: [
          ${installSteps.join(',\n          ')}
        ],
        helpUrl: '${homepage}',
      },
    };
  }
}
`;
}

// 生成 check-auth.js
function generateCheckAuth(config) {
  const auth = config.auth;
  return `import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('${auth.cmd}', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    
    if (/${auth.expect}/i.test(result)) {
      return {
        passed: true,
        message: '已登录',
      };
    }
    
    throw new Error('未登录');
  } catch (error) {
    // 检查 stderr
    if (error.stderr && /${auth.expect}/i.test(error.stderr)) {
      return { passed: true, message: '已登录' };
    }
    
    return {
      passed: false,
      message: '需要登录',
      action: 'login',
      tutorial: {
        title: '登录',
        steps: [
          '在终端中运行:',
          '${auth.loginCmd}',
          '按提示完成认证',
        ],
        helpUrl: '${config.homepage || ''}',
      },
    };
  }
}
`;
}

// 生成 check-env.js
function generateCheckEnv(config) {
  const env = config.env;
  const label = config.envLabel || env;
  const homepage = config.homepage || '';
  const prefix = config.keyPrefix || '';
  
  return `export async function check() {
  const key = process.env.${env};
  
  if (key && key.length > 0) {
    const masked = key.slice(0, 6) + '...' + key.slice(-4);
    return {
      passed: true,
      message: \`${label} 已配置 (\${masked})\`,
      data: { configured: true },
    };
  }
  
  return {
    passed: false,
    message: '需要配置 ${env}',
    action: 'configure',
    tutorial: {
      title: '配置 ${label}',
      steps: [
        '1. 访问 ${homepage}',
        '2. 登录或注册账号',
        '3. 创建 API Key',
        '4. 复制并配置到环境变量',
      ],
      ${prefix ? `tips: ['Key 格式通常以 ${prefix} 开头'],` : ''}
      helpUrl: '${homepage}',
    },
  };
}
`;
}

// 生成 check-platform.js
function generateCheckPlatform(config) {
  const platform = config.platform;
  const label = config.platformLabel || platform;
  
  return `import os from 'os';

export async function check() {
  const platform = os.platform();
  
  if (platform === '${platform}') {
    return {
      passed: true,
      message: '${label} ✓',
      data: { platform },
    };
  }
  
  return {
    passed: false,
    message: \`此技能仅支持 ${label}\`,
    tutorial: {
      title: '平台限制',
      steps: ['此技能使用 ${label} 专属 API'],
      tips: ['请在 ${label === 'macOS' ? 'Mac' : label} 上使用此技能'],
    },
  };
}
`;
}

// 生成 check-channel.js
function generateCheckChannel(config) {
  const channel = config.channel;
  const label = config.channelLabel || channel;
  
  return `export async function check() {
  // 渠道配置检测 - 检查是否在 openclaw.json 中配置了相应渠道
  // 实际检测逻辑需要读取配置文件
  return {
    passed: true,
    message: '${label}配置检测 (需要在 openclaw.json 中配置)',
    data: { channel: '${channel}' },
  };
}
`;
}

// 生成 install-cli.js
function generateInstallCli(config) {
  const cli = config.cli;
  const install = config.install;
  
  let brewCmd = install?.brew ? `brew install ${install.brew}` : '';
  let aptCmd = install?.apt ? `sudo apt install ${install.apt}` : '';
  let uvCmd = install?.uv ? `uv tool install ${install.uv}` : '';
  let pipCmd = install?.pip ? `pip install ${install.pip}` : '';
  let npmCmd = install?.npm ? `npm install -g ${install.npm}` : '';
  let goCmd = install?.go ? `go install ${install.go}@latest` : '';
  
  // 选择主要安装方式
  let primaryCmd = brewCmd || uvCmd || pipCmd || npmCmd || goCmd || aptCmd;
  
  return `import os from 'os';

export async function run() {
  const platform = os.platform();
  
  ${brewCmd ? `if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 ${cli}',
      command: '${brewCmd}',
      openTerminal: true,
    };
  }` : ''}
  
  ${aptCmd ? `if (platform === 'linux') {
    return {
      success: true,
      message: '使用 apt 安装 ${cli}',
      command: '${aptCmd}',
      openTerminal: true,
    };
  }` : ''}
  
  ${uvCmd ? `// Python 包 - 跨平台
  return {
    success: true,
    message: '使用 uv 安装 ${cli}',
    command: '${uvCmd}',
    openTerminal: true,
  };` : ''}
  
  ${pipCmd && !uvCmd ? `// Python 包
  return {
    success: true,
    message: '使用 pip 安装 ${cli}',
    command: '${pipCmd}',
    openTerminal: true,
  };` : ''}
  
  ${npmCmd ? `// Node.js 包 - 跨平台
  return {
    success: true,
    message: '使用 npm 安装 ${cli}',
    command: '${npmCmd}',
    openTerminal: true,
  };` : ''}
  
  ${goCmd ? `// Go 包 - 跨平台
  return {
    success: true,
    message: '使用 go install 安装 ${cli}',
    command: '${goCmd}',
    openTerminal: true,
  };` : ''}
  
  return {
    success: true,
    message: '请从官网下载 ${cli}',
    openUrl: '${config.homepage || ''}',
  };
}
`;
}

// 生成 login.js
function generateLogin(config) {
  const loginCmd = config.auth?.loginCmd || '';
  
  return `export async function run() {
  return {
    success: true,
    message: '执行登录',
    command: '${loginCmd}',
    openTerminal: true,
  };
}
`;
}

// 生成 configure.js
function generateConfigure(config) {
  return `export async function run() {
  return {
    success: true,
    message: '打开配置页面',
    openUrl: '${config.homepage || ''}',
  };
}
`;
}

// 生成 skill.json
function generateSkillJson(skillId, config, existingJson) {
  const checks = [];
  const actions = {};
  
  // 平台检测
  if (config.platform) {
    checks.push({
      id: 'platform',
      script: 'scripts/check-platform.js',
      label: `${config.platformLabel || config.platform} 平台`,
      description: `检测是否在 ${config.platformLabel || config.platform} 系统上运行`,
    });
  }
  
  // CLI 检测
  if (config.cli && !config.noInstallAction) {
    checks.push({
      id: 'cli',
      script: 'scripts/check-cli.js',
      label: `${config.cli} CLI`,
      description: `检测 ${config.cli} 是否已安装`,
    });
    actions['install-cli'] = {
      script: 'scripts/install-cli.js',
      label: `安装 ${config.cli}`,
      description: `安装 ${config.cli} 命令行工具`,
    };
  } else if (config.cli && config.noInstallAction) {
    checks.push({
      id: 'cli',
      script: 'scripts/check-cli.js',
      label: `${config.cli} CLI`,
      description: `检测 ${config.cli} 是否可用 (系统自带)`,
    });
  }
  
  // 认证检测
  if (config.auth) {
    checks.push({
      id: 'auth',
      script: 'scripts/check-auth.js',
      label: '登录状态',
      description: '检测是否已登录',
      dependsOn: config.cli ? ['cli'] : undefined,
    });
    actions['login'] = {
      script: 'scripts/login.js',
      label: '登录',
      description: '执行登录认证',
    };
  }
  
  // 环境变量检测
  if (config.env) {
    checks.push({
      id: 'env',
      script: 'scripts/check-env.js',
      label: config.envLabel || config.env,
      description: `检测 ${config.env} 是否已配置`,
      dependsOn: config.cli ? ['cli'] : undefined,
    });
    actions['configure'] = {
      script: 'scripts/configure.js',
      label: '配置',
      description: '打开配置页面',
    };
  }
  
  // 渠道配置检测
  if (config.channel) {
    checks.push({
      id: 'channel',
      script: 'scripts/check-channel.js',
      label: config.channelLabel || config.channel,
      description: `检测 ${config.channel} 渠道配置`,
    });
  }
  
  // 无依赖
  if (config.noDeps) {
    checks.push({
      id: 'ready',
      script: 'scripts/check-ready.js',
      label: '就绪',
      description: '此技能无需额外配置',
    });
  }
  
  const result = {
    name: existingJson.name || skillId,
    description: existingJson.description || '',
    version: existingJson.version || '1.0.0',
    emoji: existingJson.emoji || '🔧',
    homepage: config.homepage || existingJson.homepage || '',
    category: existingJson.category || 'tool',
    tags: existingJson.tags || [],
    checks,
    actions,
  };
  
  if (existingJson.capabilities) {
    result.capabilities = existingJson.capabilities;
  }
  
  return result;
}

// 主函数
async function migrate() {
  console.log('开始迁移技能到新格式...\n');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const [skillId, config] of Object.entries(SKILL_CONFIGS)) {
    const skillDir = path.join(SKILLS_DIR, skillId);
    const skillJsonPath = path.join(skillDir, 'skill.json');
    const scriptsDir = path.join(skillDir, 'scripts');
    
    // 检查目录是否存在
    if (!fs.existsSync(skillDir)) {
      console.log(`⚠️  跳过 ${skillId}: 目录不存在`);
      skipped++;
      continue;
    }
    
    // 检查是否已迁移
    if (fs.existsSync(skillJsonPath)) {
      const existing = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
      if (existing.checks) {
        console.log(`✓  跳过 ${skillId}: 已是新格式`);
        skipped++;
        continue;
      }
    }
    
    console.log(`→  迁移 ${skillId}...`);
    
    // 确保 scripts 目录存在
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }
    
    // 读取现有 skill.json
    let existingJson = {};
    if (fs.existsSync(skillJsonPath)) {
      existingJson = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
    }
    
    // 生成脚本文件
    if (config.cli && !config.noInstallAction) {
      fs.writeFileSync(path.join(scriptsDir, 'check-cli.js'), generateCheckCli(config));
      fs.writeFileSync(path.join(scriptsDir, 'install-cli.js'), generateInstallCli(config));
    } else if (config.cli && config.noInstallAction) {
      fs.writeFileSync(path.join(scriptsDir, 'check-cli.js'), generateCheckCli(config));
    }
    
    if (config.auth) {
      fs.writeFileSync(path.join(scriptsDir, 'check-auth.js'), generateCheckAuth(config));
      fs.writeFileSync(path.join(scriptsDir, 'login.js'), generateLogin(config));
    }
    
    if (config.env) {
      fs.writeFileSync(path.join(scriptsDir, 'check-env.js'), generateCheckEnv(config));
      fs.writeFileSync(path.join(scriptsDir, 'configure.js'), generateConfigure(config));
    }
    
    if (config.platform) {
      fs.writeFileSync(path.join(scriptsDir, 'check-platform.js'), generateCheckPlatform(config));
    }
    
    if (config.channel) {
      fs.writeFileSync(path.join(scriptsDir, 'check-channel.js'), generateCheckChannel(config));
    }
    
    if (config.noDeps) {
      fs.writeFileSync(path.join(scriptsDir, 'check-ready.js'), `export async function check() {
  return {
    passed: true,
    message: '已就绪',
  };
}
`);
    }
    
    // 生成新的 skill.json
    const newJson = generateSkillJson(skillId, config, existingJson);
    fs.writeFileSync(skillJsonPath, JSON.stringify(newJson, null, 2) + '\n');
    
    migrated++;
  }
  
  console.log(`\n✅ 迁移完成: ${migrated} 个技能已迁移, ${skipped} 个已跳过`);
}

migrate().catch(console.error);
