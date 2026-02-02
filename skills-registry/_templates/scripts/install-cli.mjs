/**
 * 通用 CLI 安装 action 模板
 * 
 * 使用方法: 复制此文件并替换以下占位符
 * - {{CLI_NAME}} - CLI 名称
 * - {{BREW_FORMULA}} - Homebrew formula (如: gh)
 * - {{APT_PACKAGE}} - apt 包名 (如: gh，可选)
 * - {{HOMEPAGE}} - 官网链接
 */

import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  // macOS - 使用 Homebrew
  if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 {{CLI_NAME}}',
      command: 'brew install {{BREW_FORMULA}}',
      openTerminal: true,
    };
  }
  
  // Linux - 使用 apt (Debian/Ubuntu)
  if (platform === 'linux') {
    return {
      success: true,
      message: '使用 apt 安装 {{CLI_NAME}}',
      command: 'sudo apt install {{APT_PACKAGE}}',
      openTerminal: true,
    };
  }
  
  // Windows - 打开下载页面
  return {
    success: true,
    message: '请从官网下载 {{CLI_NAME}}',
    openUrl: '{{HOMEPAGE}}',
  };
}
