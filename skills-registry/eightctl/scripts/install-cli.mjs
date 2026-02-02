import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 eightctl',
      command: 'brew install eightctl',
      openTerminal: true,
    };
  }
  
  
  
  
  
  
  
  
  
  
  
  return {
    success: true,
    message: '请从官网下载 eightctl',
    openUrl: '',
  };
}
