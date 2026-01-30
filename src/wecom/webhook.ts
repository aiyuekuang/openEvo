/**
 * 企业微信 Webhook 回调处理
 * WeCom Webhook Handler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import type { WeComConfig, WeComMessage } from "./types.js";
import { handleCallback } from "./callback.js";

export interface WeComWebhookOptions {
  /** 配置 */
  config: OpenClawConfig;
  /** 账号 ID */
  accountId?: string;
  /** 回调路径 */
  path?: string;
  /** 消息处理器 */
  onMessage?: (message: WeComMessage, accountId: string) => Promise<void>;
  /** 日志函数 */
  log?: (msg: string) => void;
}

interface WeComChannelConfig {
  corpId?: string;
  agentId?: number | string;
  secret?: string;
  token?: string;
  encodingAesKey?: string;
  accounts?: Record<string, {
    corpId: string;
    agentId: number | string;
    secret: string;
    token?: string;
    encodingAesKey?: string;
  }>;
}

function resolveWeComCallbackConfig(
  cfg: OpenClawConfig,
  accountId?: string
): { corpId: string; token: string; encodingAesKey: string } | null {
  const wecom = cfg.channels?.wecom as WeComChannelConfig | undefined;
  if (!wecom) return null;

  const normalizedAccountId = (accountId ?? "default").trim().toLowerCase() || "default";

  // 尝试多账号配置
  if (wecom.accounts?.[normalizedAccountId]) {
    const account = wecom.accounts[normalizedAccountId];
    if (account.corpId && account.token && account.encodingAesKey) {
      return {
        corpId: account.corpId,
        token: account.token,
        encodingAesKey: account.encodingAesKey,
      };
    }
  }

  // 默认配置
  if (wecom.corpId && wecom.token && wecom.encodingAesKey) {
    return {
      corpId: wecom.corpId,
      token: wecom.token,
      encodingAesKey: wecom.encodingAesKey,
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
 * 创建企业微信 Webhook 处理器
 */
export function createWeComWebhookHandler(options: WeComWebhookOptions) {
  const { config, accountId, path = "/wecom/callback", onMessage, log } = options;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? "";
    const pathname = url.split("?")[0];

    // 检查路径是否匹配
    if (pathname !== path) {
      return false;
    }

    const callbackConfig = resolveWeComCallbackConfig(config, accountId);
    if (!callbackConfig) {
      log?.("WeCom webhook: 未配置回调参数 (token/encodingAesKey)");
      res.statusCode = 500;
      res.end("Configuration Error");
      return true;
    }

    const query = parseQuery(url);
    const { msg_signature, timestamp, nonce, echostr } = query;

    // GET 请求: URL 验证
    if (req.method === "GET") {
      if (!echostr) {
        res.statusCode = 400;
        res.end("Missing echostr");
        return true;
      }

      const callbackCfg: WeComConfig = {
        corpId: callbackConfig.corpId,
        agentId: 0, // 回调验证不需要
        secret: "", // 回调验证不需要
        token: callbackConfig.token,
        encodingAESKey: callbackConfig.encodingAesKey,
      };
      const result = handleCallback(callbackCfg, { msg_signature, timestamp, nonce, echostr });

      if (result.success) {
        log?.(`WeCom webhook: URL 验证成功`);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain");
        res.end(result.echostr);
      } else {
        log?.(`WeCom webhook: URL 验证失败 - ${result.error}`);
        res.statusCode = 403;
        res.end(result.error);
      }
      return true;
    }

    // POST 请求: 消息回调
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        log?.(`WeCom webhook: 收到消息回调`);

        const callbackCfg: WeComConfig = {
          corpId: callbackConfig.corpId,
          agentId: 0, // 回调处理不需要
          secret: "", // 回调处理不需要
          token: callbackConfig.token,
          encodingAESKey: callbackConfig.encodingAesKey,
        };
        const result = handleCallback(callbackCfg, { msg_signature, timestamp, nonce }, body);

        if (!result.success) {
          log?.(`WeCom webhook: 消息处理失败 - ${result.error}`);
          res.statusCode = 403;
          res.end(result.error);
          return true;
        }

        // 处理消息
        if (result.message && onMessage) {
          try {
            await onMessage(result.message, accountId ?? "default");
          } catch (err) {
            log?.(`WeCom webhook: 消息处理器错误 - ${String(err)}`);
          }
        }

        // 返回成功响应
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain");
        res.end("success");
        return true;
      } catch (err) {
        log?.(`WeCom webhook: 处理异常 - ${String(err)}`);
        res.statusCode = 500;
        res.end("Internal Error");
        return true;
      }
    }

    // 其他方法不处理
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return true;
  };
}

/**
 * 注册企业微信 Webhook 路由 (用于插件系统)
 */
export function registerWeComWebhook(params: {
  api: {
    registerHttpRoute: (params: {
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    }) => void;
  };
  config: OpenClawConfig;
  accountId?: string;
  path?: string;
  onMessage?: (message: WeComMessage, accountId: string) => Promise<void>;
  log?: (msg: string) => void;
}) {
  const handler = createWeComWebhookHandler({
    config: params.config,
    accountId: params.accountId,
    path: params.path ?? "/wecom/callback",
    onMessage: params.onMessage,
    log: params.log,
  });

  params.api.registerHttpRoute({
    path: params.path ?? "/wecom/callback",
    handler: async (req, res) => {
      await handler(req, res);
    },
  });
}
