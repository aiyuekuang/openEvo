# OpenClaw 功能盘点

## 架构概览

```
消息渠道 (WhatsApp/Telegram/Slack/...)
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│       (WebSocket 控制平面)     │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Agent 运行时 (RPC)
               ├─ CLI 命令行
               ├─ WebChat UI
               ├─ macOS/iOS/Android 应用
               └─ Skills 技能系统
```

---

## 一、核心平台 (Core Platform) ✅ 可复用

| 模块 | 功能 | 复用建议 |
|------|------|----------|
| **Gateway** | WebSocket 控制平面，管理会话/频道/工具/事件 | ✅ 核心，必须 |
| **Agent Runtime** | AI 对话运行时，工具调用，流式输出 | ✅ 核心，必须 |
| **Session Model** | 会话管理，上下文隔离，群组规则 | ✅ 核心，必须 |
| **CLI** | 命令行工具 (onboard/gateway/agent/doctor) | ✅ 运维必备 |
| **Config System** | JSON 配置系统 | ✅ 直接复用 |
| **Logging** | 日志系统 | ✅ 直接复用 |

---

## 二、消息渠道 (Channels)

### 原版渠道（不需要）
| 渠道 | 实现方式 | 中国版 |
|------|----------|--------|
| WhatsApp | Baileys (逆向) | ❌ 不需要 |
| Telegram | grammY | ❌ 不需要 |
| Slack | Bolt SDK | ❌ 不需要 |
| Discord | discord.js | ❌ 不需要 |
| Signal | signal-cli | ❌ 不需要 |
| iMessage | imsg | ❌ 不需要 |
| Google Chat | Chat API | ❌ 不需要 |
| Microsoft Teams | Bot Framework | ❌ 不需要 |
| Matrix | matrix-js-sdk | ❌ 不需要 |
| Zalo | extension | ❌ 不需要 |

### 需要新建的渠道
| 渠道 | 接入方式 | 优先级 |
|------|----------|--------|
| **企业微信** | 官方 API | 🔴 高 |
| **钉钉** | 官方机器人 API | 🔴 高 |
| **飞书** | 官方机器人 API | 🔴 高 |
| **微信个人** | 待调研 | 🟡 中 |
| **QQ** | 待调研 | 🟡 中 |

### 可复用的渠道
| 渠道 | 说明 |
|------|------|
| **WebChat** | Web 聊天界面，可直接复用 | ✅ |

---

## 三、AI 模型支持 (Providers)

### 原版支持的模型
- Anthropic Claude (Claude 3/4 系列)
- OpenAI (GPT-4/GPT-5)
- Google Gemini
- GitHub Copilot
- Qwen (通义千问 Portal)
- MiniMax

### 中国版需要加强
| 模型 | 状态 | 说明 |
|------|------|------|
| 通义千问 | 🟡 部分 | 已有 qwen-portal，需完善 |
| 文心一言 | 🔴 需新建 | 百度官方 API |
| 智谱 ChatGLM | 🔴 需新建 | |
| DeepSeek | 🔴 需新建 | |
| 讯飞星火 | 🔴 需新建 | |
| 月之暗面 Kimi | 🔴 需新建 | |
| MiniMax | ✅ 已有 | |

---

## 四、工具 & 自动化 (Tools)

| 工具 | 功能 | 复用建议 |
|------|------|----------|
| **Browser Control** | 浏览器自动化 (Chromium CDP) | ✅ 可复用 |
| **Cron Jobs** | 定时任务 | ✅ 可复用 |
| **Webhooks** | HTTP 回调触发 | ✅ 可复用 |
| **File Read/Write** | 文件操作 | ✅ 可复用 |
| **Process/Exec** | 执行系统命令 | ✅ 可复用 |

---

## 五、Skills 技能系统

### 通用可复用
| Skill | 功能 | 复用 |
|-------|------|------|
| github | GitHub 操作 | ✅ |
| coding-agent | 编码助手 | ✅ |
| summarize | 文档总结 | ✅ |
| weather | 天气查询 | 🟡 需换API |
| trello | Trello 集成 | ✅ |
| notion | Notion 集成 | ✅ |
| obsidian | Obsidian 笔记 | ✅ |
| tmux | 终端管理 | ✅ |

### 不适用
| Skill | 原因 |
|-------|------|
| apple-notes | macOS 专属 |
| apple-reminders | macOS 专属 |
| imsg | iMessage 专属 |
| slack | Slack 渠道专属 |
| discord | Discord 渠道专属 |

### 中国特色需新建
| Skill | 功能 |
|-------|------|
| wechat-work | 企业微信集成 |
| dingtalk | 钉钉集成 |
| feishu | 飞书集成 |
| alipay-mini | 支付宝小程序？ |

---

## 六、客户端应用 (Apps)

| 应用 | 平台 | 复用建议 |
|------|------|----------|
| **Control UI** | Web | ✅ 可复用 |
| **WebChat** | Web | ✅ 可复用 |
| **macOS App** | macOS | ✅ 需要 (Menu Bar + Voice Wake + Talk Mode) |
| **iOS Node** | iOS | ✅ 需要 |
| **Android Node** | Android | ✅ 需要 |

---

## 七、运维功能

| 功能 | 说明 | 复用 |
|------|------|------|
| **Doctor** | 诊断工具 | ✅ |
| **Daemon** | 后台服务管理 | ✅ |
| **Config Wizard** | 配置向导 | ✅ |
| **Logging** | 日志系统 | ✅ |
| **Docker Support** | 容器化部署 | ✅ |

---

## 复用优先级总结

### 🔴 必须复用 (核心)
1. Gateway WebSocket 控制平面
2. Agent Runtime (对话引擎)
3. Session Model (会话管理)
4. Config System
5. CLI 工具

### 🟡 建议复用 (提效)
1. WebChat UI
2. Control UI
3. Browser Control
4. Cron/Webhooks
5. Skills 框架
6. Docker 部署
7. macOS App (Menu Bar + Voice Wake + Talk Mode)
8. iOS/Android Node

### 🗕 需要新建 (中国特色)
1. 企业微信渠道
2. 钉钉渠道
3. 飞书渠道
4. 国产模型 Provider (文心/智谱/DeepSeek等)

### ❌ 不需要
1. 海外消息渠道 (WhatsApp/Telegram/Slack/Discord/Signal等)
2. iMessage/BlueBubbles
