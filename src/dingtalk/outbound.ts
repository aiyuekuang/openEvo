/**
 * 钉钉 Outbound 发送器
 * DingTalk Outbound Adapter
 */

import type { ChannelOutboundAdapter } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  sendTextMessage,
  sendMarkdownMessage,
  sendWebhookMessage,
  replyRobotMessage,
  sendWorkMessage,
} from "./api.js";
import type { DingTalkConfig, DingTalkSendMessageOptions } from "./types.js";

export interface DingTalkChannelConfig {
  appKey?: string;
  appSecret?: string;
  webhookUrl?: string;
  signSecret?: string;
  accounts?: Record<string, {
    appKey: string;
    appSecret: string;
    webhookUrl?: string;
    signSecret?: string;
  }>;
}

function resolveDingTalkConfig(
  cfg: OpenClawConfig,
  accountId?: string | null
): DingTalkConfig | null {
  const dingtalk = cfg.channels?.dingtalk as DingTalkChannelConfig | undefined;
  if (!dingtalk) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (dingtalk.accounts?.[normalizedAccountId]) {
    const account = dingtalk.accounts[normalizedAccountId];
    return {
      appKey: account.appKey,
      appSecret: account.appSecret,
      webhookUrl: account.webhookUrl,
      signSecret: account.signSecret,
    };
  }

  // 默认配置
  if (dingtalk.appKey && dingtalk.appSecret) {
    return {
      appKey: dingtalk.appKey,
      appSecret: dingtalk.appSecret,
      webhookUrl: dingtalk.webhookUrl,
      signSecret: dingtalk.signSecret,
    };
  }

  return null;
}

/**
 * 发送消息到钉钉
 */
async function sendDingTalkMessage(
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
    throw new Error("DingTalk: 缺少配置");
  }

  const config = resolveDingTalkConfig(cfg, accountId);
  if (!config) {
    throw new Error("DingTalk: 配置不完整");
  }

  // 判断目标类型:
  // - webhook:xxx - 群机器人 Webhook
  // - session:xxx - sessionWebhook (机器人回复)
  // - user:xxx - 工作通知 (需要 agentId)
  // - 直接 userId - 默认工作通知

  if (to.startsWith("webhook:") || to.startsWith("https://oapi.dingtalk.com/robot/")) {
    // Webhook 机器人
    const webhookUrl = to.startsWith("webhook:") ? to.substring(8) : to;

    // 检查是否包含 markdown 语法
    const hasMarkdown = /[*_`#\[\]()]/.test(text);

    if (hasMarkdown) {
      // 使用 markdown 格式
      const title = text.split("\n")[0].substring(0, 20) || "消息";
      await sendMarkdownMessage(
        webhookUrl,
        title,
        mediaUrl ? `${text}\n\n![图片](${mediaUrl})` : text,
        { secret: config.signSecret }
      );
    } else {
      // 纯文本
      const content = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
      await sendTextMessage(webhookUrl, content, { secret: config.signSecret });
    }
  } else if (to.startsWith("session:")) {
    // sessionWebhook 回复
    const sessionWebhook = to.substring(8);

    const hasMarkdown = /[*_`#\[\]()]/.test(text);
    const message: DingTalkSendMessageOptions = hasMarkdown
      ? {
          msgType: "markdown",
          markdown: {
            title: text.split("\n")[0].substring(0, 20) || "回复",
            text: mediaUrl ? `${text}\n\n![图片](${mediaUrl})` : text,
          },
        }
      : {
          msgType: "text",
          text: { content: mediaUrl ? `${text}\n\n${mediaUrl}` : text },
        };

    await replyRobotMessage(sessionWebhook, message);
  } else if (config.webhookUrl) {
    // 使用配置的默认 Webhook
    const hasMarkdown = /[*_`#\[\]()]/.test(text);

    if (hasMarkdown) {
      const title = text.split("\n")[0].substring(0, 20) || "消息";
      await sendMarkdownMessage(
        config.webhookUrl,
        title,
        mediaUrl ? `${text}\n\n![图片](${mediaUrl})` : text,
        { secret: config.signSecret }
      );
    } else {
      const content = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
      await sendTextMessage(config.webhookUrl, content, { secret: config.signSecret });
    }
  } else {
    // 没有 Webhook，需要使用工作通知 API (需要 agentId)
    throw new Error("DingTalk: 需要配置 webhookUrl 或使用工作通知模式");
  }

  return {
    messageId: `dingtalk_${Date.now()}`,
    chatId: to,
  };
}

export const dingtalkOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2048,

  sendText: async ({ cfg, to, text, accountId, replyToId }) => {
    const result = await sendDingTalkMessage(to, text, { cfg, accountId, replyToId });
    return { channel: "dingtalk", ...result };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) => {
    const result = await sendDingTalkMessage(to, text, { cfg, accountId, mediaUrl, replyToId });
    return { channel: "dingtalk", ...result };
  },

  sendPayload: async ({ cfg, to, payload, accountId, replyToId }) => {
    const text = payload.text ?? "";
    const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
    const result = await sendDingTalkMessage(to, text, { cfg, accountId, mediaUrl, replyToId });
    return { channel: "dingtalk", ...result };
  },
};

export default dingtalkOutbound;
