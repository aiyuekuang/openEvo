/**
 * 企业微信回调处理
 * WeCom Callback Handler
 */

import type { WeComConfig, WeComMessage } from "./types.js";
import { verifySignature, decryptMessage, decryptEchoStr } from "./crypto.js";

/**
 * 解析 XML 消息
 */
function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

/**
 * 解析加密的消息 XML
 */
function parseEncryptedXml(xml: string): { encrypt: string; toUserName?: string } {
  const parsed = parseXml(xml);
  return {
    encrypt: parsed.Encrypt ?? "",
    toUserName: parsed.ToUserName,
  };
}

/**
 * 将解密后的消息 XML 解析为 WeComMessage
 */
function parseMessageXml(xml: string): WeComMessage {
  const parsed = parseXml(xml);
  return {
    msgId: parsed.MsgId ?? "",
    msgType: (parsed.MsgType ?? "text") as WeComMessage["msgType"],
    fromUser: parsed.FromUserName ?? "",
    toUser: parsed.ToUserName ?? "",
    createTime: parseInt(parsed.CreateTime ?? "0", 10),
    content: parsed.Content,
    picUrl: parsed.PicUrl,
    mediaId: parsed.MediaId,
    event: parsed.Event,
    eventKey: parsed.EventKey,
  };
}

export interface CallbackQuery {
  msg_signature: string;
  timestamp: string;
  nonce: string;
  echostr?: string;
}

export interface CallbackResult {
  /** 是否验证成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** URL 验证时需要返回的 echostr */
  echostr?: string;
  /** 解析后的消息 */
  message?: WeComMessage;
}

/**
 * 处理企业微信回调请求
 */
export function handleCallback(
  config: WeComConfig,
  query: CallbackQuery,
  body?: string,
): CallbackResult {
  const { msg_signature, timestamp, nonce, echostr } = query;

  // URL 验证请求 (GET)
  if (echostr) {
    if (!config.token || !config.encodingAESKey) {
      return { success: false, error: "Missing token or encodingAESKey" };
    }

    // 验证签名
    const valid = verifySignature(config.token, timestamp, nonce, echostr, msg_signature);
    if (!valid) {
      return { success: false, error: "Invalid signature" };
    }

    // 解密 echostr
    try {
      const decrypted = decryptEchoStr(config.encodingAESKey, echostr, config.corpId);
      return { success: true, echostr: decrypted };
    } catch (err) {
      return { success: false, error: `Decrypt echostr failed: ${err}` };
    }
  }

  // 消息回调请求 (POST)
  if (!body) {
    return { success: false, error: "Missing request body" };
  }

  if (!config.token || !config.encodingAESKey) {
    return { success: false, error: "Missing token or encodingAESKey" };
  }

  try {
    // 解析加密的 XML
    const { encrypt } = parseEncryptedXml(body);
    if (!encrypt) {
      return { success: false, error: "Missing Encrypt in XML" };
    }

    // 验证签名
    const valid = verifySignature(config.token, timestamp, nonce, encrypt, msg_signature);
    if (!valid) {
      return { success: false, error: "Invalid signature" };
    }

    // 解密消息
    const decrypted = decryptMessage(config.encodingAESKey, encrypt, config.corpId);

    // 解析消息
    const message = parseMessageXml(decrypted);

    return { success: true, message };
  } catch (err) {
    return { success: false, error: `Parse message failed: ${err}` };
  }
}

/**
 * 创建 Express/Hono 风格的回调处理器
 */
export function createCallbackHandler(config: WeComConfig) {
  return {
    /**
     * 处理 GET 请求 (URL 验证)
     */
    verifyUrl(query: CallbackQuery): string | null {
      const result = handleCallback(config, query);
      if (result.success && result.echostr) {
        return result.echostr;
      }
      console.error("WeCom URL verify failed:", result.error);
      return null;
    },

    /**
     * 处理 POST 请求 (消息回调)
     */
    handleMessage(query: CallbackQuery, body: string): WeComMessage | null {
      const result = handleCallback(config, query, body);
      if (result.success && result.message) {
        return result.message;
      }
      console.error("WeCom message parse failed:", result.error);
      return null;
    },
  };
}
