import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('video-frames --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `video-frames v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 video-frames',
      action: 'install-cli',
      tutorial: {
        title: '安装 video-frames',
        steps: [
          'uv tool install video-frames'
        ],
        helpUrl: 'https://pypi.org/project/video-frames/',
      },
    };
  }
}
