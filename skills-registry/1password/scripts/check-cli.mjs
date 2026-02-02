import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('op --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `op v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 op',
      action: 'install-cli',
      tutorial: {
        title: '安装 op',
        steps: [
          'macOS: brew install 1password-cli'
        ],
        helpUrl: 'https://developer.1password.com/docs/cli/get-started/',
      },
    };
  }
}
