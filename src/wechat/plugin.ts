/**
 * 个人微信 (Wechaty) 渠道插件
 * WeChat Personal Channel Plugin via Wechaty
 * 
 * 需要配合 Wechaty HTTP Bridge 服务使用
 * ⚠️ 注意: 使用非官方协议有封号风险
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { WeChatConfig } from "./types.js";
import { wechatOutbound } from "./outbound.js";

export interface WeChatAccountConfig {
  /** Wechaty HTTP Bridge 服务地址 */
  bridgeUrl: string;
  /** API Token (可选) */
  token?: string;
  /** 机器人微信ID */
  selfId?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
}

export interface WeChatChannelConfig {
  /** 默认 Bridge 服务地址 */
  bridgeUrl?: string;
  /** 默认 API Token */
  token?: string;
  /** 机器人微信ID */
  selfId?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, WeChatAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const wechat = cfg.channels?.wechat as WeChatChannelConfig | undefined;
  
  // 检查多账号配置
  const accounts = wechat?.accounts;
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
): { config: WeChatConfig; accountId: string } {
  const wechat = cfg.channels?.wechat as WeChatChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (wechat?.accounts?.[normalizedAccountId]) {
    const account = wechat.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        puppetServerUrl: account.bridgeUrl,
        puppetToken: account.token,
        selfId: account.selfId,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      puppetServerUrl: wechat?.bridgeUrl ?? "",
      puppetToken: wechat?.token,
      selfId: wechat?.selfId,
    },
  };
}

export const wechatPlugin: ChannelPlugin = {
  id: "wechat",
  meta: {
    id: "wechat",
    label: "微信",
    selectionLabel: "微信个人号 (Wechaty)",
    detailLabel: "个人微信机器人",
    docsPath: "/channels/wechat",
    docsLabel: "wechat",
    blurb: "个人微信机器人，通过 Wechaty 框架。⚠️ 使用非官方协议有封号风险。",
    aliases: ["wechaty", "wx"],
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
        bridgeUrl: { type: "string", description: "Wechaty HTTP Bridge 服务地址" },
        token: { type: "string", description: "API Token (可选)" },
        selfId: { type: "string", description: "机器人微信ID" },
        allowFrom: { type: "array", items: { type: "string" }, description: "允许的发送者列表" },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              bridgeUrl: { type: "string" },
              token: { type: "string" },
              selfId: { type: "string" },
              allowFrom: { type: "array", items: { type: "string" } },
            },
            required: ["bridgeUrl"],
          },
        },
      },
    },
    uiHints: {
      bridgeUrl: { label: "Wechaty Bridge 地址", placeholder: "http://127.0.0.1:8788" },
      token: { label: "API Token", sensitive: true, advanced: true },
      selfId: { label: "机器人微信ID", placeholder: "wxid_xxxxxx" },
      allowFrom: { label: "允许的发送者", advanced: true },
      accounts: { label: "多账号配置", advanced: true },
    },
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.puppetServerUrl);
    },
  },
  outbound: wechatOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.puppetServerUrl);
      return {
        configured,
        bridgeUrl: config.puppetServerUrl ? `${config.puppetServerUrl.substring(0, 30)}...` : undefined,
        selfId: config.selfId,
        warning: "⚠️ 非官方协议，有封号风险",
      };
    },
  },
};

export default wechatPlugin;
