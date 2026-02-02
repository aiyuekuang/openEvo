import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  
  
  
  
  // Node.js 包 - 跨平台
  return {
    success: true,
    message: '使用 npm 安装 trello',
    command: 'npm install -g trello-cli',
    openTerminal: true,
  };
  
  
  
  return {
    success: true,
    message: '请从官网下载 trello',
    openUrl: 'https://github.com/mheap/trello-cli',
  };
}
