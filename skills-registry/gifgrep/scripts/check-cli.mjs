import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('gifgrep --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `gifgrep v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 gifgrep',
      action: 'install-cli',
      tutorial: {
        title: '安装 gifgrep',
        steps: [
          'macOS: brew install gifgrep'
        ],
        helpUrl: 'https://github.com/benfry/gifgrep',
      },
    };
  }
}
