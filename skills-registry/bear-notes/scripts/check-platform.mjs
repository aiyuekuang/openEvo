import os from 'os';

export async function check() {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      passed: true,
      message: 'macOS ✓',
      data: { platform },
    };
  }
  
  return {
    passed: false,
    message: `此技能仅支持 macOS`,
    tutorial: {
      title: '平台限制',
      steps: ['此技能使用 macOS 专属 API'],
      tips: ['请在 Mac 上使用此技能'],
    },
  };
}
