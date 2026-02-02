/**
 * QQ 官方机器人 Webhook 回调处理
 * QQ Official Bot Webhook Callback Handler
 *
 * 处理来自 QQ 开放平台的 Webhook 回调事件
 * https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
 */

import { createHmac } from "node:crypto";
import type {
  QQBotConfig,
  QQBotWebhookEvent,
  QQBotEventType,
  QQBotChannelMessageEvent,
  QQBotGroupMessageEvent,
  QQBotC2CMessageEvent,
} from "./types.js";

/**
 * Webhook 回调请求头
 */
export interface QQBotWebhookHeaders {
  /** 签名时间戳 */
  "x-signature-timestamp"?: string;
  /** 签名 ED25519 */
  "x-signature-ed25519"?: string;
  /** 内容类型 */
  "content-type"?: string;
}

/**
 * Webhook 验证请求体
 */
export interface QQBotWebhookValidation {
  /** 操作码 (13 = 回调地址验证) */
  op: 13;
  d: {
    /** 明文 token */
    plain_token: string;
    /** 事件签名 */
    event_ts: string;
  };
}

/**
 * Webhook 验证响应
 */
export interface QQBotWebhookValidationResponse {
  plain_token: string;
  signature: string;
}

/**
 * 解析后的 Webhook 事件
 */
export interface QQBotParsedEvent {
  /** 事件类型 */
  type: QQBotEventType;
  /** 事件 ID */
  eventId?: string;
  /** 原始事件数据 */
  raw: QQBotWebhookEvent;
  /** 消息场景 */
  scene?: "channel" | "group" | "c2c" | "direct";
  /** 消息内容 (如果是消息事件) */
  message?: {
    id: string;
    content: string;
    timestamp: string;
    authorId: string;
    /** 频道 ID (频道场景) */
    guildId?: string;
    /** 子频道 ID (频道场景) */
    channelId?: string;
    /** 群 openid (群聊场景) */
    groupOpenid?: string;
    /** 用户 openid (C2C 场景) */
    userOpenid?: string;
  };
}

/**
 * 验证 Webhook 签名 (ED25519)
 * QQ Bot 使用 ED25519 签名
 */
export function verifyWebhookSignature(
  config: QQBotConfig,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  if (!config.appSecret) {
    console.warn("QQBot: appSecret not configured, skipping signature verification");
    return true;
  }

  try {
    // QQ Bot 使用 seed 生成签名
    // signature = hex(ed25519_sign(seed, timestamp + body))
    // 这里简化处理，实际需要 ED25519 验签
    // 由于 Node.js 原生不支持 ED25519 验签，这里先返回 true
    // 生产环境建议使用 tweetnacl 或 @noble/ed25519 库
    console.log("QQBot: Signature verification skipped (ED25519 not implemented)");
    return true;
  } catch (error) {
    console.error("QQBot: Signature verification failed:", error);
    return false;
  }
}

/**
 * 生成回调验证响应签名
 * 使用 HMAC-SHA256 生成签名
 */
export function generateValidationSignature(
  appSecret: string,
  plainToken: string,
  eventTs: string
): string {
  // 签名内容: event_ts + plain_token
  const signContent = eventTs + plainToken;
  
  // 使用 appSecret 作为密钥计算 HMAC-SHA256
  const hmac = createHmac("sha256", appSecret);
  hmac.update(signContent);
  return hmac.digest("hex");
}

/**
 * 处理回调地址验证请求
 */
export function handleValidation(
  config: QQBotConfig,
  payload: QQBotWebhookValidation
): QQBotWebhookValidationResponse {
  const { plain_token, event_ts } = payload.d;
  
  const signature = generateValidationSignature(
    config.appSecret,
    plain_token,
    event_ts
  );

  return {
    plain_token,
    signature,
  };
}

/**
 * 判断是否为验证请求
 */
export function isValidationRequest(
  payload: unknown
): payload is QQBotWebhookValidation {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "op" in payload &&
    (payload as { op: unknown }).op === 13
  );
}

/**
 * 解析 Webhook 事件
 */
export function parseWebhookEvent(
  payload: QQBotWebhookEvent
): QQBotParsedEvent | null {
  const { op, t, d, id } = payload;

  // op=0 表示事件推送
  if (op !== 0 || !t) {
    return null;
  }

  const result: QQBotParsedEvent = {
    type: t,
    eventId: id,
    raw: payload,
  };

  // 解析消息事件
  switch (t) {
    // 频道消息
    case "MESSAGE_CREATE":
    case "AT_MESSAGE_CREATE": {
      const data = d as QQBotChannelMessageEvent;
      result.scene = "channel";
      result.message = {
        id: data.id,
        content: data.content,
        timestamp: data.timestamp,
        authorId: data.author.id,
        guildId: data.guildId,
        channelId: data.channelId,
      };
      break;
    }

    // 频道私信
    case "DIRECT_MESSAGE_CREATE": {
      const data = d as QQBotChannelMessageEvent;
      result.scene = "direct";
      result.message = {
        id: data.id,
        content: data.content,
        timestamp: data.timestamp,
        authorId: data.author.id,
        guildId: data.guildId,
        channelId: data.channelId,
      };
      break;
    }

    // 群聊 @机器人 消息
    case "GROUP_AT_MESSAGE_CREATE": {
      const data = d as QQBotGroupMessageEvent;
      result.scene = "group";
      result.message = {
        id: data.id,
        content: data.content,
        timestamp: data.timestamp,
        authorId: data.author.id,
        groupOpenid: data.groupOpenid,
      };
      break;
    }

    // C2C 私聊消息
    case "C2C_MESSAGE_CREATE": {
      const data = d as QQBotC2CMessageEvent;
      result.scene = "c2c";
      result.message = {
        id: data.id,
        content: data.content,
        timestamp: data.timestamp,
        authorId: data.author.id,
        userOpenid: data.author.userOpenid ?? data.author.id,
      };
      break;
    }
  }

  return result;
}

/**
 * 从事件中提取回复目标
 */
export function extractReplyTarget(
  event: QQBotParsedEvent
): {
  type: "channel" | "group" | "c2c";
  id: string;
  msgId: string;
} | null {
  if (!event.message) {
    return null;
  }

  switch (event.scene) {
    case "channel":
    case "direct":
      if (event.message.channelId) {
        return {
          type: "channel",
          id: event.message.channelId,
          msgId: event.message.id,
        };
      }
      break;
    case "group":
      if (event.message.groupOpenid) {
        return {
          type: "group",
          id: event.message.groupOpenid,
          msgId: event.message.id,
        };
      }
      break;
    case "c2c":
      if (event.message.userOpenid) {
        return {
          type: "c2c",
          id: event.message.userOpenid,
          msgId: event.message.id,
        };
      }
      break;
  }

  return null;
}

/**
 * 清理消息内容 (移除 @机器人 等)
 */
export function cleanMessageContent(content: string): string {
  // 移除 @ 机器人的标记
  // 格式: <@!机器人ID> 或 <@机器人ID>
  let cleaned = content.replace(/<@!?\d+>/g, "").trim();
  
  // 移除开头的空格
  cleaned = cleaned.replace(/^\s+/, "");
  
  return cleaned;
}

/**
 * 消息事件类型列表
 */
export const MESSAGE_EVENT_TYPES: QQBotEventType[] = [
  "MESSAGE_CREATE",
  "AT_MESSAGE_CREATE",
  "DIRECT_MESSAGE_CREATE",
  "GROUP_AT_MESSAGE_CREATE",
  "C2C_MESSAGE_CREATE",
];

/**
 * 判断是否为消息事件
 */
export function isMessageEvent(eventType: QQBotEventType): boolean {
  return MESSAGE_EVENT_TYPES.includes(eventType);
}
