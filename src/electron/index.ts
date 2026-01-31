import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GatewayManager } from './gateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      click: () => gatewayManager?.stop() 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        gatewayManager?.stop();
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
}

app.whenReady().then(async () => {
  gatewayManager = new GatewayManager();
  
  // 先启动 Gateway
  console.log('[App] 启动 Gateway...');
  await gatewayManager.start();
  console.log('[App] Gateway 已启动');
  
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    gatewayManager?.stop();
    app.quit();
  }
});

app.on('before-quit', () => {
  gatewayManager?.stop();
});
