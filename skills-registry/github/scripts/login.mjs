/**
 * GitHub 登录操作脚本
 * 
 * 返回登录命令让软件在终端中执行
 */

export async function execute() {
  return {
    success: true,
    message: '请在终端中完成 GitHub 登录',
    command: 'gh auth login',
    openTerminal: true,
  };
}
