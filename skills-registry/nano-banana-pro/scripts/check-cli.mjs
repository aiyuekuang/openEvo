import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('nano-banana-pro --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `nano-banana-pro v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 nano-banana-pro',
      action: 'install-cli',
      tutorial: {
        title: '安装 nano-banana-pro',
        steps: [
          'pip install nano-banana-pro'
        ],
        helpUrl: 'https://pypi.org/project/nano-banana-pro/',
      },
    };
  }
}
