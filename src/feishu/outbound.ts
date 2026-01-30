/**
 * 飞书 Outbound 发送器
 * Feishu (Lark) Outbound Adapter
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  sendTextMessage,
  sendMessage,
  replyTextMessage,
  replyMessage,
} from "./api.js";
import type { FeishuConfig, FeishuPostContent } from "./types.js";

export interface FeishuChannelConfig {
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  accounts?: Record<string, {
    appId: string;
    appSecret: string;
    verificationToken?: string;
    encryptKey?: string;
  }>;
}

function resolveFeishuConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): FeishuConfig | null {
  const feishu = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  if (!feishu) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (feishu.accounts?.[normalizedAccountId]) {
    const account = feishu.accounts[normalizedAccountId];
    return {
      appId: account.appId,
      appSecret: account.appSecret,
      verificationToken: account.verificationToken,
      encryptKey: account.encryptKey,
    };
  }

  // 默认配置
  if (feishu.appId && feishu.appSecret) {
    return {
      appId: feishu.appId,
      appSecret: feishu.appSecret,
      verificationToken: feishu.verificationToken,
      encryptKey: feishu.encryptKey,
    };
  }

  return null;
}

/**
 * 判断目标 ID 类型
 */
function parseTarget(to: string): {
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  receiveId: string;
} {
  if (to.startsWith("ou_")) {
    return { receiveIdType: "open_id", receiveId: to };
  }
  if (to.startsWith("oc_")) {
    return { receiveIdType: "chat_id", receiveId: to };
  }
  if (to.startsWith("on_")) {
    return { receiveIdType: "union_id", receiveId: to };
  }
  if (to.includes("@")) {
    return { receiveIdType: "email", receiveId: to };
  }
  if (to.startsWith("chat:")) {
    return { receiveIdType: "chat_id", receiveId: to.substring(5) };
  }
  if (to.startsWith("user:")) {
    return { receiveIdType: "user_id", receiveId: to.substring(5) };
  }
  if (to.startsWith("open:")) {
    return { receiveIdType: "open_id", receiveId: to.substring(5) };
  }
  // 默认当作 chat_id
  return { receiveIdType: "chat_id", receiveId: to };
}

/**
 * 将 Markdown 转换为飞书富文本格式
 */
function markdownToPost(text: string): FeishuPostContent {
  // 简单处理：将文本按行分割，每行作为一个段落
  const lines = text.split("\n");
  const content: FeishuPostContent["zh_cn"] = {
    title: "",
    content: lines.map(line => {
      // 处理链接 [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const parts: Array<{ tag: "text" | "a"; text?: string; href?: string }> = [];
      let lastIndex = 0;
      let match;

      while ((match = linkRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ tag: "text", text: line.substring(lastIndex, match.index) });
        }
        parts.push({ tag: "a", text: match[1], href: match[2] });
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < line.length) {
        parts.push({ tag: "text", text: line.substring(lastIndex) });
      }

      return parts.length > 0 ? parts : [{ tag: "text", text: line }];
    }),
  };

  return { zh_cn: content };
}

/**
 * 发送消息到飞书
 */
async function sendFeishuMessage(
  to: string,
  text: string,
  options: {
    cfg?: OpenClawConfig;
    accountId?: string | null;
    mediaUrl?: string;
    replyToId?: string | null;
  }
): Promise<{ messageId: string; chatId: string }> {
  const { cfg, accountId, mediaUrl, replyToId } = options;

  if (!cfg) {
    throw new Error("Feishu: 缺少配置");
  }

  const config = resolveFeishuConfig(cfg, accountId);
  if (!config) {
    throw new Error("Feishu: 配置不完整");
  }

  const { receiveIdType, receiveId } = parseTarget(to);

  let messageId: string;

  // 如果有 replyToId，使用回复消息 API
  if (replyToId) {
    // 检查是否包含 markdown 语法
    const hasMarkdown = /[*_`#\[\]()]/.test(text);

    if (hasMarkdown || mediaUrl) {
      // 使用富文本格式
      const post = markdownToPost(
        mediaUrl ? `${text}\n\n[查看附件](${mediaUrl})` : text
      );
      messageId = await replyMessage(config, replyToId, "post", JSON.stringify(post));
    } else {
      messageId = await replyTextMessage(config, replyToId, text);
    }
  } else {
    // 发送新消息
    const hasMarkdown = /[*_`#\[\]()]/.test(text);

    if (hasMarkdown || mediaUrl) {
      // 使用富文本格式
      const post = markdownToPost(
        mediaUrl ? `${text}\n\n[查看附件](${mediaUrl})` : text
      );
      messageId = await sendMessage(
        config,
        receiveIdType,
        receiveId,
        "post",
        JSON.stringify(post)
      );
    } else {
      messageId = await sendTextMessage(config, receiveIdType, receiveId, text);
    }
  }

  return {
    messageId,
    chatId: to,
  };
}

export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4000,

  sendText: async ({ cfg, to, text, accountId, replyToId }) => {
    const result = await sendFeishuMessage(to, text, { cfg, accountId, replyToId });
    return { channel: "feishu", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) => {
    const result = await sendFeishuMessage(to, text, { cfg, accountId, mediaUrl, replyToId });
    return { channel: "feishu", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId, replyToId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendFeishuMessage(to, text, { cfg, accountId, mediaUrl, replyToId });
    return { channel: "feishu", ...result };
  },
};

export default feishuOutbound;
