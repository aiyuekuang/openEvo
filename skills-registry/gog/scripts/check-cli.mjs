import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('gogcli --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `gogcli v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 gogcli',
      action: 'install-cli',
      tutorial: {
        title: '安装 gogcli',
        steps: [
          'go install github.com/Aternus/gogdl-ng@latest'
        ],
        helpUrl: 'https://github.com/Aternus/gogdl-ng',
      },
    };
  }
}
