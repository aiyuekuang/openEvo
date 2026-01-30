# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

OpenClaw CN - 中国商用个人 AI 助手

基于 OpenClaw 架构，支持企业微信/钉钉/飞书等国内渠道。

## Development Setup

```bash
pnpm install
pnpm build
```

## Build Commands

- `pnpm build` - 编译 TypeScript
- `pnpm dev` - 开发模式
- `pnpm gateway:watch` - Gateway 热重载
- `pnpm ui:build` - 构建 UI

## Testing

- `pnpm test` - 运行测试
- `pnpm lint` - 代码检查

## Architecture

- **Gateway** (`src/gateway/`) - WebSocket 控制平面
- **Agents** (`src/agents/`) - AI 对话运行时
- **Channels** (`src/channels/`) - 渠道抽象层
- **CLI** (`src/cli/`, `src/commands/`) - 命令行工具
- **Config** (`src/config/`) - 配置系统
- **UI** (`ui/`) - Web 前端

### 中国渠道 (Chinese Channels)

- **企业微信** (`src/wecom/`) - WeCom 渠道实现
- **钉钉** (`src/dingtalk/`) - DingTalk 渠道实现
- **飞书** (`src/feishu/`) - Feishu/Lark 渠道实现
- **插件注册** (`src/channels-cn/`) - 统一注册入口

每个渠道包含:
- `types.ts` - 类型定义
- `api.ts` - API 客户端 (Token 管理, 发消息, 用户信息)
- `crypto.ts` - 消息加解密 (AES-256-CBC)
- `callback.ts` - 回调处理 (URL 验证, 消息解析)
- `plugin.ts` - ChannelPlugin 插件定义

## Key Differences from OpenClaw

1. **渠道**: 移除了海外渠道 (WhatsApp/Telegram/Slack/Discord/Signal)
2. **目标渠道**: 企业微信、钉钉、飞书
3. **模型**: 需要添加国产模型 Provider (文心/智谱/DeepSeek)

## Important Notes for Agents

- Runtime: Node 22+
- Package Manager: pnpm
- Language: TypeScript (ESM)
- 配置文件: `~/.openclaw-cn/openclaw-cn.json`
