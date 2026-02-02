import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('goplaces --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `goplaces v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 goplaces',
      action: 'install-cli',
      tutorial: {
        title: '安装 goplaces',
        steps: [
          'go install github.com/example/goplaces@latest'
        ],
        helpUrl: '',
      },
    };
  }
}
