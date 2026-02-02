/**
 * QQ 官方机器人渠道类型定义
 * QQ Official Bot Channel Types (via QQ Open Platform)
 *
 * 基于 QQ 开放平台官方 API
 * https://bot.q.qq.com/wiki/develop/api/
 */

export interface QQBotConfig {
  /** 机器人 AppID */
  appId: string;
  /** 机器人 AppSecret */
  appSecret: string;
  /** 是否为沙箱环境 */
  sandbox?: boolean;
  /** 回调验证 Token (用于 Webhook 验证) */
  token?: string;
  /** 回调 URL 路径 */
  callbackPath?: string;
}

/** QQ 开放平台 API 基础 URL */
export const QQBOT_API_BASE = "https://api.sgroup.qq.com";
export const QQBOT_SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";

/** Access Token 响应 */
export interface QQBotAccessToken {
  accessToken: string;
  expiresAt: number;
}

/** API 响应基础结构 */
export interface QQBotApiResponse<T = unknown> {
  /** 错误码 (0 表示成功) */
  code?: number;
  /** 错误信息 */
  message?: string;
  /** 返回数据 */
  data?: T;
}

/** 消息类型 */
export type QQBotMessageType =
  | "text"
  | "image"
  | "markdown"
  | "ark"
  | "embed"
  | "media";

/** 通用消息结构 */
export interface QQBotMessage {
  /** 消息 ID */
  id: string;
  /** 消息内容 */
  content?: string;
  /** 消息创建时间 */
  timestamp: string;
  /** 消息发送者 */
  author: QQBotUser;
  /** 是否 @ 全员 */
  mentionEveryone?: boolean;
  /** @ 的用户列表 */
  mentions?: QQBotUser[];
}

/** 用户信息 */
export interface QQBotUser {
  /** 用户 openid (群/私聊场景) 或 用户 ID (频道场景) */
  id: string;
  /** 用户昵称 */
  username?: string;
  /** 用户头像 URL */
  avatar?: string;
  /** 是否为机器人 */
  bot?: boolean;
  /** 用户的 union_openid (跨应用) */
  unionOpenid?: string;
}

/** 频道信息 */
export interface QQBotGuild {
  /** 频道 ID */
  id: string;
  /** 频道名称 */
  name: string;
  /** 频道头像 URL */
  icon?: string;
  /** 频道主 ID */
  ownerId?: string;
  /** 成员数 */
  memberCount?: number;
  /** 最大成员数 */
  maxMembers?: number;
  /** 频道描述 */
  description?: string;
  /** 加入时间 */
  joinedAt?: string;
}

/** 子频道信息 */
export interface QQBotChannel {
  /** 子频道 ID */
  id: string;
  /** 频道 ID */
  guildId: string;
  /** 子频道名称 */
  name: string;
  /** 子频道类型 (0: 文字, 1: 保留, 2: 语音, 3: 子频道分组, 4: 直播) */
  type: number;
  /** 子频道排序位置 */
  position?: number;
  /** 父分组 ID */
  parentId?: string;
}

/** 群聊信息 */
export interface QQBotGroup {
  /** 群 openid */
  groupOpenid: string;
}

/** C2C (私聊) 用户信息 */
export interface QQBotC2CUser {
  /** 用户 openid */
  userOpenid: string;
}

/** 发送消息选项 - 频道场景 */
export interface QQBotSendChannelMessageOptions {
  /** 子频道 ID */
  channelId: string;
  /** 消息内容 */
  content?: string;
  /** 图片 URL */
  image?: string;
  /** 消息引用 (回复的消息 ID) */
  msgId?: string;
  /** 事件 ID (用于被动消息) */
  eventId?: string;
  /** Markdown 模板消息 */
  markdown?: {
    templateId?: number;
    customTemplateId?: string;
    params?: Array<{ key: string; values: string[] }>;
    content?: string;
  };
  /** Ark 消息 */
  ark?: {
    templateId: number;
    kv: Array<{ key: string; value?: string; obj?: unknown[] }>;
  };
  /** Embed 消息 */
  embed?: {
    title: string;
    prompt?: string;
    thumbnail?: { url: string };
    fields?: Array<{ name: string }>;
  };
}

/** 发送消息选项 - 群聊场景 */
export interface QQBotSendGroupMessageOptions {
  /** 群 openid */
  groupOpenid: string;
  /** 消息类型 (0: 文本, 2: Markdown, 3: Ark, 4: Embed, 7: 富媒体) */
  msgType: 0 | 2 | 3 | 4 | 7;
  /** 消息内容 */
  content?: string;
  /** 消息引用 (回复的消息 ID) */
  msgId?: string;
  /** 事件 ID */
  eventId?: string;
  /** Markdown 消息 */
  markdown?: {
    customTemplateId?: string;
    params?: Array<{ key: string; values: string[] }>;
    content?: string;
  };
  /** Ark 消息 */
  ark?: {
    templateId: number;
    kv: Array<{ key: string; value?: string; obj?: unknown[] }>;
  };
  /** 富媒体消息 */
  media?: {
    fileInfo: string;
  };
  /** 消息序列号 (用于去重) */
  msgSeq?: number;
}

/** 发送消息选项 - C2C 私聊场景 */
export interface QQBotSendC2CMessageOptions {
  /** 用户 openid */
  openid: string;
  /** 消息类型 (0: 文本, 2: Markdown, 3: Ark, 4: Embed, 7: 富媒体) */
  msgType: 0 | 2 | 3 | 4 | 7;
  /** 消息内容 */
  content?: string;
  /** 消息引用 (回复的消息 ID) */
  msgId?: string;
  /** 事件 ID */
  eventId?: string;
  /** Markdown 消息 */
  markdown?: {
    customTemplateId?: string;
    params?: Array<{ key: string; values: string[] }>;
    content?: string;
  };
  /** 富媒体消息 */
  media?: {
    fileInfo: string;
  };
  /** 消息序列号 */
  msgSeq?: number;
}

/** Webhook 事件类型 */
export type QQBotEventType =
  // 频道事件
  | "GUILD_CREATE"
  | "GUILD_UPDATE"
  | "GUILD_DELETE"
  | "CHANNEL_CREATE"
  | "CHANNEL_UPDATE"
  | "CHANNEL_DELETE"
  | "GUILD_MEMBER_ADD"
  | "GUILD_MEMBER_UPDATE"
  | "GUILD_MEMBER_REMOVE"
  // 频道消息事件
  | "MESSAGE_CREATE"
  | "AT_MESSAGE_CREATE"
  | "DIRECT_MESSAGE_CREATE"
  // 群聊事件
  | "GROUP_AT_MESSAGE_CREATE"
  | "GROUP_ADD_ROBOT"
  | "GROUP_DEL_ROBOT"
  | "GROUP_MSG_REJECT"
  | "GROUP_MSG_RECEIVE"
  // C2C 私聊事件
  | "C2C_MESSAGE_CREATE"
  | "FRIEND_ADD"
  | "FRIEND_DEL"
  | "C2C_MSG_REJECT"
  | "C2C_MSG_RECEIVE";

/** Webhook 事件基础结构 */
export interface QQBotWebhookEvent {
  /** 操作码 */
  op: number;
  /** 序列号 */
  s?: number;
  /** 事件类型 */
  t?: QQBotEventType;
  /** 事件数据 */
  d?: unknown;
  /** 事件 ID */
  id?: string;
}

/** 频道消息事件数据 */
export interface QQBotChannelMessageEvent {
  /** 消息 ID */
  id: string;
  /** 子频道 ID */
  channelId: string;
  /** 频道 ID */
  guildId: string;
  /** 消息内容 */
  content: string;
  /** 消息创建时间 */
  timestamp: string;
  /** 消息发送者 */
  author: QQBotUser;
  /** 消息成员信息 */
  member?: {
    nick?: string;
    roles?: string[];
    joinedAt?: string;
  };
}

/** 群聊 @机器人 消息事件数据 */
export interface QQBotGroupMessageEvent {
  /** 消息 ID */
  id: string;
  /** 消息内容 */
  content: string;
  /** 消息创建时间 */
  timestamp: string;
  /** 发送者信息 */
  author: {
    /** 用户 openid */
    id: string;
    /** 用户的 union_openid */
    memberOpenid?: string;
  };
  /** 群 openid */
  groupOpenid: string;
}

/** C2C 私聊消息事件数据 */
export interface QQBotC2CMessageEvent {
  /** 消息 ID */
  id: string;
  /** 消息内容 */
  content: string;
  /** 消息创建时间 */
  timestamp: string;
  /** 发送者信息 */
  author: {
    /** 用户 openid */
    id: string;
    /** 用户的 union_openid */
    userOpenid?: string;
  };
}

/** 上下文信息 */
export interface QQBotContext {
  config: QQBotConfig;
  accessToken: () => Promise<string>;
  /** 事件类型 */
  eventType: QQBotEventType;
  /** 原始事件数据 */
  event: unknown;
}

/** 发送消息响应 */
export interface QQBotSendMessageResponse {
  /** 消息 ID */
  id: string;
  /** 消息创建时间 */
  timestamp: string;
}

/** 上传富媒体响应 */
export interface QQBotUploadMediaResponse {
  /** 文件 ID (用于发送消息) */
  fileUuid: string;
  /** 文件信息 (用于发送消息) */
  fileInfo: string;
  /** 有效期秒数 */
  ttl: number;
}
