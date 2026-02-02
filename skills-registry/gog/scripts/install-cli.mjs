import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  
  
  
  
  
  
  // Go 包 - 跨平台
  return {
    success: true,
    message: '使用 go install 安装 gogcli',
    command: 'go install github.com/Aternus/gogdl-ng@latest',
    openTerminal: true,
  };
  
  return {
    success: true,
    message: '请从官网下载 gogcli',
    openUrl: 'https://github.com/Aternus/gogdl-ng',
  };
}
