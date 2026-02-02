export async function execute() {
  return {
    success: true,
    message: '执行登录',
    command: 'spt auth',
    openTerminal: true,
  };
}
