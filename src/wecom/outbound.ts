/**
 * 企业微信 Outbound 发送器
 * WeCom Outbound Adapter
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { sendMessage } from "./api.js";
import type { WeComConfig } from "./types.js";

export interface WeComChannelConfig {
  corpId?: string;
  agentId?: number | string;
  secret?: string;
  accounts?: Record<string, {
    corpId: string;
    agentId: number | string;
    secret: string;
  }>;
}

function resolveWeComConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): WeComConfig | null {
  const wecom = cfg.channels?.wecom as WeComChannelConfig | undefined;
  if (!wecom) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (wecom.accounts?.[normalizedAccountId]) {
    const account = wecom.accounts[normalizedAccountId];
    return {
      corpId: account.corpId,
      agentId: Number(account.agentId),
      secret: account.secret,
    };
  }

  // 默认配置
  if (wecom.corpId && wecom.agentId && wecom.secret) {
    return {
      corpId: wecom.corpId,
      agentId: Number(wecom.agentId),
      secret: wecom.secret,
    };
  }

  return null;
}

/**
 * 发送消息到企业微信
 */
async function sendWeComMessage(
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
    throw new Error("WeCom: 缺少配置");
  }

  const config = resolveWeComConfig(cfg, accountId);
  if (!config) {
    throw new Error("WeCom: 配置不完整");
  }

  // 判断目标类型: userId 或 partyId 或 tagId
  // 格式: user:xxx / party:xxx / tag:xxx / 直接 userId
  let toUser: string | undefined;
  let toParty: string | undefined;
  let toTag: string | undefined;

  if (to.startsWith("party:")) {
    toParty = to.substring(6);
  } else if (to.startsWith("tag:")) {
    toTag = to.substring(4);
  } else if (to.startsWith("user:")) {
    toUser = to.substring(5);
  } else {
    toUser = to;
  }

  // 检查是否包含 markdown 语法
  const hasMarkdown = /[*_`#\[\]()]/.test(text);

  // 如果有媒体URL，用 markdown 形式发送
  let content = text;
  if (mediaUrl) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl);
    if (isImage) {
      content = text ? `${text}\n\n![图片](${mediaUrl})` : `![图片](${mediaUrl})`;
    } else {
      content = text ? `${text}\n\n[文件](${mediaUrl})` : `[文件](${mediaUrl})`;
    }
  }

  // 发送消息
  const msgType = (hasMarkdown || mediaUrl) ? "markdown" : "text";
  await sendMessage(config, {
    toUser,
    toParty,
    toTag,
    agentId: config.agentId,
    msgType,
    content,
  });

  return {
    messageId: `wecom_${Date.now()}`,
    chatId: to,
  };
}

export const wecomOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2048,

  sendText: async ({ cfg, to, text, accountId }) => {
    const result = await sendWeComMessage(to, text, { cfg, accountId });
    return { channel: "wecom", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    const result = await sendWeComMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "wecom", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendWeComMessage(to, text, { cfg, accountId, mediaUrl });
    return { channel: "wecom", ...result };
  },
};

export default wecomOutbound;
