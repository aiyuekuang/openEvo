/**
 * 飞书 API 客户端
 * Feishu (Lark) API Client
 */

import type {
  FeishuConfig,
  FeishuAccessToken,
  FeishuApiResponse,
  FeishuUser,
  FeishuMessageType,
  FeishuTextContent,
  FeishuPostContent,
  FeishuInteractiveContent,
} from "./types.js";

const API_BASE = "https://open.feishu.cn/open-apis";

/** Token 缓存 */
let tokenCache: FeishuAccessToken | null = null;

/**
 * 获取 Tenant Access Token
 */
export async function getTenantAccessToken(
  config: FeishuConfig
): Promise<string> {
  const now = Date.now();

  // 检查缓存，提前5分钟刷新
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.tenantAccessToken;
  }

  const url = `${API_BASE}/auth/v3/tenant_access_token/internal`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  const data = (await response.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (data.code !== 0) {
    throw new Error(`获取 Tenant Access Token 失败: ${data.msg}`);
  }

  tokenCache = {
    tenantAccessToken: data.tenant_access_token!,
    expiresAt: now + (data.expire || 7200) * 1000,
  };

  return tokenCache.tenantAccessToken;
}

/**
 * 发送消息
 */
export async function sendMessage(
  config: FeishuConfig,
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id",
  receiveId: string,
  msgType: FeishuMessageType,
  content: string
): Promise<string> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: msgType,
      content,
    }),
  });

  const data = (await response.json()) as FeishuApiResponse<{
    message_id: string;
  }>;

  if (data.code !== 0) {
    throw new Error(`发送消息失败: ${data.msg}`);
  }

  return data.data!.message_id;
}

/**
 * 发送文本消息
 */
export async function sendTextMessage(
  config: FeishuConfig,
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id",
  receiveId: string,
  text: string
): Promise<string> {
  const content: FeishuTextContent = { text };
  return sendMessage(
    config,
    receiveIdType,
    receiveId,
    "text",
    JSON.stringify(content)
  );
}

/**
 * 发送富文本消息
 */
export async function sendPostMessage(
  config: FeishuConfig,
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id",
  receiveId: string,
  post: FeishuPostContent
): Promise<string> {
  return sendMessage(
    config,
    receiveIdType,
    receiveId,
    "post",
    JSON.stringify(post)
  );
}

/**
 * 发送交互卡片消息
 */
export async function sendInteractiveMessage(
  config: FeishuConfig,
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id",
  receiveId: string,
  card: FeishuInteractiveContent
): Promise<string> {
  return sendMessage(
    config,
    receiveIdType,
    receiveId,
    "interactive",
    JSON.stringify(card)
  );
}

/**
 * 回复消息
 */
export async function replyMessage(
  config: FeishuConfig,
  messageId: string,
  msgType: FeishuMessageType,
  content: string
): Promise<string> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/im/v1/messages/${messageId}/reply`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      msg_type: msgType,
      content,
    }),
  });

  const data = (await response.json()) as FeishuApiResponse<{
    message_id: string;
  }>;

  if (data.code !== 0) {
    throw new Error(`回复消息失败: ${data.msg}`);
  }

  return data.data!.message_id;
}

/**
 * 回复文本消息
 */
export async function replyTextMessage(
  config: FeishuConfig,
  messageId: string,
  text: string
): Promise<string> {
  const content: FeishuTextContent = { text };
  return replyMessage(config, messageId, "text", JSON.stringify(content));
}

/**
 * 获取用户信息
 */
export async function getUserInfo(
  config: FeishuConfig,
  userIdType: "open_id" | "user_id" | "union_id",
  userId: string
): Promise<FeishuUser | null> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/contact/v3/users/${userId}?user_id_type=${userIdType}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json()) as FeishuApiResponse<{
    user: {
      open_id: string;
      user_id?: string;
      union_id?: string;
      name: string;
      avatar?: {
        avatar_origin?: string;
      };
      email?: string;
      mobile?: string;
    };
  }>;

  if (data.code !== 0) {
    console.error(`获取用户信息失败: ${data.msg}`);
    return null;
  }

  const user = data.data!.user;
  return {
    openId: user.open_id,
    userId: user.user_id,
    unionId: user.union_id,
    name: user.name,
    avatarUrl: user.avatar?.avatar_origin,
    email: user.email,
    mobile: user.mobile,
  };
}

/**
 * 上传图片
 */
export async function uploadImage(
  config: FeishuConfig,
  imageType: "message" | "avatar",
  image: Buffer,
  filename: string
): Promise<string> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/im/v1/images`;

  const formData = new FormData();
  formData.append("image_type", imageType);
  const blob = new Blob([new Uint8Array(image)]);
  formData.append("image", blob, filename);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = (await response.json()) as FeishuApiResponse<{
    image_key: string;
  }>;

  if (data.code !== 0) {
    throw new Error(`上传图片失败: ${data.msg}`);
  }

  return data.data!.image_key;
}

/**
 * 上传文件
 */
export async function uploadFile(
  config: FeishuConfig,
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream",
  file: Buffer,
  filename: string
): Promise<string> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/im/v1/files`;

  const formData = new FormData();
  formData.append("file_type", fileType);
  formData.append("file_name", filename);
  const blob = new Blob([new Uint8Array(file)]);
  formData.append("file", blob, filename);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = (await response.json()) as FeishuApiResponse<{
    file_key: string;
  }>;

  if (data.code !== 0) {
    throw new Error(`上传文件失败: ${data.msg}`);
  }

  return data.data!.file_key;
}

/**
 * 获取消息内容
 */
export async function getMessage(
  config: FeishuConfig,
  messageId: string
): Promise<{
  messageId: string;
  msgType: string;
  content: string;
  createTime: string;
}> {
  const accessToken = await getTenantAccessToken(config);
  const url = `${API_BASE}/im/v1/messages/${messageId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json()) as FeishuApiResponse<{
    items: Array<{
      message_id: string;
      msg_type: string;
      body: {
        content: string;
      };
      create_time: string;
    }>;
  }>;

  if (data.code !== 0) {
    throw new Error(`获取消息失败: ${data.msg}`);
  }

  const item = data.data!.items[0];
  return {
    messageId: item.message_id,
    msgType: item.msg_type,
    content: item.body.content,
    createTime: item.create_time,
  };
}

/**
 * 清除 Token 缓存
 */
export function clearTokenCache(): void {
  tokenCache = null;
}
