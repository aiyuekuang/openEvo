import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('nano-pdf --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `nano-pdf v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 nano-pdf',
      action: 'install-cli',
      tutorial: {
        title: '安装 nano-pdf',
        steps: [
          '推荐使用 uv 安装:',
          'uv tool install nano-pdf',
          '或使用 pip:',
          'pip install nano-pdf',
        ],
        helpUrl: 'https://pypi.org/project/nano-pdf/',
      },
    };
  }
}
