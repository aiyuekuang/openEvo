/**
 * 中国渠道插件注册
 * Chinese Channel Plugins Registration
 *
 * 这个模块注册所有中国本地化的消息渠道:
 * - 企业微信 (WeCom)
 * - 钉钉 (DingTalk)
 * - 飞书 (Feishu/Lark)
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
