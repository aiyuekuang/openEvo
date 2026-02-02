import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('tmux -V', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `tmux ${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 tmux',
      action: 'install-cli',
      tutorial: {
        title: '安装 tmux',
        steps: [
          'macOS: brew install tmux',
          'Ubuntu/Debian: sudo apt install tmux',
        ],
        helpUrl: 'https://github.com/tmux/tmux',
      },
    };
  }
}
