import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('eightctl --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `eightctl v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 eightctl',
      action: 'install-cli',
      tutorial: {
        title: '安装 eightctl',
        steps: [
          'macOS: brew install eightctl'
        ],
        helpUrl: '',
      },
    };
  }
}
