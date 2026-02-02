import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  // Python 包 - 跨平台
  return {
    success: true,
    message: '使用 uv 安装 video-frames',
    command: 'uv tool install video-frames',
    openTerminal: true,
  };
  
  
  
  
  
  
  
  return {
    success: true,
    message: '请从官网下载 video-frames',
    openUrl: 'https://pypi.org/project/video-frames/',
  };
}
