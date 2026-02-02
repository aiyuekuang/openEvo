import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('spt --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `spt v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 spt',
      action: 'install-cli',
      tutorial: {
        title: '安装 spt',
        steps: [
          'macOS: brew install spotify-player'
        ],
        helpUrl: 'https://github.com/Rigellute/spotify-tui',
      },
    };
  }
}
