import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('oracle --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `oracle v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 oracle',
      action: 'install-cli',
      tutorial: {
        title: '安装 oracle',
        steps: [
          'macOS: brew install oracle'
        ],
        helpUrl: '',
      },
    };
  }
}
