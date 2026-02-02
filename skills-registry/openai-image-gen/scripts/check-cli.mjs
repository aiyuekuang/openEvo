import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('python3 --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `python3 v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 python3',
      action: 'install-cli',
      tutorial: {
        title: '安装 python3',
        steps: [
          'macOS: brew install python'
        ],
        helpUrl: 'https://platform.openai.com/docs/api-reference/images',
      },
    };
  }
}
