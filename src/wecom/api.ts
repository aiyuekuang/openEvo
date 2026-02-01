/**
 * 企业微信 API 客户端
 * WeCom API Client
 */

import type {
  WeComConfig,
  WeComAccessToken,
  WeComApiResponse,
  WeComSendMessageOptions,
  WeComUser,
} from "./types.js";

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

/** Access Token 缓存 */
const tokenCache = new Map<string, WeComAccessToken>();

/**
 * 获取 Access Token
 */
export async function getAccessToken(config: WeComConfig): Promise<string> {
  const cacheKey = `${config.corpId}:${config.agentId}`;
  const cached = tokenCache.get(cacheKey);

  // 如果缓存有效（提前5分钟过期）
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const url = `${WECOM_API_BASE}/gettoken?corpid=${config.corpId}&corpsecret=${config.secret}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`WeCom getAccessToken failed: ${data.errmsg} (${data.errcode})`);
  }

  const token: WeComAccessToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  tokenCache.set(cacheKey, token);
  return token.accessToken;
}

/**
 * 发送应用消息
 */
export async function sendMessage(
  config: WeComConfig,
  options: WeComSendMessageOptions,
): Promise<WeComApiResponse> {
  const accessToken = await getAccessToken(config);
  const url = `${WECOM_API_BASE}/message/send?access_token=${accessToken}`;

  const body: Record<string, unknown> = {
    agentid: options.agentId,
    safe: options.safe ?? 0,
    enable_id_trans: options.enableIdTrans ?? 0,
    enable_duplicate_check: options.enableDuplicateCheck ?? 0,
    duplicate_check_interval: options.duplicateCheckInterval ?? 1800,
  };

  if (options.toUser) body.touser = options.toUser;
  if (options.toParty) body.toparty = options.toParty;
  if (options.toTag) body.totag = options.toTag;

  // 根据消息类型设置内容
  body.msgtype = options.msgType;
  switch (options.msgType) {
    case "text":
      body.text = { content: options.content };
      break;
    case "markdown":
      body.markdown = { content: options.content };
      break;
    case "image":
      body.image = { media_id: options.content };
      break;
    case "voice":
      body.voice = { media_id: options.content };
      break;
    case "video":
      body.video = { media_id: options.content };
      break;
    case "file":
      body.file = { media_id: options.content };
      break;
    case "textcard":
      // textcard 需要完整对象，content 应为 JSON 字符串
      body.textcard = options.content ? JSON.parse(options.content) : {};
      break;
    case "news":
      // news 需要 articles 数组，content 应为 JSON 字符串
      body.news = options.content ? JSON.parse(options.content) : { articles: [] };
      break;
    default:
      body.text = { content: options.content };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as WeComApiResponse;

  if (data.errcode !== 0) {
    throw new Error(`WeCom sendMessage failed: ${data.errmsg} (${data.errcode})`);
  }

  return data;
}

/**
 * 发送文本消息（快捷方法）
 */
export async function sendTextMessage(
  config: WeComConfig,
  toUser: string,
  content: string,
): Promise<WeComApiResponse> {
  return sendMessage(config, {
    toUser,
    agentId: config.agentId,
    msgType: "text",
    content,
  });
}

/**
 * 发送 Markdown 消息（快捷方法）
 */
export async function sendMarkdownMessage(
  config: WeComConfig,
  toUser: string,
  content: string,
): Promise<WeComApiResponse> {
  return sendMessage(config, {
    toUser,
    agentId: config.agentId,
    msgType: "markdown",
    content,
  });
}

/**
 * 通过群聊机器人 Webhook 发送消息
 * 用于企业微信群机器人
 */
export async function sendWebhookMessage(
  webhookUrl: string,
  msgType: "text" | "markdown" | "image" | "news" | "file",
  content: string | { base64: string; md5: string } | { articles: Array<{ title: string; description?: string; url: string; picurl?: string }> },
  options?: {
    mentionedList?: string[];
    mentionedMobileList?: string[];
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    msgtype: msgType,
  };

  switch (msgType) {
    case "text":
      body.text = {
        content,
        mentioned_list: options?.mentionedList,
        mentioned_mobile_list: options?.mentionedMobileList,
      };
      break;
    case "markdown":
      body.markdown = { content };
      break;
    case "image":
      body.image = content;
      break;
    case "news":
      body.news = content;
      break;
    case "file":
      body.file = { media_id: content };
      break;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as WeComApiResponse;

  if (data.errcode !== 0) {
    throw new Error(`WeCom webhook sendMessage failed: ${data.errmsg} (${data.errcode})`);
  }
}

/**
 * 通过群聊 Webhook 发送文本消息
 */
export async function sendWebhookTextMessage(
  webhookUrl: string,
  content: string,
  options?: {
    mentionedList?: string[];
    mentionedMobileList?: string[];
  },
): Promise<void> {
  return sendWebhookMessage(webhookUrl, "text", content, options);
}

/**
 * 通过群聊 Webhook 发送 Markdown 消息
 */
export async function sendWebhookMarkdownMessage(
  webhookUrl: string,
  content: string,
): Promise<void> {
  return sendWebhookMessage(webhookUrl, "markdown", content);
}

/**
 * 获取用户信息
 */
export async function getUserInfo(
  config: WeComConfig,
  userId: string,
): Promise<WeComUser | null> {
  const accessToken = await getAccessToken(config);
  const url = `${WECOM_API_BASE}/user/get?access_token=${accessToken}&userid=${userId}`;

  const response = await fetch(url);
  const data = (await response.json()) as WeComApiResponse<WeComUser> & {
    userid?: string;
    name?: string;
    department?: number[];
    mobile?: string;
    email?: string;
    avatar?: string;
  };

  if (data.errcode !== 0) {
    console.error(`WeCom getUserInfo failed: ${data.errmsg} (${data.errcode})`);
    return null;
  }

  return {
    userId: data.userid ?? userId,
    name: data.name,
    department: data.department,
    mobile: data.mobile,
    email: data.email,
    avatar: data.avatar,
  };
}

/**
 * 上传临时素材
 */
export async function uploadMedia(
  config: WeComConfig,
  type: "image" | "voice" | "video" | "file",
  file: Buffer | Blob,
  filename: string,
): Promise<string> {
  const accessToken = await getAccessToken(config);
  const url = `${WECOM_API_BASE}/media/upload?access_token=${accessToken}&type=${type}`;

  const formData = new FormData();
  const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
  formData.append("media", blob, filename);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const data = (await response.json()) as WeComApiResponse & { media_id?: string };

  if (data.errcode !== 0 || !data.media_id) {
    throw new Error(`WeCom uploadMedia failed: ${data.errmsg} (${data.errcode})`);
  }

  return data.media_id;
}
