/**
 * 个人微信 (Wechaty) 渠道类型定义
 * WeChat Personal Channel Types via Wechaty
 * 
 * 支持多种 Puppet 实现:
 * - puppet-wechat4u (网页协议)
 * - puppet-padlocal (iPad协议)
 * - puppet-xp (Windows Hook)
 */

export interface WeChatConfig {
  /** Wechaty Puppet 类型 */
  puppet?: "wechat4u" | "padlocal" | "xp" | "service";
  /** Puppet 服务地址 (puppet-service 模式) */
  puppetServerUrl?: string;
  /** Puppet Token (puppet-service/padlocal 模式) */
  puppetToken?: string;
  /** 机器人微信ID */
  selfId?: string;
}

export interface WeChatMessage {
  /** 消息ID */
  id: string;
  /** 消息类型 */
  type: WeChatMessageType;
  /** 发送者 */
  from: WeChatContact;
  /** 接收者 (可能是群) */
  to?: WeChatContact;
  /** 群聊 (如果是群消息) */
  room?: WeChatRoom;
  /** 消息文本内容 */
  text?: string;
  /** 消息时间 */
  timestamp: number;
  /** 是否是自己发送的 */
  self: boolean;
}

export type WeChatMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "emoticon"
  | "file"
  | "location"
  | "miniprogram"
  | "link"
  | "contact"
  | "recalled"
  | "unknown";

export interface WeChatContact {
  /** 微信ID */
  id: string;
  /** 昵称 */
  name: string;
  /** 备注名 */
  alias?: string;
  /** 头像URL */
  avatar?: string;
  /** 是否是好友 */
  friend?: boolean;
  /** 联系人类型 */
  type: "personal" | "official" | "corporation";
  /** 性别 */
  gender?: "male" | "female" | "unknown";
}

export interface WeChatRoom {
  /** 群ID */
  id: string;
  /** 群名称 */
  topic: string;
  /** 群主 */
  owner?: WeChatContact;
  /** 群成员列表 */
  members?: WeChatContact[];
  /** 群头像 */
  avatar?: string;
}

export interface WeChatSendOptions {
  /** 接收者 (微信ID 或 群ID) */
  to: string;
  /** 消息类型 */
  type?: "text" | "image" | "file" | "url";
  /** 文本内容 */
  text?: string;
  /** 文件/图片 URL */
  fileUrl?: string;
  /** 链接卡片 */
  link?: {
    title: string;
    description?: string;
    url: string;
    thumbnailUrl?: string;
  };
  /** @ 某人 (群消息) */
  mentionIds?: string[];
}

export interface WeChatLoginStatus {
  /** 是否已登录 */
  loggedIn: boolean;
  /** 登录用户信息 */
  user?: WeChatContact;
  /** 二维码 (等待扫码时) */
  qrcode?: string;
}

export interface WeChatContext {
  config: WeChatConfig;
  message: WeChatMessage;
  contact: WeChatContact;
  room?: WeChatRoom;
}

/** Wechaty 事件类型 */
export type WeChatEventType =
  | "scan"
  | "login"
  | "logout"
  | "message"
  | "friendship"
  | "room-join"
  | "room-leave"
  | "room-topic"
  | "error";
