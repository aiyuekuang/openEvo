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

## Testing

- `pnpm test` - 运行测试
- `pnpm lint` - 代码检查

## Architecture

- **Gateway** (`src/gateway/`) - WebSocket 控制平面
- **Agents** (`src/agents/`) - AI 对话运行时
- **Channels** (`src/channels/`) - 渠道抽象层
- **CLI** (`src/cli/`, `src/commands/`) - 命令行工具
- **Config** (`src/config/`) - 配置系统

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
- 配置文件: `~/.openclaw/openclaw.json`

## Skills (技能触发规则)

**⚠️ 强制规则**: 所有对话都必须匹配到至少一个 Skill，并严格按照该 Skill 的指导执行。如果实在没有合适的 Skill，需主动向用户反馈并确认如何处理。

以下技能在相关场景下**自动触发**，只要涉及一点相关内容就启用：

### 1. Config-Driven Development (`.claude/skills/config-driven-dev/`)
**触发条件** - 任何涉及以下内容时启用：
- 新增功能、新指令、新开关
- 修改行为（阈值、策略、过滤规则等）
- 配置文件修改 (`openclaw.json`, `package.json` 配置项等)
- 环境变量、常量定义
- 讨论"默认值"、"可配置"、"开关"等概念

### 2. UI/UX Design (`.claude/skills/ui-ux-design.md`)
**触发条件** - 任何涉及以下内容时启用：
- 用户界面、交互设计
- CLI 命令输出格式、提示信息
- 错误消息、用户反馈文案
- 用户体验、流程设计
- 文档结构、可读性优化

### 3. Product Manager Prompts (`.claude/skills/product-manager-prompts/`)
**触发条件** - 任何涉及以下内容时启用：
- 产品需求、功能规划
- 用户故事 (User Story)
- PRD、需求文档
- 用户画像、场景分析
- 竞品分析、市场定位
- 路线图、优先级排序
- 问题定义、假设验证

### 4. Code Review (`.claude/skills/code-review/`)
**触发条件** - 任何涉及以下内容时启用：
- 代码编写或修改后
- PR/MR 提交前审查
- 代码质量、安全检查
- 提及 "review"、"检查"、"审查"、"bug"
- `git diff` 有未提交的改动
- 安全漏洞扫描、OWASP Top 10

### 5. Systematic Debugging (`.claude/skills/systematic-debugging/`)
**触发条件** - 任何涉及以下内容时启用：
- Bug 修复、问题排查
- 测试失败、异常行为
- 提及 "调试"、"debug"、"报错"、"error"、"bug"
- 运行时错误、崩溃、异常
- "之前能跑"、"突然不工作了"
- 间歇性失败、竞态条件

**核心原则**: 不调查根因，就不修复！使用四阶段方法：根因调查 → 模式分析 → 假设测试 → 实施修复
