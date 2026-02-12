import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { GatewayManager } from './gateway/manager'
import { logger } from './utils/logger'

let mainWindow: BrowserWindow | null = null
const gatewayManager = new GatewayManager()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Dev or production
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // 开发模式下可使用 Cmd+Option+I (macOS) 或 Ctrl+Shift+I (Win/Linux) 打开开发者工具
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // 初始化 logger
  logger.init()
  logger.info('=== AI Skill Forge Starting ===')

  // 注册 IPC handlers（传入 gatewayManager）
  registerIpcHandlers(gatewayManager)

  // 创建窗口
  createWindow()

  // 监听 Gateway 状态变化
  gatewayManager.on('status', (status) => {
    mainWindow?.webContents.send('gateway:status', status)
  })

  gatewayManager.on('chat:message', (data) => {
    mainWindow?.webContents.send('gateway:message', data)
  })

  // 自动启动 Gateway
  gatewayManager.start().catch(err => {
    logger.error('Failed to auto-start Gateway:', err)
  })

  // macOS 激活行为
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 停止 Gateway 进程
    gatewayManager.stop().catch(err => {
      logger.error('Failed to stop Gateway:', err)
    }).finally(() => {
      app.quit()
    })
  }
})

// 退出前清理
app.on('before-quit', () => {
  gatewayManager.stop().catch(err => {
    logger.error('Failed to stop Gateway on quit:', err)
  })
})
