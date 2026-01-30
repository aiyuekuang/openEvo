/**
 * 钉钉 Webhook 回调处理
 * DingTalk Webhook Handler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import type { DingTalkMessage, DingTalkRobotCallback } from "./types.js";
import { handleRobotCallback, handleEventCallback, type CallbackQuery } from "./callback.js";

export interface DingTalkWebhookOptions {
  /** 配置 */
  config: OpenClawConfig;
  /** 账号 ID */
  accountId?: string;
  /** 回调路径 */
  path?: string;
  /** 消息处理器 */
  onMessage?: (message: DingTalkMessage, sessionWebhook: string | undefined, accountId: string) => Promise<void>;
  /** 事件处理器 */
  onEvent?: (event: unknown, accountId: string) => Promise<void>;
  /** 日志函数 */
  log?: (msg: string) => void;
}

interface DingTalkChannelConfig {
  appKey?: string;
  appSecret?: string;
  signSecret?: string;
  token?: string;
  aesKey?: string;
  accounts?: Record<string, {
    appKey: string;
    appSecret: string;
    signSecret?: string;
    token?: string;
    aesKey?: string;
  }>;
}

function resolveDingTalkCallbackConfig(
  cfg: OpenClawConfig,
  accountId?: string
): { appKey: string; appSecret: string; signSecret?: string; token?: string; aesKey?: string } | null {
  const dingtalk = cfg.channels?.dingtalk as DingTalkChannelConfig | undefined;
  if (!dingtalk) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (dingtalk.accounts?.[normalizedAccountId]) {
    const account = dingtalk.accounts[normalizedAccountId];
    return {
      appKey: account.appKey,
      appSecret: account.appSecret,
      signSecret: account.signSecret,
      token: account.token,
      aesKey: account.aesKey,
    };
  }

  // 默认配置
  if (dingtalk.appKey && dingtalk.appSecret) {
    return {
      appKey: dingtalk.appKey,
      appSecret: dingtalk.appSecret,
      signSecret: dingtalk.signSecret,
      token: dingtalk.token,
      aesKey: dingtalk.aesKey,
    };
  }

  return null;
}

/**
 * 读取请求体
 */
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * 解析 URL 查询参数
 */
function parseQuery(url: string): Record<string, string> {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return {};

  const queryString = url.substring(queryStart + 1);
  const params: Record<string, string> = {};

  for (const part of queryString.split("&")) {
    const [key, value] = part.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
    }
  }

  return params;
}

/**
 * 获取请求头 (不区分大小写)
 */
function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 创建钉钉 Webhook 处理器
 */
export function createDingTalkWebhookHandler(options: DingTalkWebhookOptions) {
  const { config, accountId, path = "/dingtalk/callback", onMessage, onEvent, log } = options;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? "";
    const pathname = url.split("?")[0];

    // 检查路径是否匹配
    if (pathname !== path) {
      return false;
    }

    // 只处理 POST 请求
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return true;
    }

    const callbackConfig = resolveDingTalkCallbackConfig(config, accountId);
    if (!callbackConfig) {
      log?.("DingTalk webhook: 未配置回调参数");
      res.statusCode = 500;
      res.end("Configuration Error");
      return true;
    }

    try {
      const body = await readBody(req);
      const bodyJson = JSON.parse(body);
      log?.(`DingTalk webhook: 收到回调`);

      // 获取签名相关 headers
      const headers: Record<string, string | undefined> = {
        timestamp: getHeader(req, "timestamp"),
        sign: getHeader(req, "sign"),
        "x-dingtalk-timestamp": getHeader(req, "x-dingtalk-timestamp"),
        "x-dingtalk-sign": getHeader(req, "x-dingtalk-sign"),
      };

      // 判断是机器人消息还是事件回调
      if (bodyJson.conversationId && bodyJson.msgId) {
        // 机器人消息回调
        const result = handleRobotCallback(
          {
            appKey: callbackConfig.appKey,
            appSecret: callbackConfig.appSecret,
            signSecret: callbackConfig.signSecret,
          },
          headers,
          bodyJson as DingTalkRobotCallback
        );

        if (!result.success) {
          log?.(`DingTalk webhook: 机器人消息处理失败 - ${result.error}`);
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ errcode: 403, errmsg: result.error }));
          return true;
        }

        // 处理消息
        if (result.message && onMessage) {
          try {
            await onMessage(result.message, result.sessionWebhook, accountId ?? "default");
          } catch (err) {
            log?.(`DingTalk webhook: 消息处理器错误 - ${String(err)}`);
          }
        }

        // 返回空响应 (钉钉机器人回调不需要特定响应格式)
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ msgtype: "empty", empty: {} }));
        return true;
      }

      // 事件回调 (如果配置了 token 和 aesKey)
      if (callbackConfig.token && callbackConfig.aesKey && bodyJson.encrypt) {
        const query = parseQuery(url);
        const callbackQuery: CallbackQuery = {
          signature: query.signature,
          timestamp: query.timestamp,
          nonce: query.nonce,
        };

        const result = handleEventCallback(
          {
            appKey: callbackConfig.appKey,
            appSecret: callbackConfig.appSecret,
            token: callbackConfig.token,
            aesKey: callbackConfig.aesKey,
          },
          callbackQuery,
          bodyJson
        );

        if (!result.success) {
          log?.(`DingTalk webhook: 事件处理失败 - ${result.error}`);
          res.statusCode = 403;
          res.end(result.error);
          return true;
        }

        // 处理事件
        if (result.event && onEvent) {
          try {
            await onEvent(result.event, accountId ?? "default");
          } catch (err) {
            log?.(`DingTalk webhook: 事件处理器错误 - ${String(err)}`);
          }
        }

        // 返回加密响应
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(result.response);
        return true;
      }

      // 未知格式
      log?.(`DingTalk webhook: 未知的回调格式`);
      res.statusCode = 400;
      res.end("Unknown callback format");
      return true;
    } catch (err) {
      log?.(`DingTalk webhook: 处理异常 - ${String(err)}`);
      res.statusCode = 500;
      res.end("Internal Error");
      return true;
    }
  };
}

/**
 * 注册钉钉 Webhook 路由 (用于插件系统)
 */
export function registerDingTalkWebhook(params: {
  api: {
    registerHttpRoute: (params: {
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    }) => void;
  };
  config: OpenClawConfig;
  accountId?: string;
  path?: string;
  onMessage?: (message: DingTalkMessage, sessionWebhook: string | undefined, accountId: string) => Promise<void>;
  onEvent?: (event: unknown, accountId: string) => Promise<void>;
  log?: (msg: string) => void;
}) {
  const handler = createDingTalkWebhookHandler({
    config: params.config,
    accountId: params.accountId,
    path: params.path ?? "/dingtalk/callback",
    onMessage: params.onMessage,
    onEvent: params.onEvent,
    log: params.log,
  });

  params.api.registerHttpRoute({
    path: params.path ?? "/dingtalk/callback",
    handler: async (req, res) => {
      await handler(req, res);
    },
  });
}
