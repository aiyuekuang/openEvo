/**
 * 平台检测模板 (macOS only)
 * 
 * 用于只支持 macOS 的技能
 */

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
  
  const platformNames = {
    win32: 'Windows',
    linux: 'Linux',
    darwin: 'macOS',
  };
  
  return {
    passed: false,
    message: `此技能仅支持 macOS，当前系统: ${platformNames[platform] || platform}`,
    tutorial: {
      title: '平台限制',
      steps: ['此技能使用 macOS 专属 API，无法在其他系统上运行'],
      tips: ['请在 Mac 电脑上使用此技能'],
    },
  };
}
