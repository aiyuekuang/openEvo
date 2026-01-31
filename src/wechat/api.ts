/**
 * 个人微信 (Wechaty) API 客户端
 * WeChat API Client via Wechaty HTTP Bridge
 * 
 * 通过 HTTP 桥接服务与 Wechaty 实例通信
 * 需要单独运行 Wechaty HTTP Bridge 服务
 */

import type { WeChatConfig, WeChatLoginStatus, WeChatContact, WeChatRoom } from "./types.js";

export interface WeChatApiConfig {
  /** HTTP Bridge 服务地址 */
  bridgeUrl: string;
  /** API Token */
  token?: string;
}

/**
 * 调用 Wechaty HTTP Bridge API
 */
async function callApi<T = unknown>(
  config: WeChatApiConfig,
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = new URL(endpoint, config.bridgeUrl);
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`WeChat API 请求失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { success: boolean; data?: T; error?: string };
  
  if (!result.success) {
    throw new Error(`WeChat API 错误: ${result.error ?? "未知错误"}`);
  }

  return result.data as T;
}

/**
 * 获取登录状态
 */
export async function getLoginStatus(config: WeChatApiConfig): Promise<WeChatLoginStatus> {
  return callApi<WeChatLoginStatus>(config, "/api/status");
}

/**
 * 发送文本消息
 */
export async function sendText(
  config: WeChatApiConfig,
  to: string,
  text: string,
  isRoom = false
): Promise<{ messageId: string }> {
  return callApi<{ messageId: string }>(config, "/api/send/text", {
    to,
    text,
    isRoom,
  });
}

/**
 * 发送图片
 */
export async function sendImage(
  config: WeChatApiConfig,
  to: string,
  imageUrl: string,
  isRoom = false
): Promise<{ messageId: string }> {
  return callApi<{ messageId: string }>(config, "/api/send/image", {
    to,
    imageUrl,
    isRoom,
  });
}

/**
 * 发送文件
 */
export async function sendFile(
  config: WeChatApiConfig,
  to: string,
  fileUrl: string,
  isRoom = false
): Promise<{ messageId: string }> {
  return callApi<{ messageId: string }>(config, "/api/send/file", {
    to,
    fileUrl,
    isRoom,
  });
}

/**
 * 获取联系人信息
 */
export async function getContact(
  config: WeChatApiConfig,
  contactId: string
): Promise<WeChatContact | null> {
  try {
    return await callApi<WeChatContact>(config, "/api/contact", { id: contactId });
  } catch {
    return null;
  }
}

/**
 * 获取群信息
 */
export async function getRoom(
  config: WeChatApiConfig,
  roomId: string
): Promise<WeChatRoom | null> {
  try {
    return await callApi<WeChatRoom>(config, "/api/room", { id: roomId });
  } catch {
    return null;
  }
}

/**
 * 获取好友列表
 */
export async function getContactList(
  config: WeChatApiConfig
): Promise<WeChatContact[]> {
  return callApi<WeChatContact[]>(config, "/api/contacts");
}

/**
 * 获取群列表
 */
export async function getRoomList(
  config: WeChatApiConfig
): Promise<WeChatRoom[]> {
  return callApi<WeChatRoom[]>(config, "/api/rooms");
}

/**
 * 将 WeChatConfig 转换为 API 配置
 */
export function toApiConfig(config: WeChatConfig): WeChatApiConfig {
  return {
    bridgeUrl: config.puppetServerUrl ?? "http://localhost:8788",
    token: config.puppetToken,
  };
}
