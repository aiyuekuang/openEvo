import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('wacli --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `wacli v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 wacli',
      action: 'install-cli',
      tutorial: {
        title: '安装 wacli',
        steps: [
          'npm install -g wacli'
        ],
        helpUrl: '',
      },
    };
  }
}
