import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('trello whoami', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    
    if (/./i.test(result)) {
      return {
        passed: true,
        message: '已登录',
      };
    }
    
    throw new Error('未登录');
  } catch (error) {
    // 检查 stderr
    if (error.stderr && /./i.test(error.stderr)) {
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
          'trello auth',
          '按提示完成认证',
        ],
        helpUrl: 'https://github.com/mheap/trello-cli',
      },
    };
  }
}
