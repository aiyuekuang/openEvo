/**
 * GitHub CLI 检测脚本
 * 
 * 检测 gh 命令行工具是否已安装
 */

import { execSync } from 'node:child_process';

// 跨平台 PATH 配置
const EXTRA_PATH = process.platform === 'darwin' 
  ? '/opt/homebrew/bin:/usr/local/bin' 
  : '/usr/local/bin';

export async function check() {
  try {
    // 检测 gh 命令是否存在
    const version = execSync('gh --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${EXTRA_PATH}:${process.env.PATH}`,
      },
    });
    
    // 提取版本号
    const versionMatch = version.match(/gh version ([\d.]+)/);
    const versionNumber = versionMatch ? versionMatch[1] : 'unknown';
    
    return {
      passed: true,
      message: `GitHub CLI v${versionNumber}`,
      data: { version: versionNumber },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 GitHub CLI',
      action: 'install-cli',
      tutorial: {
        title: '安装 GitHub CLI',
        steps: [
          '打开终端',
          '运行命令: brew install gh',
          '等待安装完成',
          '验证安装: gh --version',
        ],
        tips: [
          '如果没有 Homebrew，先安装: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          'Windows 用户可使用 winget install GitHub.cli',
          'Linux 用户可参考官方文档',
        ],
        helpUrl: 'https://cli.github.com/manual/installation',
      },
    };
  }
}
