/**
 * 飞书回调处理
 * Feishu Callback Handler
 */

import type {
  FeishuConfig,
  FeishuMessage,
  FeishuEventCallback,
} from "./types.js";
import { decryptMessage, verifySignature } from "./crypto.js";

/**
 * 处理 URL 验证请求
 * 飞书配置事件订阅时会发送 challenge 请求
 */
export function handleUrlVerification(
  config: FeishuConfig,
  body: FeishuEventCallback
): { success: boolean; response?: { challenge: string }; error?: string } {
  // URL 验证请求
  if (body.type === "url_verification") {
    // 验证 token
    if (config.verificationToken && body.token !== config.verificationToken) {
      return { success: false, error: "Token 验证失败" };
    }

    return {
      success: true,
      response: { challenge: body.challenge! },
    };
  }

  return { success: false, error: "不是 URL 验证请求" };
}

/**
 * 解密事件消息 (如果启用了加密)
 */
export function decryptEventBody(
  config: FeishuConfig,
  body: FeishuEventCallback
): FeishuEventCallback {
  // 如果消息被加密
  if (body.encrypt && config.encryptKey) {
    const decrypted = decryptMessage(body.encrypt, config.encryptKey);
    return JSON.parse(decrypted) as FeishuEventCallback;
  }

  return body;
}

/**
 * 验证事件请求签名
 */
export function verifyEventSignature(
  config: FeishuConfig,
  headers: Record<string, string | undefined>,
  rawBody: string
): boolean {
  if (!config.encryptKey) {
    return true; // 未配置加密密钥，跳过验证
  }

  const timestamp = headers["x-lark-request-timestamp"];
  const nonce = headers["x-lark-request-nonce"];
  const signature = headers["x-lark-signature"];

  if (!timestamp || !nonce || !signature) {
    return false;
  }

  return verifySignature(timestamp, nonce, signature, config.encryptKey, rawBody);
}

/**
 * 处理消息事件
 */
export function handleMessageEvent(
  config: FeishuConfig,
  body: FeishuEventCallback
): {
  success: boolean;
  message?: FeishuMessage;
  error?: string;
} {
  // 验证 token (v1.0 事件格式)
  if (body.token && config.verificationToken) {
    if (body.token !== config.verificationToken) {
      return { success: false, error: "Token 验证失败" };
    }
  }

  // 验证 header token (v2.0 事件格式)
  if (body.header?.token && config.verificationToken) {
    if (body.header.token !== config.verificationToken) {
      return { success: false, error: "Token 验证失败" };
    }
  }

  // 检查事件类型
  const eventType = body.header?.event_type;
  if (eventType !== "im.message.receive_v1") {
    return { success: false, error: `不支持的事件类型: ${eventType}` };
  }

  const event = body.event;
  if (!event?.message) {
    return { success: false, error: "缺少消息数据" };
  }

  const msg = event.message;
  const sender = event.sender;

  // 构造消息对象
  const message: FeishuMessage = {
    messageId: msg.message_id,
    messageType: msg.message_type as FeishuMessage["messageType"],
    senderId: sender?.sender_id.open_id || "",
    senderType: sender?.sender_type as FeishuMessage["senderType"],
    chatId: msg.chat_id,
    chatType: msg.chat_type as FeishuMessage["chatType"],
    content: msg.content,
    createTime: parseInt(msg.create_time, 10),
    mentions: msg.mentions?.map((m) => ({
      id: m.id,
      name: m.name,
      key: m.key,
    })),
    rootId: msg.root_id,
    parentId: msg.parent_id,
  };

  return { success: true, message };
}

/**
 * 处理事件回调 (完整流程)
 */
export function handleEventCallback(
  config: FeishuConfig,
  headers: Record<string, string | undefined>,
  rawBody: string
): {
  success: boolean;
  isUrlVerification?: boolean;
  challenge?: string;
  message?: FeishuMessage;
  eventType?: string;
  error?: string;
} {
  // 解析 body
  let body: FeishuEventCallback;
  try {
    body = JSON.parse(rawBody) as FeishuEventCallback;
  } catch {
    return { success: false, error: "无效的 JSON" };
  }

  // 如果消息被加密，先解密
  if (body.encrypt) {
    if (!config.encryptKey) {
      return { success: false, error: "消息已加密但未配置 Encrypt Key" };
    }
    body = decryptEventBody(config, body);
  }

  // URL 验证
  if (body.type === "url_verification") {
    const result = handleUrlVerification(config, body);
    if (result.success) {
      return {
        success: true,
        isUrlVerification: true,
        challenge: result.response!.challenge,
      };
    }
    return { success: false, error: result.error };
  }

  // 验证签名 (仅当配置了 encryptKey)
  if (config.encryptKey) {
    if (!verifyEventSignature(config, headers, rawBody)) {
      return { success: false, error: "签名验证失败" };
    }
  }

  // 处理消息事件
  const eventType = body.header?.event_type;
  if (eventType === "im.message.receive_v1") {
    const result = handleMessageEvent(config, body);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        eventType,
      };
    }
    return { success: false, error: result.error };
  }

  // 其他事件类型，返回事件类型让调用方处理
  return {
    success: true,
    eventType,
  };
}

/**
 * 提取文本消息内容
 */
export function extractTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text || "";
  } catch {
    return content;
  }
}

/**
 * 检查消息是否@了机器人
 */
export function isMentionedBot(
  message: FeishuMessage,
  botOpenId: string
): boolean {
  if (!message.mentions) {
    return false;
  }

  return message.mentions.some(
    (m) => m.id.open_id === botOpenId || m.id.user_id === botOpenId
  );
}
