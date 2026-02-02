import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('ordercli --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `ordercli v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 ordercli',
      action: 'install-cli',
      tutorial: {
        title: '安装 ordercli',
        steps: [
          'npm install -g ordercli'
        ],
        helpUrl: '',
      },
    };
  }
}
