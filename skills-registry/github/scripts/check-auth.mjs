/**
 * GitHub 登录检测脚本
 * 
 * 检测是否已登录 GitHub 账号
 */

import { execSync } from 'node:child_process';

// 跨平台 PATH 配置
const EXTRA_PATH = process.platform === 'darwin' 
  ? '/opt/homebrew/bin:/usr/local/bin' 
  : '/usr/local/bin';

export async function check() {
  try {
    // 执行 gh auth status
    const result = execSync('gh auth status', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${EXTRA_PATH}:${process.env.PATH}`,
      },
    });
    
    // 检查是否包含 "Logged in"
    if (/Logged in/i.test(result)) {
      // 尝试提取用户名
      const userMatch = result.match(/Logged in to .+ as (.+?) \(/);
      const username = userMatch ? userMatch[1] : '';
      
      return {
        passed: true,
        message: username ? `已登录为 ${username}` : '已登录 GitHub',
        data: { username },
      };
    }
    
    // 未登录
    return getNotLoggedInResult();
  } catch (error) {
    // 命令执行失败，通常是未登录
    return getNotLoggedInResult();
  }
}

/**
 * 返回未登录结果
 */
function getNotLoggedInResult() {
  return {
    passed: false,
    message: '需要登录 GitHub',
    action: 'login',
    tutorial: {
      title: '登录 GitHub',
      steps: [
        '打开终端',
        '运行命令: gh auth login',
        '选择 "GitHub.com"',
        '选择认证方式 (推荐: 使用浏览器登录)',
        '按提示在浏览器中完成授权',
        '返回终端确认登录成功',
      ],
      tips: [
        '推荐使用浏览器登录，更安全便捷',
        '如果遇到网络问题，可选择 "Paste an authentication token"',
        'Token 需要在 GitHub Settings > Developer settings > Personal access tokens 中创建',
        '创建 Token 时建议选择: repo, workflow, read:org 权限',
      ],
      helpUrl: 'https://cli.github.com/manual/gh_auth_login',
    },
  };
}
