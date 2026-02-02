export async function execute() {
  return {
    success: true,
    message: '执行登录',
    command: 'trello auth',
    openTerminal: true,
  };
}
