import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('openhue --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `openhue v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 openhue',
      action: 'install-cli',
      tutorial: {
        title: '安装 openhue',
        steps: [
          'macOS: brew install openhue'
        ],
        helpUrl: 'https://github.com/example/openhue',
      },
    };
  }
}
