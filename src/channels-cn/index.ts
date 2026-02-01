/**
 * 中国渠道插件注册
 * Chinese Channel Plugins Registration
 *
 * 这个模块注册所有中国本地化的消息渠道:
 * - 企业微信 (WeCom)
 * - 钉钉 (DingTalk)
 * - 飞书 (Feishu/Lark)
 *
 * 配置示例 (CLI):
 *
 * # 钉钉配置 (最容易配置)
 * openclaw config set channels.dingtalk '{
 *   "enabled": true,
 *   "appKey": "dingxxxxxx",
 *   "appSecret": "your-app-secret",
 *   "enableAICard": true
 * }' --json
 *
 * # 飞书配置 (WebSocket 模式，无需公网)
 * openclaw config set channels.feishu '{
 *   "enabled": true,
 *   "appId": "cli_xxxxxx",
 *   "appSecret": "your-app-secret",
 *   "connectionMode": "websocket"
 * }' --json
 *
 * # 企业微信配置
 * openclaw config set channels.wecom '{
 *   "enabled": true,
 *   "corpId": "ww12345678",
 *   "agentId": 1000002,
 *   "secret": "your-agent-secret",
 *   "token": "callback-token",
 *   "encodingAesKey": "callback-aes-key"
 * }' --json
 *
 * 更多配置选项请查看 ~/.openclaw/openclaw.json
 */

import type { OpenClawPluginApi } from "../plugins/types.js";
import { wecomPlugin } from "../wecom/plugin.js";
import { dingtalkPlugin } from "../dingtalk/plugin.js";
import { feishuPlugin } from "../feishu/plugin.js";

/**
 * 注册所有中国渠道插件
 */
export function registerChineseChannels(api: OpenClawPluginApi): void {
  // 企业微信
  api.registerChannel({
    plugin: wecomPlugin,
  });

  // 钉钉
  api.registerChannel({
    plugin: dingtalkPlugin,
  });

  // 飞书
  api.registerChannel({
    plugin: feishuPlugin,
  });
}

/**
 * 插件定义 (用于独立加载)
 */
export default {
  id: "openclaw-cn-channels",
  name: "OpenClaw CN Channels",
  version: "0.1.0",
  description: "中国本地化消息渠道 (企业微信/钉钉/飞书)",
  register: registerChineseChannels,
};

/**
 * 导出各渠道插件供直接使用
 */
export { wecomPlugin } from "../wecom/plugin.js";
export { dingtalkPlugin } from "../dingtalk/plugin.js";
export { feishuPlugin } from "../feishu/plugin.js";
