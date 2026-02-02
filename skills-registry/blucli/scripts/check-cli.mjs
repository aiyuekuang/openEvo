import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('blucli --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `blucli v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 blucli',
      action: 'install-cli',
      tutorial: {
        title: '安装 blucli',
        steps: [
          'macOS: brew install blucli'
        ],
        helpUrl: 'https://github.com/example/blucli',
      },
    };
  }
}
