import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('sag --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `sag v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 sag',
      action: 'install-cli',
      tutorial: {
        title: '安装 sag',
        steps: [
          'macOS: brew install sag'
        ],
        helpUrl: '',
      },
    };
  }
}
