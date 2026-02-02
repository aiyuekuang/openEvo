/**
 * QQ 官方机器人渠道插件
 * QQ Official Bot Channel Plugin
 *
 * 基于 QQ 开放平台官方 API
 * https://bot.q.qq.com/wiki/develop/api/
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { QQBotConfig } from "./types.js";
import { qqbotOutbound } from "./outbound.js";

export interface QQBotAccountConfig {
  /** 机器人 AppID */
  appId: string;
  /** 机器人 AppSecret */
  appSecret: string;
  /** 是否为沙箱环境 */
  sandbox?: boolean;
  /** 回调 Token */
  token?: string;
  /** 允许的发送者列表 (openid) */
  allowFrom?: string[];
}

export interface QQBotChannelConfig {
  /** 默认 AppID */
  appId?: string;
  /** 默认 AppSecret */
  appSecret?: string;
  /** 是否为沙箱环境 */
  sandbox?: boolean;
  /** 回调 Token */
  token?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, QQBotAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const qqbot = cfg.channels?.qqbot as QQBotChannelConfig | undefined;

  // 检查多账号配置
  const accounts = qqbot?.accounts;
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
): { config: QQBotConfig; accountId: string } {
  const qqbot = cfg.channels?.qqbot as QQBotChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (qqbot?.accounts?.[normalizedAccountId]) {
    const account = qqbot.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        appId: account.appId,
        appSecret: account.appSecret,
        sandbox: account.sandbox,
        token: account.token,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      appId: qqbot?.appId ?? "",
      appSecret: qqbot?.appSecret ?? "",
      sandbox: qqbot?.sandbox,
      token: qqbot?.token,
    },
  };
}

export const qqbotPlugin: ChannelPlugin = {
  id: "qqbot",
  meta: {
    id: "qqbot",
    label: "QQ 机器人",
    selectionLabel: "QQ 机器人 (官方)",
    detailLabel: "QQ 官方机器人 (QQ 开放平台)",
    docsPath: "/channels/qqbot",
    docsLabel: "qqbot",
    blurb: "QQ 官方机器人，通过 QQ 开放平台 API。支持频道、群聊、私聊场景。",
    aliases: ["qq-official", "qq-openplatform"],
    order: 102,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  configSchema: {
    schema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "机器人 AppID" },
        appSecret: { type: "string", description: "机器人 AppSecret" },
        sandbox: { type: "boolean", description: "是否为沙箱环境" },
        token: { type: "string", description: "回调 Token" },
        allowFrom: {
          type: "array",
          items: { type: "string" },
          description: "允许的发送者列表 (openid)",
        },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              appId: { type: "string" },
              appSecret: { type: "string" },
              sandbox: { type: "boolean" },
              token: { type: "string" },
              allowFrom: { type: "array", items: { type: "string" } },
            },
            required: ["appId", "appSecret"],
          },
        },
      },
    },
    uiHints: {
      appId: { label: "机器人 AppID", placeholder: "102012345" },
      appSecret: { label: "机器人 AppSecret", sensitive: true },
      sandbox: { label: "沙箱环境", advanced: true },
      token: { label: "回调 Token", advanced: true },
      allowFrom: { label: "允许的发送者", advanced: true },
      accounts: { label: "多账号配置", advanced: true },
    },
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.appId && account.config.appSecret);
    },
  },
  outbound: qqbotOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.appId && config.appSecret);
      return {
        configured,
        appId: config.appId
          ? `${config.appId.substring(0, 8)}...`
          : undefined,
        sandbox: config.sandbox,
      };
    },
  },
};

export default qqbotPlugin;
