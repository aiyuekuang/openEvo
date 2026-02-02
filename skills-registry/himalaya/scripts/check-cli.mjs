import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('himalaya --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `himalaya v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 himalaya',
      action: 'install-cli',
      tutorial: {
        title: '安装 himalaya',
        steps: [
          'macOS: brew install himalaya'
        ],
        helpUrl: 'https://github.com/pimalaya/himalaya',
      },
    };
  }
}
