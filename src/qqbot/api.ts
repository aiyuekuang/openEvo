/**
 * QQ 官方机器人 API 客户端
 * QQ Official Bot API Client
 *
 * 基于 QQ 开放平台官方 API
 * https://bot.q.qq.com/wiki/develop/api/
 */

import type {
  QQBotConfig,
  QQBotAccessToken,
  QQBotSendChannelMessageOptions,
  QQBotSendGroupMessageOptions,
  QQBotSendC2CMessageOptions,
  QQBotSendMessageResponse,
  QQBotUploadMediaResponse,
  QQBotGuild,
  QQBotChannel,
  QQBotUser,
} from "./types.js";
import { QQBOT_API_BASE, QQBOT_SANDBOX_API_BASE } from "./types.js";

/** Access Token 缓存 */
const tokenCache = new Map<string, QQBotAccessToken>();

/**
 * 获取 API 基础 URL
 */
function getApiBase(config: QQBotConfig): string {
  return config.sandbox ? QQBOT_SANDBOX_API_BASE : QQBOT_API_BASE;
}

/**
 * 获取 Access Token
 * QQ 官方机器人使用 AppID + AppSecret 获取 Token
 */
export async function getAccessToken(config: QQBotConfig): Promise<string> {
  const cacheKey = `qqbot:${config.appId}`;
  const cached = tokenCache.get(cacheKey);

  // 如果缓存有效（提前5分钟过期）
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const url = `https://bots.qq.com/app/getAppAccessToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appId: config.appId,
      clientSecret: config.appSecret,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    code?: number;
    message?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `QQBot getAccessToken failed: ${data.message ?? "Unknown error"} (${data.code ?? "no code"})`
    );
  }

  const token: QQBotAccessToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  tokenCache.set(cacheKey, token);
  return token.accessToken;
}

/**
 * 调用 API
 */
async function callApi<T = unknown>(
  config: QQBotConfig,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const accessToken = await getAccessToken(config);
  const apiBase = getApiBase(config);
  const url = `${apiBase}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `QQBot ${accessToken}`,
    "Content-Type": "application/json",
    "X-Union-Appid": config.appId,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // QQ Bot API 可能返回空响应
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  const data = JSON.parse(text) as T & { code?: number; message?: string };

  if (!response.ok) {
    throw new Error(
      `QQBot API error: ${data.message ?? response.statusText} (${data.code ?? response.status})`
    );
  }

  return data;
}

// ==================== 频道消息 API ====================

/**
 * 发送频道消息
 */
export async function sendChannelMessage(
  config: QQBotConfig,
  options: QQBotSendChannelMessageOptions
): Promise<QQBotSendMessageResponse> {
  const body: Record<string, unknown> = {};

  if (options.content) body.content = options.content;
  if (options.image) body.image = options.image;
  if (options.msgId) body.msg_id = options.msgId;
  if (options.eventId) body.event_id = options.eventId;
  if (options.markdown) body.markdown = options.markdown;
  if (options.ark) body.ark = options.ark;
  if (options.embed) body.embed = options.embed;

  const result = await callApi<{ id: string; timestamp: string }>(
    config,
    "POST",
    `/channels/${options.channelId}/messages`,
    body
  );

  return {
    id: result.id,
    timestamp: result.timestamp,
  };
}

/**
 * 发送频道私信
 */
export async function sendDirectMessage(
  config: QQBotConfig,
  guildId: string,
  options: Omit<QQBotSendChannelMessageOptions, "channelId">
): Promise<QQBotSendMessageResponse> {
  // 先创建私信会话
  const session = await callApi<{ guild_id: string; channel_id: string }>(
    config,
    "POST",
    `/users/@me/dms`,
    { recipient_id: guildId, source_guild_id: guildId }
  );

  // 发送私信
  return sendChannelMessage(config, {
    ...options,
    channelId: session.channel_id,
  });
}

// ==================== 群聊消息 API ====================

/**
 * 发送群聊消息
 */
export async function sendGroupMessage(
  config: QQBotConfig,
  options: QQBotSendGroupMessageOptions
): Promise<QQBotSendMessageResponse> {
  const body: Record<string, unknown> = {
    msg_type: options.msgType,
  };

  if (options.content) body.content = options.content;
  if (options.msgId) body.msg_id = options.msgId;
  if (options.eventId) body.event_id = options.eventId;
  if (options.markdown) body.markdown = options.markdown;
  if (options.ark) body.ark = options.ark;
  if (options.media) body.media = options.media;
  if (options.msgSeq !== undefined) body.msg_seq = options.msgSeq;

  const result = await callApi<{ id: string; timestamp: string }>(
    config,
    "POST",
    `/v2/groups/${options.groupOpenid}/messages`,
    body
  );

  return {
    id: result.id,
    timestamp: result.timestamp,
  };
}

// ==================== C2C 私聊消息 API ====================

/**
 * 发送 C2C 私聊消息
 */
export async function sendC2CMessage(
  config: QQBotConfig,
  options: QQBotSendC2CMessageOptions
): Promise<QQBotSendMessageResponse> {
  const body: Record<string, unknown> = {
    msg_type: options.msgType,
  };

  if (options.content) body.content = options.content;
  if (options.msgId) body.msg_id = options.msgId;
  if (options.eventId) body.event_id = options.eventId;
  if (options.markdown) body.markdown = options.markdown;
  if (options.media) body.media = options.media;
  if (options.msgSeq !== undefined) body.msg_seq = options.msgSeq;

  const result = await callApi<{ id: string; timestamp: string }>(
    config,
    "POST",
    `/v2/users/${options.openid}/messages`,
    body
  );

  return {
    id: result.id,
    timestamp: result.timestamp,
  };
}

// ==================== 富媒体上传 API ====================

/**
 * 上传群聊富媒体文件
 */
export async function uploadGroupMedia(
  config: QQBotConfig,
  groupOpenid: string,
  fileType: 1 | 2 | 3 | 4, // 1: 图片, 2: 视频, 3: 语音, 4: 文件
  url: string,
  srvSendMsg?: boolean
): Promise<QQBotUploadMediaResponse> {
  const body: Record<string, unknown> = {
    file_type: fileType,
    url,
    srv_send_msg: srvSendMsg ?? false,
  };

  return callApi<QQBotUploadMediaResponse>(
    config,
    "POST",
    `/v2/groups/${groupOpenid}/files`,
    body
  );
}

/**
 * 上传 C2C 富媒体文件
 */
export async function uploadC2CMedia(
  config: QQBotConfig,
  openid: string,
  fileType: 1 | 2 | 3 | 4,
  url: string,
  srvSendMsg?: boolean
): Promise<QQBotUploadMediaResponse> {
  const body: Record<string, unknown> = {
    file_type: fileType,
    url,
    srv_send_msg: srvSendMsg ?? false,
  };

  return callApi<QQBotUploadMediaResponse>(
    config,
    "POST",
    `/v2/users/${openid}/files`,
    body
  );
}

// ==================== 频道信息 API ====================

/**
 * 获取当前机器人加入的频道列表
 */
export async function getGuilds(config: QQBotConfig): Promise<QQBotGuild[]> {
  const result = await callApi<
    Array<{
      id: string;
      name: string;
      icon?: string;
      owner_id?: string;
      member_count?: number;
      max_members?: number;
      description?: string;
      joined_at?: string;
    }>
  >(config, "GET", `/users/@me/guilds`);

  return result.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    ownerId: g.owner_id,
    memberCount: g.member_count,
    maxMembers: g.max_members,
    description: g.description,
    joinedAt: g.joined_at,
  }));
}

/**
 * 获取频道详情
 */
export async function getGuild(
  config: QQBotConfig,
  guildId: string
): Promise<QQBotGuild> {
  const result = await callApi<{
    id: string;
    name: string;
    icon?: string;
    owner_id?: string;
    member_count?: number;
    max_members?: number;
    description?: string;
    joined_at?: string;
  }>(config, "GET", `/guilds/${guildId}`);

  return {
    id: result.id,
    name: result.name,
    icon: result.icon,
    ownerId: result.owner_id,
    memberCount: result.member_count,
    maxMembers: result.max_members,
    description: result.description,
    joinedAt: result.joined_at,
  };
}

/**
 * 获取频道的子频道列表
 */
export async function getChannels(
  config: QQBotConfig,
  guildId: string
): Promise<QQBotChannel[]> {
  const result = await callApi<
    Array<{
      id: string;
      guild_id: string;
      name: string;
      type: number;
      position?: number;
      parent_id?: string;
    }>
  >(config, "GET", `/guilds/${guildId}/channels`);

  return result.map((c) => ({
    id: c.id,
    guildId: c.guild_id,
    name: c.name,
    type: c.type,
    position: c.position,
    parentId: c.parent_id,
  }));
}

// ==================== 用户信息 API ====================

/**
 * 获取当前机器人信息
 */
export async function getBotInfo(config: QQBotConfig): Promise<QQBotUser> {
  const result = await callApi<{
    id: string;
    username?: string;
    avatar?: string;
    bot?: boolean;
    union_openid?: string;
  }>(config, "GET", `/users/@me`);

  return {
    id: result.id,
    username: result.username,
    avatar: result.avatar,
    bot: result.bot,
    unionOpenid: result.union_openid,
  };
}

/**
 * 获取频道成员信息
 */
export async function getGuildMember(
  config: QQBotConfig,
  guildId: string,
  userId: string
): Promise<{
  user: QQBotUser;
  nick?: string;
  roles?: string[];
  joinedAt?: string;
}> {
  const result = await callApi<{
    user: {
      id: string;
      username?: string;
      avatar?: string;
      bot?: boolean;
    };
    nick?: string;
    roles?: string[];
    joined_at?: string;
  }>(config, "GET", `/guilds/${guildId}/members/${userId}`);

  return {
    user: {
      id: result.user.id,
      username: result.user.username,
      avatar: result.user.avatar,
      bot: result.user.bot,
    },
    nick: result.nick,
    roles: result.roles,
    joinedAt: result.joined_at,
  };
}

// ==================== 快捷方法 ====================

/**
 * 发送文本消息 (自动判断场景)
 */
export async function sendTextMessage(
  config: QQBotConfig,
  target: {
    type: "channel" | "group" | "c2c";
    id: string; // channelId / groupOpenid / userOpenid
    msgId?: string; // 用于回复
  },
  content: string
): Promise<QQBotSendMessageResponse> {
  switch (target.type) {
    case "channel":
      return sendChannelMessage(config, {
        channelId: target.id,
        content,
        msgId: target.msgId,
      });
    case "group":
      return sendGroupMessage(config, {
        groupOpenid: target.id,
        msgType: 0,
        content,
        msgId: target.msgId,
      });
    case "c2c":
      return sendC2CMessage(config, {
        openid: target.id,
        msgType: 0,
        content,
        msgId: target.msgId,
      });
    default:
      throw new Error(`Unknown target type: ${(target as { type: string }).type}`);
  }
}

/**
 * 发送图片消息
 */
export async function sendImageMessage(
  config: QQBotConfig,
  target: {
    type: "channel" | "group" | "c2c";
    id: string;
    msgId?: string;
  },
  imageUrl: string
): Promise<QQBotSendMessageResponse> {
  switch (target.type) {
    case "channel":
      return sendChannelMessage(config, {
        channelId: target.id,
        image: imageUrl,
        msgId: target.msgId,
      });
    case "group": {
      // 群聊需要先上传图片
      const media = await uploadGroupMedia(config, target.id, 1, imageUrl);
      return sendGroupMessage(config, {
        groupOpenid: target.id,
        msgType: 7,
        media: { fileInfo: media.fileInfo },
        msgId: target.msgId,
      });
    }
    case "c2c": {
      // C2C 需要先上传图片
      const media = await uploadC2CMedia(config, target.id, 1, imageUrl);
      return sendC2CMessage(config, {
        openid: target.id,
        msgType: 7,
        media: { fileInfo: media.fileInfo },
        msgId: target.msgId,
      });
    }
    default:
      throw new Error(`Unknown target type: ${(target as { type: string }).type}`);
  }
}
