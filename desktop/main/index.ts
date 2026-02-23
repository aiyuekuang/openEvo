import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { logger } from './utils/logger'
import { getMemoryDb, closeMemoryDb } from './memory/db'
import { syncMemoryIndex } from './memory/indexer'
import { registerMemoryTools } from './memory/tools'
import { isEmbeddingAvailable } from './memory/embeddings'
import { initEvolang } from './evolang/bridge'

let mainWindow: BrowserWindow | null = null

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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  logger.init()
  logger.info('=== AI Skill Forge Starting ===')

  // 初始化记忆数据库
  try {
    getMemoryDb()
    logger.info('[Memory] SQLite database initialized')
  } catch (err) {
    logger.error('[Memory] Failed to initialize database:', err)
  }

  // 注册 Memory Tools 到全局 Tool Registry（保留向后兼容）
  registerMemoryTools()
  logger.info('[Tools] Memory tools registered')

  // 初始化 evolang 运行时
  initEvolang()
    .then(() => logger.info('[EvoLang] Agent initialized'))
    .catch(err => logger.error('[EvoLang] Init failed:', err))

  // 后台同步记忆索引（需要 OpenAI API Key）
  if (isEmbeddingAvailable()) {
    syncMemoryIndex()
      .then(() => logger.info('[Memory] Index sync complete'))
      .catch(err => logger.warn('[Memory] Index sync failed:', err))
  } else {
    logger.info('[Memory] Embedding 跳过（未配置 OpenAI API Key）')
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  try {
    closeMemoryDb()
    logger.info('[Memory] Database closed')
  } catch (err) {
    logger.error('[Memory] Failed to close database:', err)
  }
})
