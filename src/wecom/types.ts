/**
 * 企业微信渠道类型定义
 * WeCom (WeChat Work) Channel Types
 */

export interface WeComConfig {
  /** 企业ID */
  corpId: string;
  /** 应用AgentId */
  agentId: number;
  /** 应用Secret */
  secret: string;
  /** 消息回调Token (用于验证回调) */
  token?: string;
  /** 消息回调EncodingAESKey (用于解密消息) */
  encodingAESKey?: string;
  /** 回调URL路径 */
  callbackPath?: string;
}

export interface WeComMessage {
  /** 消息ID */
  msgId: string;
  /** 消息类型: text, image, voice, video, location, link, event */
  msgType: WeComMessageType;
  /** 发送者UserID */
  fromUser: string;
  /** 接收者 (通常是应用) */
  toUser: string;
  /** 创建时间戳 */
  createTime: number;
  /** 消息内容 */
  content?: string;
  /** 图片MediaId */
  picUrl?: string;
  mediaId?: string;
  /** 事件类型 (当msgType为event时) */
  event?: string;
  eventKey?: string;
}

export type WeComMessageType = 
  | "text"
  | "image"
  | "voice"
  | "video"
  | "location"
  | "link"
  | "event";

export interface WeComUser {
  /** 用户ID */
  userId: string;
  /** 用户名称 */
  name?: string;
  /** 部门ID列表 */
  department?: number[];
  /** 手机号 */
  mobile?: string;
  /** 邮箱 */
  email?: string;
  /** 头像URL */
  avatar?: string;
}

export interface WeComSendMessageOptions {
  /** 接收者UserID (可多个，用|分隔) */
  toUser?: string;
  /** 接收者部门ID (可多个，用|分隔) */
  toParty?: string;
  /** 接收者标签ID (可多个，用|分隔) */
  toTag?: string;
  /** 消息类型 */
  msgType: "text" | "image" | "voice" | "video" | "file" | "textcard" | "news" | "markdown";
  /** 应用AgentId */
  agentId: number;
  /** 消息内容 */
  content?: string;
  /** 是否保密消息 */
  safe?: 0 | 1;
  /** 是否开启id转译 */
  enableIdTrans?: 0 | 1;
  /** 是否开启重复消息检查 */
  enableDuplicateCheck?: 0 | 1;
  /** 重复消息检查间隔秒数 */
  duplicateCheckInterval?: number;
}

export interface WeComAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface WeComApiResponse<T = unknown> {
  errcode: number;
  errmsg: string;
  data?: T;
}

export interface WeComContext {
  config: WeComConfig;
  accessToken: () => Promise<string>;
  message: WeComMessage;
  user?: WeComUser;
}
