import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GatewayManager } from './gateway.js';
import { registerSkillIpcHandlers } from './skill-ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// 单实例锁 - 防止多个实例同时运行
// =============================================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 另一个实例已在运行，退出当前实例
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let gatewayManager: GatewayManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'OpenClaw CN',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 加载构建后的 UI
  mainWindow.loadFile(path.join(__dirname, '../app/index.html'));
  
  // 开发模式打开 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // 使用简单的图标，后续可以替换
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示主窗口', 
      click: () => mainWindow?.show() 
    },
    { type: 'separator' },
    { 
      label: '启动服务', 
      click: () => gatewayManager?.start() 
    },
    { 
      label: '停止服务', 
      click: async () => await gatewayManager?.stop() 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: async () => {
        await gatewayManager?.stop();
        app.quit();
      }
    },
  ]);

  tray.setToolTip('OpenClaw CN');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

function setupIPC() {
  ipcMain.handle('gateway:start', async () => {
    return gatewayManager?.start();
  });

  ipcMain.handle('gateway:stop', async () => {
    return gatewayManager?.stop();
  });

  ipcMain.handle('gateway:status', async () => {
    return gatewayManager?.getStatus();
  });

  ipcMain.handle('gateway:getPort', async () => {
    return gatewayManager?.getPort();
  });

  ipcMain.handle('gateway:getToken', async () => {
    return gatewayManager?.getToken();
  });

  // 注册技能市场 IPC handlers
  registerSkillIpcHandlers(ipcMain);
}

// 当第二个实例尝试启动时，聚焦已有窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  gatewayManager = new GatewayManager();
  
  // 先启动 Gateway
  await gatewayManager.start();
  
  // 再创建窗口
  createWindow();
  createTray();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await gatewayManager?.stop();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await gatewayManager?.stop();
});
