/**
 * 个人微信 (Wechaty) Outbound 发送器
 * WeChat Outbound Adapter via Wechaty HTTP Bridge
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { sendText, sendImage, toApiConfig } from "./api.js";
import type { WeChatConfig } from "./types.js";

export interface WeChatChannelConfig {
  /** Wechaty HTTP Bridge 服务地址 */
  bridgeUrl?: string;
  /** API Token */
  token?: string;
  /** 机器人微信ID */
  selfId?: string;
  /** 多账号配置 */
  accounts?: Record<string, {
    bridgeUrl: string;
    token?: string;
    selfId?: string;
  }>;
}

function resolveWeChatConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): WeChatConfig | null {
  const wechat = cfg.channels?.wechat as WeChatChannelConfig | undefined;
  if (!wechat) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (wechat.accounts?.[normalizedAccountId]) {
    const account = wechat.accounts[normalizedAccountId];
    return {
      puppetServerUrl: account.bridgeUrl,
      puppetToken: account.token,
      selfId: account.selfId,
    };
  }

  // 默认配置
  if (wechat.bridgeUrl) {
    return {
      puppetServerUrl: wechat.bridgeUrl,
      puppetToken: wechat.token,
      selfId: wechat.selfId,
    };
  }

  return null;
}

/**
 * 解析目标地址
 * 格式: room:xxx@chatroom / 直接微信ID(默认私聊)
 */
function parseTarget(to: string): { isRoom: boolean; id: string } {
  if (to.startsWith("room:")) {
    return { isRoom: true, id: to.substring(5) };
  }
  if (to.includes("@chatroom")) {
    return { isRoom: true, id: to };
  }
  return { isRoom: false, id: to };
}

/**
 * 发送消息到微信
 */
async function sendWeChatMessage(
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
    throw new Error("WeChat: 缺少配置");
  }

  const config = resolveWeChatConfig(cfg, accountId);
  if (!config) {
    throw new Error("WeChat: 配置不完整，请配置 channels.wechat.bridgeUrl");
  }

  const apiConfig = toApiConfig(config);
  const target = parseTarget(to);

  // 发送图片
  if (mediaUrl) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl);
    if (isImage) {
      // 先发图片
      const imageResult = await sendImage(apiConfig, target.id, mediaUrl, target.isRoom);
      // 如果有文字，再发文字
      if (text) {
        await sendText(apiConfig, target.id, text, target.isRoom);
      }
      return {
        messageId: `wechat_${imageResult.messageId}`,
        chatId: to,
      };
    }
  }

  // 发送文本
  const result = await sendText(apiConfig, target.id, text, target.isRoom);

  return {
    messageId: `wechat_${result.messageId}`,
    chatId: to,
  };
}

export const wechatOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4096, // 微信消息限制

  sendText: async ({ cfg, to, text, accountId }) => {
    const result = await sendWeChatMessage(to, text, { cfg, accountId });
    return { channel: "wechat", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    const result = await sendWeChatMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "wechat", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendWeChatMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "wechat", ...result };
  },
};

export default wechatOutbound;
