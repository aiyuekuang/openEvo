import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('sonos --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `sonos v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 sonos',
      action: 'install-cli',
      tutorial: {
        title: '安装 sonos',
        steps: [
          'macOS: brew install sonoscli'
        ],
        helpUrl: 'https://github.com/example/sonoscli',
      },
    };
  }
}
