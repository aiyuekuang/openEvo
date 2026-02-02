import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('trello --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `trello v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 trello',
      action: 'install-cli',
      tutorial: {
        title: '安装 trello',
        steps: [
          'npm install -g trello-cli'
        ],
        helpUrl: 'https://github.com/mheap/trello-cli',
      },
    };
  }
}
