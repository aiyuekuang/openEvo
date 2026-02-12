# ClawX 架构分析与 openclaw-cn 改进方案

> 基于 ClawX (ValueCell-ai/ClawX) 的深度分析

---

## 📊 核心架构对比

### **ClawX 的三进程架构**

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process                              │
│  - 窗口管理 (window.ts)                              │
│  - 系统托盘 (tray.ts)                                │
│  - IPC 路由 (ipc-handlers.ts)                        │
│  - 自动更新 (updater.ts)                             │
│  - GatewayManager 实例化                             │
└──────────────┬──────────────────────────────────────┘
               │
               ├────────────────────────────┬─────────────────────────
               │                            │
┌──────────────▼─────────────┐  ┌──────────▼──────────────────────┐
│ React Renderer             │  │ OpenClaw Gateway (子进程)        │
│ - UI 组件 (src/)           │  │ - Node.js 进程                   │
│ - Zustand 状态管理         │◄─┤ - WebSocket 服务器 (:18789/ws)  │
│ - WebSocket 客户端         │  │ - AI 编排 & 通道管理              │
│ - 路由 (react-router)      │  │ - 技能系统执行                    │
└────────────────────────────┘  │ - Cron 定时任务                   │
                                 │ - Python/uv 环境管理              │
                                 └───────────────────────────────────┘
```

### **openclaw-cn 的双进程架构（当前）**

```
┌─────────────────────────────────────────┐
│  Electron Main Process                  │
│  - 窗口管理                              │
│  - IPC handlers (ipc.ts)                │
│  - spawn Claude CLI 子进程               │
└──────────────┬──────────────────────────┘
               │
               ├────────────────────────
               │
┌──────────────▼─────────────┐
│ React Renderer             │
│ - UI 组件                   │
│ - Task 管理                 │
│ - 流式响应显示              │
└────────────────────────────┘

问题：
✗ 只支持 Claude CLI
✗ 无 Gateway 进程管理
✗ 无通道系统
✗ 无技能系统
✗ 无定时任务
```

---

## 🔑 ClawX 的核心实现

### 1. **Gateway Process Manager** (`electron/gateway/manager.ts`)

**核心功能**：
- ✅ 进程生命周期管理（启动/停止/重启）
- ✅ 自动重连（指数退避算法）
- ✅ 健康检查（30秒间隔 WebSocket ping）
- ✅ 进程监控（自动重启失败的进程）
- ✅ WebSocket 通信（OpenClaw 协议）
- ✅ RPC 调用（JSON-RPC 2.0 + OpenClaw 协议）
- ✅ 环境变量注入（API Keys）
- ✅ Python/uv 环境自愈

**关键代码片段**：
```typescript
// 启动 OpenClaw Gateway 子进程
const gatewayArgs = [
  'gateway',
  '--port', String(this.status.port),
  '--token', gatewayToken,
  '--dev',
  '--allow-unconfigured'
];

// 使用 Electron Helper 避免 macOS Dock 图标
command = getNodeExecutablePath(); // Electron Helper binary
args = [entryScript, ...gatewayArgs];
env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',  // 关键：让 Electron 作为 Node.js 运行
  OPENCLAW_NO_RESPAWN: '1',   // 防止 OpenClaw 自己 respawn
  ...providerEnv,             // 注入 AI 提供商 API Keys
};

this.process = spawn(command, args, { cwd: openclawDir, env });
```

**重连机制**：
```typescript
// 指数退避重连
const delay = Math.min(
  this.reconnectConfig.baseDelay * Math.pow(2, this.reconnectAttempts),
  this.reconnectConfig.maxDelay
);
// 默认：1s, 2s, 4s, 8s, 16s, 30s (max)
```

**WebSocket 认证**：
```typescript
// OpenClaw 协议握手
const connectFrame = {
  type: 'req',
  id: 'connect-xxxx',
  method: 'connect',
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: { id: 'gateway-client', displayName: 'ClawX', ... },
    auth: { token: gatewayToken },
    caps: [],
    role: 'operator',
  },
};
this.ws.send(JSON.stringify(connectFrame));
```

---

### 2. **IPC 架构** (`electron/main/ipc-handlers.ts`)

**分层设计**：
```typescript
function registerIpcHandlers(
  gatewayManager: GatewayManager,
  clawHubService: ClawHubService,
  mainWindow: BrowserWindow
) {
  registerGatewayHandlers(gatewayManager, mainWindow);
  registerClawHubHandlers(clawHubService);
  registerOpenClawHandlers();
  registerProviderHandlers();
  registerShellHandlers();
  registerDialogHandlers();
  registerAppHandlers();
  registerUvHandlers();
  registerLogHandlers();
  registerSkillConfigHandlers();
  registerCronHandlers(gatewayManager);
  registerWindowHandlers(mainWindow);
  registerWhatsAppHandlers(mainWindow);
}
```

**Gateway RPC 代理示例**：
```typescript
ipcMain.handle('gateway:rpc', async (_, method: string, params?: unknown) => {
  const result = await gatewayManager.rpc(method, params);
  return result;
});

ipcMain.handle('cron:list', async () => {
  const result = await gatewayManager.rpc('cron.list', { includeDisabled: true });
  return result.jobs.map(transformCronJob); // 转换为前端格式
});
```

---

### 3. **依赖管理**

**package.json 关键依赖**：
```json
{
  "dependencies": {
    "openclaw": "2026.2.6-3",     // 核心：内置 OpenClaw npm 包
    "clawhub": "^0.5.0",           // ClawHub 技能市场客户端
    "electron-store": "^11.0.2",   // 持久化配置存储
    "electron-updater": "^6.8.2",  // 自动更新
    "ws": "^8.19.0",               // WebSocket 客户端
    "zustand": "^5.0.11"           // 状态管理
  }
}
```

**打包流程**：
```bash
# 构建命令
vite build && zx scripts/bundle-openclaw.mjs && electron-builder

# bundle-openclaw.mjs 做的事情：
# 1. 复制 node_modules/openclaw 到 resources/openclaw
# 2. 打包所有 OpenClaw 依赖
# 3. 下载 bundled uv (Python 环境管理器)
```

---

### 4. **状态管理** (Zustand)

**Gateway 状态 Store**：
```typescript
interface GatewayStore {
  status: GatewayStatus;          // stopped | starting | running | error | reconnecting
  isConnected: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  rpc: <T>(method: string, params?: unknown) => Promise<T>;
}

// 使用
const { status, start, stop, rpc } = useGatewayStore();
```

---

## 🚀 改进方案：openclaw-cn → openclaw-cn-v2

### **选项 1：完全基于 ClawX** ⭐ 推荐

**实施步骤**：
1. Fork ClawX 项目
2. 保留你的 UI 设计（Tailwind + 任务卡片）
3. 集成 ClawX 的 Gateway 管理层
4. 保留中文本地化

**优点**：
- ✅ 获得完整的 OpenClaw 能力（20+ 通道）
- ✅ 技能系统（ClawHub 市场）
- ✅ Cron 定时任务
- ✅ 多 AI 提供商支持
- ✅ 成熟的进程管理
- ✅ 自动更新机制

**缺点**：
- ⚠️ 需要重构现有代码
- ⚠️ 学习曲线（OpenClaw 协议）

---

### **选项 2：渐进式迁移** 🔧 实用

**阶段 1：替换 CLI 为 Gateway** (1-2 天)

```typescript
// 1. 安装依赖
npm install openclaw ws

// 2. 复制 ClawX 的核心文件
desktop/main/gateway/
  ├── manager.ts        // Gateway 进程管理器
  ├── protocol.ts       // OpenClaw 协议类型
  └── client.ts         // WebSocket 客户端

// 3. 修改 ipc.ts
import { GatewayManager } from './gateway/manager';

const gatewayManager = new GatewayManager();

export function registerIpcHandlers() {
  // 启动 Gateway
  ipcMain.handle('gateway:start', async () => {
    await gatewayManager.start();
    return gatewayManager.getStatus();
  });

  // RPC 调用
  ipcMain.handle('gateway:rpc', async (_, method: string, params?: unknown) => {
    return gatewayManager.rpc(method, params);
  });
}
```

**阶段 2：实现聊天功能** (2-3 天)

```typescript
// 使用 Gateway RPC 发送消息
const response = await window.api.rpc('chat.send', {
  message: 'Hello OpenClaw!',
  model: 'claude-sonnet-4-5-20250929',
  stream: true, // 流式响应
});

// 监听流式 token
gatewayManager.on('chat:message', (data) => {
  // 更新 UI
});
```

**阶段 3：添加通道管理** (3-5 天)

```typescript
// 配置 WhatsApp 通道
await window.api.rpc('channel.configure', {
  channelId: 'whatsapp',
  config: { /* WhatsApp 配置 */ },
});

// 启用/禁用通道
await window.api.rpc('channel.enable', { channelId: 'whatsapp', enabled: true });
```

**阶段 4：集成技能系统** (5-7 天)

```typescript
// 安装技能
await window.api.rpc('skill.install', {
  skillKey: 'github-skill',
  config: { apiKey: 'xxx' },
});

// 列出已安装技能
const skills = await window.api.rpc('skill.list');
```

---

### **选项 3：混合方案** 🎯 平衡

**保留的部分**：
- 你的 UI 设计（Main.tsx, Settings.tsx）
- Task 卡片系统
- Tailwind 样式

**采用 ClawX 的部分**：
- `electron/gateway/manager.ts` - Gateway 进程管理
- `electron/utils/paths.ts` - OpenClaw 路径工具
- `electron/utils/secure-storage.ts` - API Key 安全存储
- `electron/utils/provider-registry.ts` - AI 提供商注册表

**新增功能**：
- 通道配置页面（参考 ClawX 的 Channels.tsx）
- 技能管理页面（参考 ClawX 的 Skills.tsx）
- Cron 任务页面（参考 ClawX 的 Cron.tsx）

---

## 📝 具体改进建议

### 1. **立即可做**（1天内）

```bash
# 1. 复制 ClawX 的 Gateway 管理器
cp /Users/suconnect/Desktop/code/clawx-reference/electron/gateway/manager.ts \
   desktop/main/gateway/manager.ts

cp /Users/suconnect/Desktop/code/clawx-reference/electron/gateway/protocol.ts \
   desktop/main/gateway/protocol.ts

# 2. 安装 openclaw npm 包
cd desktop
npm install openclaw ws electron-store

# 3. 修改 main/index.ts
# 实例化 GatewayManager，注册 IPC handlers

# 4. 修改 ipc.ts
# 添加 Gateway RPC 代理 handlers

# 5. 测试 Gateway 启动
npm run restart
```

### 2. **短期目标**（1周内）

- [ ] Gateway 进程管理（启动/停止/重启）
- [ ] WebSocket 通信和认证
- [ ] 基本的 RPC 调用（chat.send）
- [ ] 流式响应处理
- [ ] 错误处理和重连机制

### 3. **中期目标**（2周内）

- [ ] 通道配置 UI（WhatsApp/Telegram/Slack）
- [ ] API Key 安全存储（electron-store + keytar）
- [ ] 多 AI 提供商支持（OpenAI/Anthropic/Google）
- [ ] 技能系统基础架构

### 4. **长期目标**（1个月内）

- [ ] ClawHub 技能市场集成
- [ ] Cron 定时任务
- [ ] 自动更新机制
- [ ] 完整的国际化（i18next）
- [ ] 打包和分发（electron-builder）

---

## 🔧 关键代码示例

### **修改后的 main/index.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import { GatewayManager } from './gateway/manager';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
const gatewayManager = new GatewayManager();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载 UI
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(gatewayManager);
  createWindow();

  // 自动启动 Gateway
  gatewayManager.start().catch(err => {
    console.error('Failed to start Gateway:', err);
  });

  // 监听 Gateway 事件
  gatewayManager.on('status', (status) => {
    mainWindow?.webContents.send('gateway:status', status);
  });

  gatewayManager.on('chat:message', (data) => {
    mainWindow?.webContents.send('chat:message', data);
  });
});

app.on('window-all-closed', () => {
  gatewayManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### **修改后的 ipc.ts**

```typescript
import { ipcMain } from 'electron';
import { GatewayManager } from './gateway/manager';

export function registerIpcHandlers(gatewayManager: GatewayManager) {
  // Gateway 控制
  ipcMain.handle('gateway:start', async () => {
    await gatewayManager.start();
    return gatewayManager.getStatus();
  });

  ipcMain.handle('gateway:stop', async () => {
    await gatewayManager.stop();
  });

  ipcMain.handle('gateway:restart', async () => {
    await gatewayManager.restart();
  });

  ipcMain.handle('gateway:status', async () => {
    return gatewayManager.getStatus();
  });

  // Gateway RPC 调用
  ipcMain.handle('gateway:rpc', async (_, method: string, params?: unknown) => {
    return gatewayManager.rpc(method, params);
  });

  // 聊天（简化接口）
  ipcMain.handle('chat:send', async (_, message: string) => {
    return gatewayManager.rpc('chat.send', {
      message,
      model: 'claude-sonnet-4-5-20250929',
      stream: true,
    });
  });
}
```

### **修改后的 preload/index.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Gateway 控制
  gateway: {
    start: () => ipcRenderer.invoke('gateway:start'),
    stop: () => ipcRenderer.invoke('gateway:stop'),
    restart: () => ipcRenderer.invoke('gateway:restart'),
    getStatus: () => ipcRenderer.invoke('gateway:status'),
    rpc: (method: string, params?: unknown) =>
      ipcRenderer.invoke('gateway:rpc', method, params),
  },

  // 聊天
  chat: {
    send: (message: string) => ipcRenderer.invoke('chat:send', message),
    onMessage: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on('chat:message', handler);
      return () => ipcRenderer.removeListener('chat:message', handler);
    },
  },

  // Gateway 状态监听
  onGatewayStatus: (callback: (status: any) => void) => {
    const handler = (_: unknown, status: any) => callback(status);
    ipcRenderer.on('gateway:status', handler);
    return () => ipcRenderer.removeListener('gateway:status', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
```

---

## 📚 参考资料

### **ClawX 代码参考**
- Gateway Manager: `/clawx-reference/electron/gateway/manager.ts`
- IPC Handlers: `/clawx-reference/electron/main/ipc-handlers.ts`
- OpenClaw 工具: `/clawx-reference/electron/utils/`

### **官方文档**
- OpenClaw Docs: https://docs.openclaw.ai
- OpenClaw GitHub: https://github.com/openclaw/openclaw
- ClawX GitHub: https://github.com/ValueCell-ai/ClawX

---

## 🎯 下一步行动

**你想怎么做？**

1. **🚀 快速启动**：我帮你复制 Gateway Manager 并集成到你的项目（1-2 小时）
2. **📖 学习优先**：我详细讲解 Gateway 工作原理，你自己实现（半天）
3. **🔄 完全重构**：基于 ClawX fork，保留你的 UI 设计（1 周）

请告诉我你的选择！
