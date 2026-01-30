/**
 * 钉钉回调处理
 * DingTalk Callback Handler
 */

import type {
  DingTalkConfig,
  DingTalkMessage,
  DingTalkRobotCallback,
} from "./types.js";
import {
  decryptMessage,
  encryptMessage,
  generateSignature,
  verifySignature,
  verifyRobotSignature,
} from "./crypto.js";

/**
 * 回调请求参数
 */
export interface CallbackQuery {
  signature?: string;
  timestamp?: string;
  nonce?: string;
  encrypt?: string;
}

/**
 * 处理回调 URL 验证请求
 * 用于钉钉后台配置回调地址时的验证
 */
export function handleCallbackVerify(
  config: DingTalkConfig,
  query: CallbackQuery
): { success: boolean; response?: string; error?: string } {
  const { signature, timestamp, nonce, encrypt } = query;

  if (!signature || !timestamp || !nonce || !encrypt) {
    return { success: false, error: "缺少必要参数" };
  }

  if (!config.token || !config.aesKey) {
    return { success: false, error: "未配置 Token 或 AES Key" };
  }

  // 验证签名
  if (!verifySignature(config.token, timestamp, nonce, encrypt, signature)) {
    return { success: false, error: "签名验证失败" };
  }

  // 解密消息
  const { message } = decryptMessage(encrypt, config.aesKey);

  // 加密返回内容
  const responseEncrypt = encryptMessage(
    message,
    config.appKey,
    config.aesKey
  );
  const responseTimestamp = String(Date.now());
  const responseNonce = Math.random().toString(36).substring(2, 15);
  const responseSignature = generateSignature(
    config.token,
    responseTimestamp,
    responseNonce,
    responseEncrypt
  );

  const response = JSON.stringify({
    msg_signature: responseSignature,
    timeStamp: responseTimestamp,
    nonce: responseNonce,
    encrypt: responseEncrypt,
  });

  return { success: true, response };
}

/**
 * 处理事件回调
 */
export function handleEventCallback(
  config: DingTalkConfig,
  query: CallbackQuery,
  body: { encrypt: string }
): {
  success: boolean;
  event?: unknown;
  response?: string;
  error?: string;
} {
  const { signature, timestamp, nonce } = query;
  const { encrypt } = body;

  if (!signature || !timestamp || !nonce || !encrypt) {
    return { success: false, error: "缺少必要参数" };
  }

  if (!config.token || !config.aesKey) {
    return { success: false, error: "未配置 Token 或 AES Key" };
  }

  // 验证签名
  if (!verifySignature(config.token, timestamp, nonce, encrypt, signature)) {
    return { success: false, error: "签名验证失败" };
  }

  // 解密消息
  const { message } = decryptMessage(encrypt, config.aesKey);
  const event = JSON.parse(message);

  // 生成响应 (返回 "success" 加密后的结果)
  const responseEncrypt = encryptMessage("success", config.appKey, config.aesKey);
  const responseTimestamp = String(Date.now());
  const responseNonce = Math.random().toString(36).substring(2, 15);
  const responseSignature = generateSignature(
    config.token,
    responseTimestamp,
    responseNonce,
    responseEncrypt
  );

  const response = JSON.stringify({
    msg_signature: responseSignature,
    timeStamp: responseTimestamp,
    nonce: responseNonce,
    encrypt: responseEncrypt,
  });

  return { success: true, event, response };
}

/**
 * 处理机器人回调消息
 * 机器人消息不需要加密，但需要验证签名
 */
export function handleRobotCallback(
  config: DingTalkConfig,
  headers: Record<string, string | undefined>,
  body: DingTalkRobotCallback
): {
  success: boolean;
  message?: DingTalkMessage;
  sessionWebhook?: string;
  error?: string;
} {
  const timestamp = headers["timestamp"] || headers["x-dingtalk-timestamp"];
  const sign = headers["sign"] || headers["x-dingtalk-sign"];

  // 如果配置了签名密钥，验证签名
  if (config.signSecret) {
    if (!timestamp || !sign) {
      return { success: false, error: "缺少签名参数" };
    }

    if (!verifyRobotSignature(timestamp, sign, config.signSecret)) {
      return { success: false, error: "签名验证失败" };
    }
  }

  // 解析消息
  const message: DingTalkMessage = {
    msgId: body.msgId,
    msgType: body.msgtype as DingTalkMessage["msgType"],
    senderId: body.senderId,
    senderNick: body.senderNick,
    conversationId: body.conversationId,
    conversationType: body.conversationType,
    content: body.text?.content,
    createAt: body.createAt,
    atUsers: body.at?.atUserIds,
    isAtAll: body.at?.isAtAll,
    robotCode: body.chatbotUserId,
  };

  return {
    success: true,
    message,
    sessionWebhook: body.sessionWebhook,
  };
}

/**
 * 创建成功响应
 */
export function createSuccessResponse(): { msgtype: string; text: { content: string } } {
  return {
    msgtype: "text",
    text: {
      content: "",
    },
  };
}
