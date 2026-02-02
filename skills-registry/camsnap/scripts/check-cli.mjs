import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('camsnap --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `camsnap v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 camsnap',
      action: 'install-cli',
      tutorial: {
        title: '安装 camsnap',
        steps: [
          'macOS: brew install camsnap'
        ],
        helpUrl: 'https://github.com/example/camsnap',
      },
    };
  }
}
