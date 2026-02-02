/**
 * 通用认证检测模板
 * 
 * 使用方法: 复制此文件并替换以下占位符
 * - {{AUTH_CMD}} - 认证状态检测命令 (如: gh auth status)
 * - {{EXPECT_PATTERN}} - 成功时的输出匹配 (如: Logged in)
 * - {{SERVICE_NAME}} - 服务名称 (如: GitHub)
 * - {{LOGIN_CMD}} - 登录命令 (如: gh auth login)
 * - {{HELP_URL}} - 帮助文档链接
 */

import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('{{AUTH_CMD}}', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    
    if (/{{EXPECT_PATTERN}}/i.test(result)) {
      return {
        passed: true,
        message: '已登录 {{SERVICE_NAME}}',
      };
    }
    
    throw new Error('未登录');
  } catch (error) {
    // 检查 stderr 是否包含成功信息
    if (error.stderr && /{{EXPECT_PATTERN}}/i.test(error.stderr)) {
      return {
        passed: true,
        message: '已登录 {{SERVICE_NAME}}',
      };
    }
    
    return {
      passed: false,
      message: '需要登录 {{SERVICE_NAME}}',
      action: 'login',
      tutorial: {
        title: '登录 {{SERVICE_NAME}}',
        steps: [
          '在终端中运行以下命令:',
          '{{LOGIN_CMD}}',
          '按照提示完成认证流程',
        ],
        helpUrl: '{{HELP_URL}}',
      },
    };
  }
}
