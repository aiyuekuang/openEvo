/**
 * 飞书渠道类型定义
 * Feishu (Lark) Channel Types
 */

export interface FeishuConfig {
  /** 应用 App ID */
  appId: string;
  /** 应用 App Secret */
  appSecret: string;
  /** 事件订阅 Verification Token */
  verificationToken?: string;
  /** 事件订阅 Encrypt Key */
  encryptKey?: string;
}

export interface FeishuMessage {
  /** 消息ID */
  messageId: string;
  /** 消息类型 */
  messageType: FeishuMessageType;
  /** 发送者 ID */
  senderId: string;
  /** 发送者类型 */
  senderType?: "user" | "app" | "anonymous";
  /** 会话ID */
  chatId: string;
  /** 会话类型 */
  chatType: "p2p" | "group";
  /** 消息内容 (JSON 字符串) */
  content: string;
  /** 创建时间戳 (毫秒) */
  createTime: number;
  /** @提到的用户 */
  mentions?: FeishuMention[];
  /** 根消息ID (用于回复) */
  rootId?: string;
  /** 父消息ID (用于回复) */
  parentId?: string;
}

export type FeishuMessageType =
  | "text"
  | "image"
  | "file"
  | "audio"
  | "media"
  | "sticker"
  | "interactive"
  | "share_chat"
  | "share_user"
  | "post";

export interface FeishuMention {
  /** 被@用户的 ID */
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  /** 被@用户的姓名 */
  name: string;
  /** @的key，用于内容中定位 */
  key: string;
}

export interface FeishuUser {
  /** Open ID */
  openId: string;
  /** User ID */
  userId?: string;
  /** Union ID */
  unionId?: string;
  /** 用户名 */
  name?: string;
  /** 头像 */
  avatarUrl?: string;
  /** 邮箱 */
  email?: string;
  /** 手机号 */
  mobile?: string;
}

export interface FeishuSendMessageRequest {
  /** 接收者 ID 类型 */
  receive_id_type: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  /** 接收者 ID */
  receive_id: string;
  /** 消息类型 */
  msg_type: FeishuMessageType;
  /** 消息内容 (JSON 字符串) */
  content: string;
  /** 回复消息 ID */
  reply_in_thread?: boolean;
}

export interface FeishuAccessToken {
  tenantAccessToken: string;
  expiresAt: number;
}

export interface FeishuApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

export interface FeishuContext {
  config: FeishuConfig;
  accessToken: () => Promise<string>;
  message: FeishuMessage;
  user?: FeishuUser;
}

/**
 * 飞书事件回调格式
 */
export interface FeishuEventCallback {
  /** 事件 schema 版本 */
  schema?: string;
  /** 事件头 */
  header?: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  /** 事件体 */
  event?: {
    sender?: {
      sender_id: {
        open_id: string;
        user_id?: string;
        union_id?: string;
      };
      sender_type: string;
      tenant_key?: string;
    };
    message?: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: {
          open_id?: string;
          user_id?: string;
          union_id?: string;
        };
        name: string;
      }>;
    };
  };
  /** URL 验证挑战 (仅用于 URL 验证) */
  challenge?: string;
  /** Token (用于 URL 验证) */
  token?: string;
  /** 类型 (用于 URL 验证) */
  type?: string;
  /** 加密消息 (如果启用了加密) */
  encrypt?: string;
}

/**
 * 文本消息内容
 */
export interface FeishuTextContent {
  text: string;
}

/**
 * 富文本消息内容
 */
export interface FeishuPostContent {
  zh_cn?: {
    title: string;
    content: Array<Array<{
      tag: "text" | "a" | "at" | "img";
      text?: string;
      href?: string;
      user_id?: string;
      user_name?: string;
      image_key?: string;
    }>>;
  };
  en_us?: {
    title: string;
    content: Array<Array<{
      tag: "text" | "a" | "at" | "img";
      text?: string;
      href?: string;
      user_id?: string;
      user_name?: string;
      image_key?: string;
    }>>;
  };
}

/**
 * 交互卡片内容
 */
export interface FeishuInteractiveContent {
  config?: {
    wide_screen_mode?: boolean;
    enable_forward?: boolean;
  };
  header?: {
    title: {
      tag: "plain_text" | "lark_md";
      content: string;
    };
    template?: string;
  };
  elements: Array<{
    tag: string;
    [key: string]: unknown;
  }>;
}
