/**
 * 钉钉渠道类型定义
 * DingTalk Channel Types
 */

export interface DingTalkConfig {
  /** 应用 AppKey */
  appKey: string;
  /** 应用 AppSecret */
  appSecret: string;
  /** 机器人 Webhook URL (用于群机器人) */
  webhookUrl?: string;
  /** 机器人加签密钥 */
  signSecret?: string;
  /** 回调 Token */
  token?: string;
  /** 回调 AES Key */
  aesKey?: string;
}

export interface DingTalkMessage {
  /** 消息ID */
  msgId: string;
  /** 消息类型 */
  msgType: DingTalkMessageType;
  /** 发送者 ID */
  senderId: string;
  /** 发送者昵称 */
  senderNick?: string;
  /** 会话ID */
  conversationId: string;
  /** 会话类型: 1-单聊 2-群聊 */
  conversationType: "1" | "2";
  /** 消息内容 */
  content?: string;
  /** 创建时间 */
  createAt: number;
  /** @提到的用户 */
  atUsers?: string[];
  /** 是否@全员 */
  isAtAll?: boolean;
  /** 机器人code */
  robotCode?: string;
}

export type DingTalkMessageType =
  | "text"
  | "picture"
  | "richText"
  | "audio"
  | "video"
  | "file";

export interface DingTalkUser {
  /** 用户ID */
  userId: string;
  /** 用户昵称 */
  nick?: string;
  /** 用户头像 */
  avatarUrl?: string;
  /** 手机号 */
  mobile?: string;
  /** 邮箱 */
  email?: string;
}

export interface DingTalkSendMessageOptions {
  /** 消息类型 */
  msgType: "text" | "markdown" | "link" | "actionCard" | "feedCard";
  /** 文本消息 */
  text?: {
    content: string;
  };
  /** Markdown 消息 */
  markdown?: {
    title: string;
    text: string;
  };
  /** 链接消息 */
  link?: {
    title: string;
    text: string;
    messageUrl: string;
    picUrl?: string;
  };
  /** @设置 */
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

export interface DingTalkAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface DingTalkApiResponse<T = unknown> {
  errcode: number;
  errmsg: string;
  result?: T;
}

export interface DingTalkContext {
  config: DingTalkConfig;
  accessToken: () => Promise<string>;
  message: DingTalkMessage;
  user?: DingTalkUser;
}

/**
 * 钉钉机器人回调消息格式
 */
export interface DingTalkRobotCallback {
  /** 会话ID */
  conversationId: string;
  /** 会话类型 */
  conversationType: "1" | "2";
  /** 消息ID */
  msgId: string;
  /** 消息类型 */
  msgtype: string;
  /** 文本消息 */
  text?: {
    content: string;
  };
  /** @设置 */
  at?: {
    atUserIds?: string[];
    isAtAll?: boolean;
  };
  /** 创建时间 */
  createAt: number;
  /** 发送者ID */
  senderId: string;
  /** 发送者昵称 */
  senderNick: string;
  /** 发送者企业ID */
  senderCorpId?: string;
  /** 发送者员工在当前企业内的staffId */
  senderStaffId?: string;
  /** 会话标题 */
  conversationTitle?: string;
  /** 机器人在群中的昵称 */
  chatbotCorpId?: string;
  /** 机器人唯一标识 */
  chatbotUserId?: string;
  /** 是否是管理员 */
  isAdmin?: boolean;
  /** session webhook */
  sessionWebhook?: string;
  /** session webhook 过期时间 */
  sessionWebhookExpiredTime?: number;
}
