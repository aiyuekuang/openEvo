import { execSync } from 'node:child_process';

export async function execute() {
  try {
    // 先添加 tap
    console.log('添加 Homebrew tap...');
    execSync('brew tap antoniorodr/memo', { 
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    
    // 安装 memo
    console.log('安装 memo...');
    execSync('brew install antoniorodr/memo/memo', { 
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    
    return {
      success: true,
      message: 'memo CLI 安装成功！首次运行时会请求 Automation 权限。',
    };
  } catch (error) {
    return {
      success: false,
      message: `安装失败: ${error.message}`,
    };
  }
}
