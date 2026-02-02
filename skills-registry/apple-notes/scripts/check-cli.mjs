import { execSync } from 'node:child_process';

export async function check() {
  try {
    const result = execSync('memo --version 2>&1 || memo notes --help 2>&1', { 
      encoding: 'utf-8',
      timeout: 5000,
    });
    
    // memo 可能没有 --version，尝试检测是否可用
    if (result.includes('memo') || result.includes('notes') || result.includes('Usage')) {
      return {
        passed: true,
        message: 'memo CLI 已安装',
        data: { installed: true },
      };
    }
    
    throw new Error('memo 未安装');
  } catch (error) {
    // 尝试直接运行 memo 看是否存在
    try {
      execSync('which memo', { encoding: 'utf-8' });
      return {
        passed: true,
        message: 'memo CLI 已安装',
        data: { installed: true },
      };
    } catch {
      return {
        passed: false,
        message: '未安装 memo CLI',
        action: 'install-cli',
        tutorial: {
          title: '安装 memo CLI',
          steps: [
            '1. 添加 tap: brew tap antoniorodr/memo',
            '2. 安装: brew install antoniorodr/memo/memo',
            '3. 首次运行会请求 Automation 权限',
          ],
          tips: [
            '如果安装失败，可尝试: pip install memo-cli',
          ],
          helpUrl: 'https://github.com/antoniorodr/memo',
        },
      };
    }
  }
}
