import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('peekaboo --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `peekaboo v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 peekaboo',
      action: 'install-cli',
      tutorial: {
        title: '安装 peekaboo',
        steps: [
          'macOS: brew install peekaboo'
        ],
        helpUrl: 'https://github.com/steventroughtonsmith/peekaboo',
      },
    };
  }
}
