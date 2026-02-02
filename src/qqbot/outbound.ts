/**
 * QQ 官方机器人 Outbound 发送器
 * QQ Official Bot Outbound Adapter
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  sendTextMessage,
  sendImageMessage,
  sendGroupMessage,
  sendC2CMessage,
  sendChannelMessage,
  uploadGroupMedia,
  uploadC2CMedia,
} from "./api.js";
import type { QQBotConfig } from "./types.js";

export interface QQBotChannelConfig {
  /** 机器人 AppID */
  appId?: string;
  /** 机器人 AppSecret */
  appSecret?: string;
  /** 是否为沙箱环境 */
  sandbox?: boolean;
  /** 回调 Token */
  token?: string;
  /** 多账号配置 */
  accounts?: Record<
    string,
    {
      appId: string;
      appSecret: string;
      sandbox?: boolean;
      token?: string;
    }
  >;
}

function resolveQQBotConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): QQBotConfig | null {
  const qqbot = cfg.channels?.qqbot as QQBotChannelConfig | undefined;
  if (!qqbot) return null;

  const normalizedAccountId =
    (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (qqbot.accounts?.[normalizedAccountId]) {
    const account = qqbot.accounts[normalizedAccountId];
    return {
      appId: account.appId,
      appSecret: account.appSecret,
      sandbox: account.sandbox,
      token: account.token,
    };
  }

  // 默认配置
  if (qqbot.appId && qqbot.appSecret) {
    return {
      appId: qqbot.appId,
      appSecret: qqbot.appSecret,
      sandbox: qqbot.sandbox,
      token: qqbot.token,
    };
  }

  return null;
}

/**
 * 解析目标地址
 * 格式:
 * - channel:子频道ID[:消息ID] - 频道消息
 * - group:群openid[:消息ID] - 群聊消息
 * - c2c:用户openid[:消息ID] / 直接 openid - C2C 私聊消息
 */
function parseTarget(to: string): {
  type: "channel" | "group" | "c2c";
  id: string;
  msgId?: string;
} {
  // channel:xxx 或 channel:xxx:msgId
  if (to.startsWith("channel:")) {
    const parts = to.substring(8).split(":");
    return {
      type: "channel",
      id: parts[0],
      msgId: parts[1],
    };
  }

  // group:xxx 或 group:xxx:msgId
  if (to.startsWith("group:")) {
    const parts = to.substring(6).split(":");
    return {
      type: "group",
      id: parts[0],
      msgId: parts[1],
    };
  }

  // c2c:xxx 或 c2c:xxx:msgId
  if (to.startsWith("c2c:")) {
    const parts = to.substring(4).split(":");
    return {
      type: "c2c",
      id: parts[0],
      msgId: parts[1],
    };
  }

  // 默认为 C2C 私聊
  const parts = to.split(":");
  return {
    type: "c2c",
    id: parts[0],
    msgId: parts[1],
  };
}

/**
 * 发送消息到 QQ Bot
 */
async function sendQQBotMessage(
  to: string,
  text: string,
  options: {
    cfg?: OpenClawConfig;
    accountId?: string | null;
    mediaUrl?: string;
  }
): Promise<{ messageId: string; chatId: string }> {
  const { cfg, accountId, mediaUrl } = options;

  if (!cfg) {
    throw new Error("QQBot: 缺少配置");
  }

  const config = resolveQQBotConfig(cfg, accountId);
  if (!config) {
    throw new Error("QQBot: 配置不完整，请配置 channels.qqbot.appId 和 appSecret");
  }

  const target = parseTarget(to);

  // 如果有媒体文件
  if (mediaUrl) {
    const result = await sendImageMessage(config, target, mediaUrl);
    return {
      messageId: `qqbot_${result.id}`,
      chatId: to,
    };
  }

  // 发送纯文本消息
  const result = await sendTextMessage(config, target, text);
  return {
    messageId: `qqbot_${result.id}`,
    chatId: to,
  };
}

export const qqbotOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2000, // QQ Bot 消息限制

  sendText: async ({ cfg, to, text, accountId }) => {
    const result = await sendQQBotMessage(to, text, { cfg, accountId });
    return { channel: "qqbot", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    const result = await sendQQBotMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "qqbot", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendQQBotMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "qqbot", ...result };
  },
};

export default qqbotOutbound;
