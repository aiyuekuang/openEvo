/**
 * GitHub CLI 安装操作脚本
 * 
 * 返回安装命令
 */

export async function execute() {
  // 检测当前平台
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 GitHub CLI',
      command: 'brew install gh',
      openTerminal: true,
    };
  }
  
  if (platform === 'linux') {
    return {
      success: true,
      message: '请选择适合您发行版的安装方式',
      openUrl: 'https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
    };
  }
  
  if (platform === 'win32') {
    return {
      success: true,
      message: '使用 winget 安装 GitHub CLI',
      command: 'winget install GitHub.cli',
      openTerminal: true,
    };
  }
  
  return {
    success: false,
    message: '不支持的操作系统',
    openUrl: 'https://cli.github.com/manual/installation',
  };
}
