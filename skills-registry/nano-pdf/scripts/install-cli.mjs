export async function execute() {
  return {
    success: true,
    message: '使用 uv 安装 nano-pdf',
    command: 'uv tool install nano-pdf',
    openTerminal: true,
  };
}
