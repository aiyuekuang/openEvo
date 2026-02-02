import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 peekaboo',
      command: 'brew install peekaboo',
      openTerminal: true,
    };
  }
  
  
  
  
  
  
  
  
  
  
  
  return {
    success: true,
    message: '请从官网下载 peekaboo',
    openUrl: 'https://github.com/steventroughtonsmith/peekaboo',
  };
}
