import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('blogwatcher --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `blogwatcher v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 blogwatcher',
      action: 'install-cli',
      tutorial: {
        title: '安装 blogwatcher',
        steps: [
          'npm install -g blogwatcher'
        ],
        helpUrl: '',
      },
    };
  }
}
