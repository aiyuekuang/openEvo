import os from 'os';

export async function execute() {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      success: true,
      message: '使用 Homebrew 安装 tmux',
      command: 'brew install tmux',
      openTerminal: true,
    };
  }
  
  if (platform === 'linux') {
    return {
      success: true,
      message: '使用 apt 安装 tmux',
      command: 'sudo apt install tmux',
      openTerminal: true,
    };
  }
  
  return {
    success: true,
    message: '请从官网下载 tmux',
    openUrl: 'https://github.com/tmux/tmux/releases',
  };
}
