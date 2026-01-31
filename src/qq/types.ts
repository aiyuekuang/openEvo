/**
 * QQ (OneBot) 渠道类型定义
 * QQ Channel Types (OneBot Protocol)
 * 
 * 兼容 go-cqhttp、NapCat、Lagrange 等 OneBot 实现
 */

export interface QQConfig {
  /** OneBot HTTP API 地址 */
  httpUrl: string;
  /** OneBot WebSocket 地址 (可选，用于接收消息) */
  wsUrl?: string;
  /** Access Token (可选) */
  accessToken?: string;
  /** 机器人 QQ 号 */
  selfId?: string;
}

export interface QQMessage {
  /** 消息ID */
  messageId: number;
  /** 消息类型: private, group */
  messageType: "private" | "group";
  /** 发送者 QQ 号 */
  userId: number;
  /** 群号 (群消息时) */
  groupId?: number;
  /** 消息内容 (CQ码格式或纯文本) */
  rawMessage: string;
  /** 消息内容 (纯文本) */
  message: string;
  /** 发送时间戳 */
  time: number;
  /** 发送者信息 */
  sender: QQSender;
}

export interface QQSender {
  /** QQ 号 */
  userId: number;
  /** 昵称 */
  nickname: string;
  /** 群名片 */
  card?: string;
  /** 性别 */
  sex?: "male" | "female" | "unknown";
  /** 年龄 */
  age?: number;
  /** 群内角色 */
  role?: "owner" | "admin" | "member";
}

export interface QQSendMessageOptions {
  /** 消息类型 */
  messageType: "private" | "group";
  /** 用户 QQ 号 (私聊时) */
  userId?: number;
  /** 群号 (群聊时) */
  groupId?: number;
  /** 消息内容 (可以是 CQ 码或消息段数组) */
  message: string | QQMessageSegment[];
  /** 是否自动转义 CQ 码 */
  autoEscape?: boolean;
}

export interface QQMessageSegment {
  /** 消息类型 */
  type: "text" | "face" | "image" | "record" | "video" | "at" | "share" | "reply" | "forward";
  /** 消息数据 */
  data: Record<string, unknown>;
}

export interface QQApiResponse<T = unknown> {
  /** 状态: ok, async, failed */
  status: "ok" | "async" | "failed";
  /** 返回码 */
  retcode: number;
  /** 返回信息 */
  message?: string;
  /** 错误信息 */
  wording?: string;
  /** 返回数据 */
  data: T;
}

export interface QQLoginInfo {
  /** 机器人 QQ 号 */
  userId: number;
  /** 机器人昵称 */
  nickname: string;
}

export interface QQContext {
  config: QQConfig;
  message: QQMessage;
  sender: QQSender;
}

/** OneBot 事件类型 */
export type QQEventType = 
  | "message"
  | "notice"
  | "request"
  | "meta_event";

/** OneBot WebSocket 事件 */
export interface QQEvent {
  /** 事件时间戳 */
  time: number;
  /** 机器人 QQ 号 */
  selfId: number;
  /** 上报类型 */
  postType: QQEventType;
  /** 消息类型 */
  messageType?: "private" | "group";
  /** 子类型 */
  subType?: string;
  /** 消息ID */
  messageId?: number;
  /** 用户 QQ 号 */
  userId?: number;
  /** 群号 */
  groupId?: number;
  /** 消息内容 */
  message?: string | QQMessageSegment[];
  /** 原始消息 */
  rawMessage?: string;
  /** 发送者信息 */
  sender?: QQSender;
}
