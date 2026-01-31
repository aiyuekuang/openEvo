/**
 * QQ (OneBot) Outbound 发送器
 * QQ Outbound Adapter via OneBot Protocol
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { sendPrivateMsg, sendGroupMsg, buildImageCQ } from "./api.js";
import type { QQConfig } from "./types.js";

export interface QQChannelConfig {
  /** OneBot HTTP API 地址 */
  httpUrl?: string;
  /** Access Token */
  accessToken?: string;
  /** 机器人 QQ 号 */
  selfId?: string;
  /** 多账号配置 */
  accounts?: Record<string, {
    httpUrl: string;
    accessToken?: string;
    selfId?: string;
  }>;
}

function resolveQQConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): QQConfig | null {
  const qq = cfg.channels?.qq as QQChannelConfig | undefined;
  if (!qq) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (qq.accounts?.[normalizedAccountId]) {
    const account = qq.accounts[normalizedAccountId];
    return {
      httpUrl: account.httpUrl,
      accessToken: account.accessToken,
      selfId: account.selfId,
    };
  }

  // 默认配置
  if (qq.httpUrl) {
    return {
      httpUrl: qq.httpUrl,
      accessToken: qq.accessToken,
      selfId: qq.selfId,
    };
  }

  return null;
}

/**
 * 解析目标地址
 * 格式: private:123456 / group:123456 / 直接 QQ号(默认私聊)
 */
function parseTarget(to: string): { type: "private" | "group"; id: number } {
  if (to.startsWith("group:")) {
    return { type: "group", id: Number(to.substring(6)) };
  }
  if (to.startsWith("private:")) {
    return { type: "private", id: Number(to.substring(8)) };
  }
  // 默认私聊
  return { type: "private", id: Number(to) };
}

/**
 * 发送消息到 QQ
 */
async function sendQQMessage(
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
    throw new Error("QQ: 缺少配置");
  }

  const config = resolveQQConfig(cfg, accountId);
  if (!config) {
    throw new Error("QQ: 配置不完整，请配置 channels.qq.httpUrl");
  }

  const target = parseTarget(to);
  
  // 构建消息内容
  let message = text;
  if (mediaUrl) {
    const imageCQ = buildImageCQ(mediaUrl);
    message = text ? `${text}\n${imageCQ}` : imageCQ;
  }

  // 发送消息
  let result: { messageId: number };
  if (target.type === "group") {
    result = await sendGroupMsg(config, target.id, message);
  } else {
    result = await sendPrivateMsg(config, target.id, message);
  }

  return {
    messageId: `qq_${result.messageId}`,
    chatId: to,
  };
}

export const qqOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4500, // QQ 消息限制

  sendText: async ({ cfg, to, text, accountId }) => {
    const result = await sendQQMessage(to, text, { cfg, accountId });
    return { channel: "qq", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    const result = await sendQQMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "qq", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendQQMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "qq", ...result };
  },
};

export default qqOutbound;
