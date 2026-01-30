/**
 * 企业微信渠道插件
 * WeCom Channel Plugin
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { WeComConfig } from "./types.js";
import { wecomOutbound } from "./outbound.js";

export interface WeComAccountConfig {
  /** 企业ID */
  corpId: string;
  /** 应用 AgentId */
  agentId: number | string;
  /** 应用 Secret */
  secret: string;
  /** 回调 Token */
  token?: string;
  /** 回调 EncodingAESKey */
  encodingAesKey?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
}

export interface WeComChannelConfig {
  /** 默认账号配置 */
  corpId?: string;
  agentId?: number | string;
  secret?: string;
  token?: string;
  encodingAesKey?: string;
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, WeComAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const wecom = cfg.channels?.wecom as WeComChannelConfig | undefined;
  if (!wecom) return [];

  const ids = new Set<string>();

  // 检查默认配置
  if (wecom.corpId && wecom.agentId && wecom.secret) {
    ids.add("default");
  }

  // 检查多账号配置
  if (wecom.accounts) {
    for (const accountId of Object.keys(wecom.accounts)) {
      const account = wecom.accounts[accountId];
      if (account?.corpId && account?.agentId && account?.secret) {
        ids.add(normalizeAccountId(accountId));
      }
    }
  }

  return Array.from(ids);
}

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null
): { config: WeComConfig; accountId: string } {
  const wecom = cfg.channels?.wecom as WeComChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (wecom?.accounts?.[normalizedAccountId]) {
    const account = wecom.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        corpId: account.corpId,
        agentId: Number(account.agentId),
        secret: account.secret,
        token: account.token,
        encodingAESKey: account.encodingAesKey,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      corpId: wecom?.corpId ?? "",
      agentId: Number(wecom?.agentId ?? 0),
      secret: wecom?.secret ?? "",
      token: wecom?.token,
      encodingAESKey: wecom?.encodingAesKey,
    },
  };
}

export const wecomPlugin: ChannelPlugin = {
  id: "wecom",
  meta: {
    id: "wecom",
    label: "企业微信",
    selectionLabel: "企业微信 (WeCom)",
    detailLabel: "企业微信应用",
    docsPath: "/channels/wecom",
    docsLabel: "wecom",
    blurb: "企业微信应用消息机器人。",
    aliases: ["wechat-work", "wxwork"],
    order: 100,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.corpId && account.config.agentId && account.config.secret);
    },
  },
  outbound: wecomOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.corpId && config.agentId && config.secret);
      return {
        configured,
        corpId: config.corpId ? `${config.corpId.substring(0, 8)}...` : undefined,
        agentId: config.agentId,
      };
    },
  },
};

export default wecomPlugin;
