/**
 * 飞书 Webhook 回调处理
 * Feishu (Lark) Webhook Handler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import type { FeishuMessage, FeishuEventCallback } from "./types.js";
import { handleEventCallback } from "./callback.js";

export interface FeishuWebhookOptions {
  /** 配置 */
  config: OpenClawConfig;
  /** 账号 ID */
  accountId?: string;
  /** 回调路径 */
  path?: string;
  /** 消息处理器 */
  onMessage?: (message: FeishuMessage, accountId: string) => Promise<void>;
  /** 事件处理器 (非消息事件) */
  onEvent?: (eventType: string, event: FeishuEventCallback, accountId: string) => Promise<void>;
  /** 日志函数 */
  log?: (msg: string) => void;
}

interface FeishuChannelConfig {
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  accounts?: Record<string, {
    appId: string;
    appSecret: string;
    verificationToken?: string;
    encryptKey?: string;
  }>;
}

function resolveFeishuCallbackConfig(
  cfg: OpenClawConfig,
  accountId?: string
): { appId: string; appSecret: string; verificationToken?: string; encryptKey?: string } | null {
  const feishu = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  if (!feishu) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (feishu.accounts?.[normalizedAccountId]) {
    const account = feishu.accounts[normalizedAccountId];
    return {
      appId: account.appId,
      appSecret: account.appSecret,
      verificationToken: account.verificationToken,
      encryptKey: account.encryptKey,
    };
  }

  // 默认配置
  if (feishu.appId && feishu.appSecret) {
    return {
      appId: feishu.appId,
      appSecret: feishu.appSecret,
      verificationToken: feishu.verificationToken,
      encryptKey: feishu.encryptKey,
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
 * 获取请求头 (不区分大小写)
 */
function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 创建飞书 Webhook 处理器
 */
export function createFeishuWebhookHandler(options: FeishuWebhookOptions) {
  const { config, accountId, path = "/feishu/callback", onMessage, onEvent, log } = options;

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

    const callbackConfig = resolveFeishuCallbackConfig(config, accountId);
    if (!callbackConfig) {
      log?.("Feishu webhook: 未配置回调参数");
      res.statusCode = 500;
      res.end("Configuration Error");
      return true;
    }

    try {
      const rawBody = await readBody(req);
      log?.(`Feishu webhook: 收到回调`);

      // 获取签名相关 headers
      const headers: Record<string, string | undefined> = {
        "x-lark-request-timestamp": getHeader(req, "x-lark-request-timestamp"),
        "x-lark-request-nonce": getHeader(req, "x-lark-request-nonce"),
        "x-lark-signature": getHeader(req, "x-lark-signature"),
      };

      const result = handleEventCallback(
        {
          appId: callbackConfig.appId,
          appSecret: callbackConfig.appSecret,
          verificationToken: callbackConfig.verificationToken,
          encryptKey: callbackConfig.encryptKey,
        },
        headers,
        rawBody
      );

      if (!result.success) {
        log?.(`Feishu webhook: 处理失败 - ${result.error}`);
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ code: 403, msg: result.error }));
        return true;
      }

      // URL 验证 (challenge-response)
      if (result.isUrlVerification && result.challenge) {
        log?.(`Feishu webhook: URL 验证成功`);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ challenge: result.challenge }));
        return true;
      }

      // 消息事件
      if (result.eventType === "im.message.receive_v1" && result.message) {
        if (onMessage) {
          try {
            await onMessage(result.message, accountId ?? "default");
          } catch (err) {
            log?.(`Feishu webhook: 消息处理器错误 - ${String(err)}`);
          }
        }
      } else if (result.eventType && onEvent) {
        // 其他事件
        try {
          const bodyJson = JSON.parse(rawBody) as FeishuEventCallback;
          await onEvent(result.eventType, bodyJson, accountId ?? "default");
        } catch (err) {
          log?.(`Feishu webhook: 事件处理器错误 - ${String(err)}`);
        }
      }

      // 返回成功响应
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, msg: "success" }));
      return true;
    } catch (err) {
      log?.(`Feishu webhook: 处理异常 - ${String(err)}`);
      res.statusCode = 500;
      res.end("Internal Error");
      return true;
    }
  };
}

/**
 * 注册飞书 Webhook 路由 (用于插件系统)
 */
export function registerFeishuWebhook(params: {
  api: {
    registerHttpRoute: (params: {
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    }) => void;
  };
  config: OpenClawConfig;
  accountId?: string;
  path?: string;
  onMessage?: (message: FeishuMessage, accountId: string) => Promise<void>;
  onEvent?: (eventType: string, event: FeishuEventCallback, accountId: string) => Promise<void>;
  log?: (msg: string) => void;
}) {
  const handler = createFeishuWebhookHandler({
    config: params.config,
    accountId: params.accountId,
    path: params.path ?? "/feishu/callback",
    onMessage: params.onMessage,
    onEvent: params.onEvent,
    log: params.log,
  });

  params.api.registerHttpRoute({
    path: params.path ?? "/feishu/callback",
    handler: async (req, res) => {
      await handler(req, res);
    },
  });
}
