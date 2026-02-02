import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('mcporter --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `mcporter v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 mcporter',
      action: 'install-cli',
      tutorial: {
        title: '安装 mcporter',
        steps: [
          'macOS: brew install mcporter'
        ],
        helpUrl: 'https://github.com/example/mcporter',
      },
    };
  }
}
