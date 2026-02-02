import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  
  
  // Python 包
  return {
    success: true,
    message: '使用 pip 安装 whisper',
    command: 'pip install openai-whisper',
    openTerminal: true,
  };
  
  
  
  
  
  return {
    success: true,
    message: '请从官网下载 whisper',
    openUrl: 'https://github.com/openai/whisper',
  };
}
