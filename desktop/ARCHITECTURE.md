# AI Skill Forge — 架构文档

## 概述

AI Skill Forge 是一个桌面端 AI 任务助手，通过直接调用各大 LLM 供应商的 API 来执行任务。用户可以配置多个 AI 供应商（Anthropic、OpenAI、DeepSeek 等），在任务页面选择模型后发送任务。

## 技术栈

- **框架**: Electron + electron-vite
- **前端**: React + TypeScript + Tailwind CSS
- **LLM SDK**: `@anthropic-ai/sdk`（Anthropic）、`openai`（OpenAI 兼容）
- **构建**: electron-vite 5.x

## 目录结构

```
desktop/
├── main/                       # Electron 主进程
│   ├── index.ts                # 入口：窗口创建 + IPC 注册
│   ├── ipc.ts                  # IPC handlers（provider:*、task:*、config:*）
│   ├── providers/              # LLM 供应商系统
│   │   ├── types.ts            # 类型定义（ProviderConfig、ProviderAuth 等）
│   │   ├── registry.ts         # 预设供应商注册表（6 个内置供应商）
│   │   ├── llm-client.ts       # 统一 LLM 客户端（流式调用）
│   │   └── store.ts            # 供应商认证持久化（JSON 文件存储）
│   ├── config/
│   │   └── store.ts            # 通用配置存储
│   └── utils/
│       └── logger.ts           # 日志工具
├── preload/
│   └── index.ts                # Context Bridge（安全暴露 API 到渲染进程）
├── renderer/
│   └── src/
│       ├── App.tsx             # 路由：main | settings
│       ├── pages/
│       │   ├── Main.tsx        # 主页：任务列表 + 模型指示器
│       │   └── Settings.tsx    # 设置：左右分栏布局
│       ├── components/
│       │   ├── TaskInput.tsx   # 输入栏 + 模型选择器
│       │   ├── TaskGrid.tsx    # 任务卡片网格
│       │   └── TaskCard.tsx    # 单个任务卡片
│       ├── hooks/
│       │   └── useTasks.ts     # 任务状态管理 + 流式响应监听
│       └── types/
│           └── task.ts         # Task、ChatMessage 类型
└── electron.vite.config.ts     # electron-vite 配置
```

## 架构设计

### 1. Provider 系统

统一抽象层，支持两种 SDK 类型：

| SDK 类型 | 使用场景 | NPM 包 |
|---------|---------|--------|
| `anthropic` | Anthropic Claude | `@anthropic-ai/sdk` |
| `openai-compatible` | OpenAI / DeepSeek / 通义千问 / 月之暗面 / 智谱 | `openai` |

**内置供应商**:
- Anthropic Claude（claude-sonnet-4-20250514, claude-haiku-4-20250414）
- OpenAI（gpt-4o, gpt-4o-mini）
- 深度求索 DeepSeek（deepseek-chat, deepseek-reasoner）
- 通义千问 Qwen（qwen-max, qwen-plus, qwen-turbo）
- 月之暗面 Kimi（moonshot-v1-128k, moonshot-v1-32k）
- 智谱 ChatGLM（glm-4, glm-4-flash）

**认证模式**: API Key / OAuth 浏览器登录（双模式）

### 2. 数据流

```
用户输入任务
    ↓
TaskInput (选择模型 + 输入消息)
    ↓
useTasks.createTask(title, msg, images, providerId, model)
    ↓
window.api.createTask(taskId, message, providerId, model)
    ↓ IPC invoke
ipc.ts → task:create handler
    ↓
llmClient.chat(messages, { model, providerId })
    ↓ AsyncGenerator 流式
sender.send('task:stream', { taskId, type: 'token', content, fullResponse })
    ↓ IPC event
useTasks → onTaskStream listener → 更新 UI
```

### 3. 持久化

供应商认证数据保存在 `app.getPath('userData')/config/` 下：

| 文件 | 内容 |
|-----|------|
| `providers.json` | 各供应商的 API Key / OAuth Token |
| `defaults.json` | 各供应商的默认模型选择 |
| `active-provider.json` | 当前活跃的供应商和模型 |
| `custom-providers.json` | 用户添加的自定义 OpenAI 兼容供应商 |

### 4. 页面结构

**Main 页面**:
- 标题栏：应用名 + 当前模型指示器 + 任务统计 + 设置按钮
- 任务卡片网格：显示所有任务的状态和对话
- 底部输入栏：模型选择器 + 标题输入 + 消息输入 + 图片上传 + 发送

**Settings 页面**:
- 左侧导航：账号配置（模型配置 / 通知设置）、通用（通用设置 / 关于）
- 右侧内容：供应商卡片列表，每个卡片显示配置状态、认证方式、API Key/模型选择
