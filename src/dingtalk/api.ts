/**
 * 钉钉 API 客户端
 * DingTalk API Client
 */

import crypto from "crypto";
import type {
  DingTalkConfig,
  DingTalkAccessToken,
  DingTalkApiResponse,
  DingTalkUser,
  DingTalkSendMessageOptions,
} from "./types.js";

const API_BASE = "https://oapi.dingtalk.com";
const API_NEW_BASE = "https://api.dingtalk.com";

/** Token 缓存 */
let tokenCache: DingTalkAccessToken | null = null;

/**
 * 获取 Access Token
 */
export async function getAccessToken(config: DingTalkConfig): Promise<string> {
  const now = Date.now();

  // 检查缓存，提前5分钟刷新
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  const url = `${API_BASE}/gettoken?appkey=${config.appKey}&appsecret=${config.appSecret}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0) {
    throw new Error(`获取 Access Token 失败: ${data.errmsg}`);
  }

  tokenCache = {
    accessToken: data.access_token!,
    expiresAt: now + (data.expires_in || 7200) * 1000,
  };

  return tokenCache.accessToken;
}

/**
 * 生成签名 (用于 Webhook)
 */
export function generateSign(
  timestamp: number,
  secret: string
): { timestamp: string; sign: string } {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac("sha256", secret);
  const sign = hmac.update(stringToSign).digest("base64");

  return {
    timestamp: String(timestamp),
    sign: encodeURIComponent(sign),
  };
}

/**
 * 通过 Webhook 发送消息到群
 */
export async function sendWebhookMessage(
  webhookUrl: string,
  message: DingTalkSendMessageOptions,
  secret?: string
): Promise<void> {
  let url = webhookUrl;

  // 如果有签名密钥，添加签名
  if (secret) {
    const timestamp = Date.now();
    const { sign } = generateSign(timestamp, secret);
    url = `${webhookUrl}&timestamp=${timestamp}&sign=${sign}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const data = (await response.json()) as DingTalkApiResponse;

  if (data.errcode !== 0) {
    throw new Error(`发送 Webhook 消息失败: ${data.errmsg}`);
  }
}

/**
 * 发送文本消息到群 (Webhook)
 */
export async function sendTextMessage(
  webhookUrl: string,
  content: string,
  options?: {
    secret?: string;
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  }
): Promise<void> {
  const message: DingTalkSendMessageOptions = {
    msgType: "text",
    text: { content },
    at: {
      atMobiles: options?.atMobiles,
      atUserIds: options?.atUserIds,
      isAtAll: options?.isAtAll,
    },
  };

  await sendWebhookMessage(webhookUrl, message, options?.secret);
}

/**
 * 发送 Markdown 消息到群 (Webhook)
 */
export async function sendMarkdownMessage(
  webhookUrl: string,
  title: string,
  text: string,
  options?: {
    secret?: string;
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  }
): Promise<void> {
  const message: DingTalkSendMessageOptions = {
    msgType: "markdown",
    markdown: { title, text },
    at: {
      atMobiles: options?.atMobiles,
      atUserIds: options?.atUserIds,
      isAtAll: options?.isAtAll,
    },
  };

  await sendWebhookMessage(webhookUrl, message, options?.secret);
}

/**
 * 回复机器人消息 (使用 sessionWebhook)
 */
export async function replyRobotMessage(
  sessionWebhook: string,
  message: DingTalkSendMessageOptions
): Promise<void> {
  const response = await fetch(sessionWebhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const data = (await response.json()) as DingTalkApiResponse;

  if (data.errcode !== 0) {
    throw new Error(`回复机器人消息失败: ${data.errmsg}`);
  }
}

/**
 * 获取用户信息
 */
export async function getUserInfo(
  config: DingTalkConfig,
  userId: string
): Promise<DingTalkUser | null> {
  const accessToken = await getAccessToken(config);
  const url = `${API_BASE}/topapi/v2/user/get?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userid: userId }),
  });

  const data = (await response.json()) as DingTalkApiResponse<{
    userid: string;
    name: string;
    avatar: string;
    mobile: string;
    email: string;
  }>;

  if (data.errcode !== 0) {
    console.error(`获取用户信息失败: ${data.errmsg}`);
    return null;
  }

  const result = data.result!;
  return {
    userId: result.userid,
    nick: result.name,
    avatarUrl: result.avatar,
    mobile: result.mobile,
    email: result.email,
  };
}

/**
 * 通过手机号获取用户ID
 */
export async function getUserIdByMobile(
  config: DingTalkConfig,
  mobile: string
): Promise<string | null> {
  const accessToken = await getAccessToken(config);
  const url = `${API_BASE}/topapi/v2/user/getbymobile?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mobile }),
  });

  const data = (await response.json()) as DingTalkApiResponse<{
    userid: string;
  }>;

  if (data.errcode !== 0) {
    console.error(`通过手机号获取用户ID失败: ${data.errmsg}`);
    return null;
  }

  return data.result?.userid || null;
}

/**
 * 发送工作通知消息 (单聊)
 */
export async function sendWorkMessage(
  config: DingTalkConfig,
  agentId: string,
  userIds: string[],
  message: DingTalkSendMessageOptions
): Promise<void> {
  const accessToken = await getAccessToken(config);
  const url = `${API_BASE}/topapi/message/corpconversation/asyncsend_v2?access_token=${accessToken}`;

  const msgContent: Record<string, unknown> = {};

  switch (message.msgType) {
    case "text":
      msgContent.msgtype = "text";
      msgContent.text = message.text;
      break;
    case "markdown":
      msgContent.msgtype = "markdown";
      msgContent.markdown = message.markdown;
      break;
    case "link":
      msgContent.msgtype = "link";
      msgContent.link = message.link;
      break;
    default:
      throw new Error(`不支持的消息类型: ${message.msgType}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      userid_list: userIds.join(","),
      msg: msgContent,
    }),
  });

  const data = (await response.json()) as DingTalkApiResponse<{
    task_id: number;
  }>;

  if (data.errcode !== 0) {
    throw new Error(`发送工作通知失败: ${data.errmsg}`);
  }
}

/**
 * 上传媒体文件
 */
export async function uploadMedia(
  config: DingTalkConfig,
  type: "image" | "voice" | "video" | "file",
  file: Buffer,
  filename: string
): Promise<string> {
  const accessToken = await getAccessToken(config);
  const url = `${API_BASE}/media/upload?access_token=${accessToken}&type=${type}`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(file)]);
  formData.append("media", blob, filename);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    media_id?: string;
  };

  if (data.errcode !== 0) {
    throw new Error(`上传媒体文件失败: ${data.errmsg}`);
  }

  return data.media_id!;
}

/**
 * 清除 Token 缓存
 */
export function clearTokenCache(): void {
  tokenCache = null;
}
