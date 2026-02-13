# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**OpenEvo** 是一个基于 Electron 的桌面 AI 平台，通过 Skills 递归调用实现自我管理和进化。用户可以通过自然语言与多供应商 LLM 对话，获得实时的流式响应。

## Build & Development Commands

```bash
# 开发模式 (启动 Electron + Vite dev server)
cd desktop && npm run dev

# 构建生产版本
cd desktop && npm run build

# 类型检查
cd desktop && npm run typecheck

# 预览构建产物
cd desktop && npm run preview
```

## Architecture

### 进程结构 (Electron)

```
desktop/
├── main/           # Main Process (Node.js)
│   ├── index.ts    # 应用入口，创建 BrowserWindow
│   ├── ipc.ts      # IPC handlers 注册中心
│   ├── config/     # 配置存储 (Electron safeStorage)
│   │   └── store.ts
│   └── llm/        # Claude Agent SDK 集成 ★
│       └── claude-sdk-adapter.ts  # Claude SDK 适配器
├── preload/        # Preload scripts (contextBridge)
│   └── index.ts
└── renderer/       # Renderer Process (React)
    └── src/
        ├── pages/      # 页面组件 (ClaudeSetup, Main, Settings)
        └── components/ # UI 组件
```

### Claude Agent SDK 集成

核心模块：`main/llm/claude-sdk-adapter.ts`

**功能**：
- 封装 `@anthropic-ai/claude-agent-sdk` 的 `query()` API
- 提供流式响应支持（token 级增量更新）
- 自动处理环境变量（移除 ELECTRON_RUN_AS_NODE）
- 支持配置化模型和 system prompt

**数据流**：
```
用户输入 → IPC (task:create) → ClaudeSDKAdapter.sendMessage()
        → Claude Agent SDK query() → 流式事件
        → IPC (task:stream) → 渲染进程实时更新
```

### 关键接口

**ClaudeConfig**
```typescript
interface ClaudeConfig {
  apiKey: string
  model?: string  // 默认 'claude-sonnet-4-5-20250929'
  systemPrompt?: string
  maxTokens?: number
}
```

**ClaudeStreamEvent**
```typescript
interface ClaudeStreamEvent {
  type: 'token' | 'done' | 'error'
  content?: string        // 增量内容 (token)
  fullResponse?: string   // 当前累积的完整响应
  error?: string
}
```

### IPC 接口

**Claude 配置**
- `claude:check` → 检查是否已配置 API Key
- `claude:configure` → 保存 API Key 和模型配置
- `claude:get-config` → 获取当前配置

**任务执行**
- `task:create(taskId, message)` → 创建任务并执行（返回 Promise）
- `task:stream` (event) → 流式推送 token 更新到渲染进程
- `task:cancel(taskId)` → 取消正在执行的任务

**通用**
- `config:get(key)` / `config:set(key, value)` → 读写配置
- `shell:openExternal(url)` → 打开外部链接
- `dep:check-all` → 检查依赖状态

### 配置存储

使用 Electron 的 `safeStorage` API 加密存储敏感信息（API Key）。

**配置文件位置**：
- macOS: `~/Library/Application Support/openevo/config.json`
- Windows: `%APPDATA%\openevo\config.json`
- Linux: `~/.config/openevo/config.json`

### 前端页面

**ClaudeSetup** (`renderer/src/pages/ClaudeSetup.tsx`)
- 首次配置引导页面
- 输入 API Key 和选择模型
- 验证并保存配置

**Main** (`renderer/src/pages/Main.tsx`)
- 主界面，显示任务列表
- 底部输入框发送消息
- 实时显示流式响应

**Settings** (`renderer/src/pages/Settings.tsx`)
- 查看当前 Claude 配置（隐藏部分 API Key）
- 重新配置 API Key
- 系统信息

## Conventions

- **中文优先**: UI 文案和代码注释优先使用中文
- **流式响应**: 使用 Claude Agent SDK 的 AsyncGenerator 实现 token 级流式输出
- **IPC 命名**: 使用 `namespace:action` 格式，如 `claude:configure`, `task:create`
- **安全存储**: API Key 使用 Electron safeStorage 加密存储
- **环境清理**: 主进程中 delete `ELECTRON_RUN_AS_NODE` 以确保 SDK 正常运行

## Dependencies

核心依赖：
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK（官方）
- `electron` - Electron 框架
- `electron-vite` - 构建工具
- `react` + `react-dom` - UI 框架
- `tailwindcss` - CSS 框架
