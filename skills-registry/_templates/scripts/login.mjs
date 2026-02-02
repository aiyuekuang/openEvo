/**
 * 通用登录 action 模板
 * 
 * 使用方法: 复制此文件并替换以下占位符
 * - {{SERVICE_NAME}} - 服务名称 (如: GitHub)
 * - {{LOGIN_CMD}} - 登录命令 (如: gh auth login)
 */

export async function execute() {
  return {
    success: true,
    message: '在终端中执行 {{SERVICE_NAME}} 登录',
    command: '{{LOGIN_CMD}}',
    openTerminal: true,
  };
}
