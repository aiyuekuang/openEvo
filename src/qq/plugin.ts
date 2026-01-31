/**
 * QQ (OneBot) 渠道插件
 * QQ Channel Plugin via OneBot Protocol
 * 
 * 兼容: go-cqhttp, NapCat, Lagrange, LLOneBot 等
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { QQConfig } from "./types.js";
import { qqOutbound } from "./outbound.js";

export interface QQAccountConfig {
  /** OneBot HTTP API 地址 */
  httpUrl: string;
  /** Access Token (可选) */
  accessToken?: string;
  /** 机器人 QQ 号 */
  selfId?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
}

export interface QQChannelConfig {
  /** 默认 OneBot HTTP API 地址 */
  httpUrl?: string;
  /** 默认 Access Token */
  accessToken?: string;
  /** 机器人 QQ 号 */
  selfId?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, QQAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const qq = cfg.channels?.qq as QQChannelConfig | undefined;
  
  // 检查多账号配置
  const accounts = qq?.accounts;
  if (accounts && typeof accounts === "object") {
    const ids = Object.keys(accounts).filter(Boolean);
    if (ids.length > 0) {
      return ids.sort((a, b) => a.localeCompare(b));
    }
  }

  // 始终返回默认账号
  return ["default"];
}

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null
): { config: QQConfig; accountId: string } {
  const qq = cfg.channels?.qq as QQChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (qq?.accounts?.[normalizedAccountId]) {
    const account = qq.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        httpUrl: account.httpUrl,
        accessToken: account.accessToken,
        selfId: account.selfId,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      httpUrl: qq?.httpUrl ?? "",
      accessToken: qq?.accessToken,
      selfId: qq?.selfId,
    },
  };
}

export const qqPlugin: ChannelPlugin = {
  id: "qq",
  meta: {
    id: "qq",
    label: "QQ",
    selectionLabel: "QQ (OneBot)",
    detailLabel: "QQ 机器人 (OneBot 协议)",
    docsPath: "/channels/qq",
    docsLabel: "qq",
    blurb: "QQ 机器人，通过 OneBot 协议 (go-cqhttp/NapCat/Lagrange)。",
    aliases: ["onebot", "cqhttp", "napcat"],
    order: 101,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  configSchema: {
    schema: {
      type: "object",
      properties: {
        httpUrl: { type: "string", description: "OneBot HTTP API 地址" },
        accessToken: { type: "string", description: "Access Token (可选)" },
        selfId: { type: "string", description: "机器人 QQ 号" },
        allowFrom: { type: "array", items: { type: "string" }, description: "允许的发送者列表" },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              httpUrl: { type: "string" },
              accessToken: { type: "string" },
              selfId: { type: "string" },
              allowFrom: { type: "array", items: { type: "string" } },
            },
            required: ["httpUrl"],
          },
        },
      },
    },
    uiHints: {
      httpUrl: { label: "OneBot HTTP API 地址", placeholder: "http://127.0.0.1:5700" },
      accessToken: { label: "Access Token", sensitive: true, advanced: true },
      selfId: { label: "机器人 QQ 号", placeholder: "123456789" },
      allowFrom: { label: "允许的发送者", advanced: true },
      accounts: { label: "多账号配置", advanced: true },
    },
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.httpUrl);
    },
  },
  outbound: qqOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.httpUrl);
      return {
        configured,
        httpUrl: config.httpUrl ? `${config.httpUrl.substring(0, 30)}...` : undefined,
        selfId: config.selfId,
      };
    },
  },
};

export default qqPlugin;
