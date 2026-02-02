/**
 * 通用 CLI 工具检测模板
 * 
 * 使用方法: 复制此文件并替换以下占位符
 * - {{CLI_NAME}} - CLI 命令名 (如: gh, tmux, nano-pdf)
 * - {{INSTALL_CMD}} - 安装命令 (如: brew install gh)
 * - {{HOMEPAGE}} - 官方网站
 */

import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('{{CLI_NAME}} --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    // 提取版本号
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `{{CLI_NAME}} v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 {{CLI_NAME}}',
      action: 'install-cli',
      tutorial: {
        title: '安装 {{CLI_NAME}}',
        steps: ['运行以下命令安装:', '{{INSTALL_CMD}}'],
        helpUrl: '{{HOMEPAGE}}',
      },
    };
  }
}
