import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  
  
  
  
  
  
  // Python 包
  return {
    success: true,
    message: '使用 pip 安装 sherpa-onnx-tts',
    command: 'pip install sherpa-onnx',
    openTerminal: true,
  };
  
  
  
  
  
  return {
    success: true,
    message: '请从官网下载 sherpa-onnx-tts',
    openUrl: 'https://github.com/k2-fsa/sherpa-onnx',
  };
}
