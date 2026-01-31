/**
 * QQ (OneBot) API 客户端
 * OneBot HTTP API Client
 */

import type { QQConfig, QQApiResponse, QQLoginInfo, QQSendMessageOptions } from "./types.js";

/**
 * 调用 OneBot API
 */
async function callApi<T = unknown>(
  config: QQConfig,
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<QQApiResponse<T>> {
  const url = new URL(endpoint, config.httpUrl);
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (config.accessToken) {
    headers["Authorization"] = `Bearer ${config.accessToken}`;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`QQ API 请求失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as QQApiResponse<T>;
  
  if (result.status === "failed") {
    throw new Error(`QQ API 错误: ${result.message ?? result.wording ?? "未知错误"} (retcode: ${result.retcode})`);
  }

  return result;
}

/**
 * 获取登录信息
 */
export async function getLoginInfo(config: QQConfig): Promise<QQLoginInfo> {
  const result = await callApi<QQLoginInfo>(config, "/get_login_info");
  return result.data;
}

/**
 * 发送私聊消息
 */
export async function sendPrivateMsg(
  config: QQConfig,
  userId: number,
  message: string,
  autoEscape = false
): Promise<{ messageId: number }> {
  const result = await callApi<{ message_id: number }>(config, "/send_private_msg", {
    user_id: userId,
    message,
    auto_escape: autoEscape,
  });
  return { messageId: result.data.message_id };
}

/**
 * 发送群消息
 */
export async function sendGroupMsg(
  config: QQConfig,
  groupId: number,
  message: string,
  autoEscape = false
): Promise<{ messageId: number }> {
  const result = await callApi<{ message_id: number }>(config, "/send_group_msg", {
    group_id: groupId,
    message,
    auto_escape: autoEscape,
  });
  return { messageId: result.data.message_id };
}

/**
 * 发送消息 (通用)
 */
export async function sendMsg(
  config: QQConfig,
  options: QQSendMessageOptions
): Promise<{ messageId: number }> {
  const message = typeof options.message === "string" 
    ? options.message 
    : JSON.stringify(options.message);

  const result = await callApi<{ message_id: number }>(config, "/send_msg", {
    message_type: options.messageType,
    user_id: options.userId,
    group_id: options.groupId,
    message,
    auto_escape: options.autoEscape ?? false,
  });
  return { messageId: result.data.message_id };
}

/**
 * 获取消息
 */
export async function getMsg(
  config: QQConfig,
  messageId: number
): Promise<Record<string, unknown>> {
  const result = await callApi<Record<string, unknown>>(config, "/get_msg", {
    message_id: messageId,
  });
  return result.data;
}

/**
 * 撤回消息
 */
export async function deleteMsg(
  config: QQConfig,
  messageId: number
): Promise<void> {
  await callApi(config, "/delete_msg", {
    message_id: messageId,
  });
}

/**
 * 获取好友列表
 */
export async function getFriendList(
  config: QQConfig
): Promise<Array<{ userId: number; nickname: string; remark: string }>> {
  const result = await callApi<Array<{ user_id: number; nickname: string; remark: string }>>(
    config, 
    "/get_friend_list"
  );
  return result.data.map(f => ({
    userId: f.user_id,
    nickname: f.nickname,
    remark: f.remark,
  }));
}

/**
 * 获取群列表
 */
export async function getGroupList(
  config: QQConfig
): Promise<Array<{ groupId: number; groupName: string; memberCount: number }>> {
  const result = await callApi<Array<{ group_id: number; group_name: string; member_count: number }>>(
    config, 
    "/get_group_list"
  );
  return result.data.map(g => ({
    groupId: g.group_id,
    groupName: g.group_name,
    memberCount: g.member_count,
  }));
}

/**
 * 获取群成员信息
 */
export async function getGroupMemberInfo(
  config: QQConfig,
  groupId: number,
  userId: number,
  noCache = false
): Promise<Record<string, unknown>> {
  const result = await callApi<Record<string, unknown>>(config, "/get_group_member_info", {
    group_id: groupId,
    user_id: userId,
    no_cache: noCache,
  });
  return result.data;
}

/**
 * 构建图片 CQ 码
 */
export function buildImageCQ(url: string): string {
  return `[CQ:image,file=${url}]`;
}

/**
 * 构建 @ CQ 码
 */
export function buildAtCQ(userId: number | "all"): string {
  return `[CQ:at,qq=${userId}]`;
}

/**
 * 构建回复 CQ 码
 */
export function buildReplyCQ(messageId: number): string {
  return `[CQ:reply,id=${messageId}]`;
}
