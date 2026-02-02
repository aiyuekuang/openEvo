import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  
  
  
  
  // Node.js 包 - 跨平台
  return {
    success: true,
    message: '使用 npm 安装 ordercli',
    command: 'npm install -g ordercli',
    openTerminal: true,
  };
  
  
  
  return {
    success: true,
    message: '请从官网下载 ordercli',
    openUrl: '',
  };
}
