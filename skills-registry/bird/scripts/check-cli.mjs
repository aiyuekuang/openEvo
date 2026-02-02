import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('bird --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `bird v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 bird',
      action: 'install-cli',
      tutorial: {
        title: '安装 bird',
        steps: [
          'macOS: brew install bird'
        ],
        helpUrl: '',
      },
    };
  }
}
