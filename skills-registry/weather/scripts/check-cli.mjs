import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('curl --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `curl v${version}`,
      data: { version },
    };
  } catch {
    // curl 是系统自带的，如果检测失败可能是环境问题
    return {
      passed: false,
      message: 'curl 不可用，请检查系统环境',
      tutorial: {
        title: '检查 curl',
        steps: [
          'curl 是系统自带工具',
          '如果不可用，请检查系统 PATH 环境变量',
          '或尝试重启终端',
        ],
        helpUrl: 'https://curl.se/',
      },
    };
  }
}
