import { execSync } from 'child_process';

export async function check() {
  try {
    const result = execSync('sherpa-onnx-tts --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    
    const version = result.match(/[\d.]+/)?.[0] || 'unknown';
    
    return {
      passed: true,
      message: `sherpa-onnx-tts v${version}`,
      data: { version },
    };
  } catch {
    return {
      passed: false,
      message: '未安装 sherpa-onnx-tts',
      action: 'install-cli',
      tutorial: {
        title: '安装 sherpa-onnx-tts',
        steps: [
          'pip install sherpa-onnx'
        ],
        helpUrl: 'https://github.com/k2-fsa/sherpa-onnx',
      },
    };
  }
}
