/**
 * 钉钉渠道插件
 * DingTalk Channel Plugin
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { DingTalkConfig } from "./types.js";
import { dingtalkOutbound } from "./outbound.js";

export interface DingTalkAccountConfig {
  /** 应用 AppKey */
  appKey: string;
  /** 应用 AppSecret */
  appSecret: string;
  /** 机器人 Webhook URL */
  webhookUrl?: string;
  /** 机器人加签密钥 */
  signSecret?: string;
  /** 回调 Token */
  token?: string;
  /** 回调 AES Key */
  aesKey?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
}

export interface DingTalkChannelConfig {
  /** 默认账号配置 */
  appKey?: string;
  appSecret?: string;
  webhookUrl?: string;
  signSecret?: string;
  token?: string;
  aesKey?: string;
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, DingTalkAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const dingtalk = cfg.channels?.dingtalk as DingTalkChannelConfig | undefined;
  if (!dingtalk) return [];

  const ids = new Set<string>();

  // 检查默认配置
  if (dingtalk.appKey && dingtalk.appSecret) {
    ids.add("default");
  }

  // 检查多账号配置
  if (dingtalk.accounts) {
    for (const accountId of Object.keys(dingtalk.accounts)) {
      const account = dingtalk.accounts[accountId];
      if (account?.appKey && account?.appSecret) {
        ids.add(normalizeAccountId(accountId));
      }
    }
  }

  return Array.from(ids);
}

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null
): { config: DingTalkConfig; accountId: string } {
  const dingtalk = cfg.channels?.dingtalk as DingTalkChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (dingtalk?.accounts?.[normalizedAccountId]) {
    const account = dingtalk.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        appKey: account.appKey,
        appSecret: account.appSecret,
        webhookUrl: account.webhookUrl,
        signSecret: account.signSecret,
        token: account.token,
        aesKey: account.aesKey,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      appKey: dingtalk?.appKey ?? "",
      appSecret: dingtalk?.appSecret ?? "",
      webhookUrl: dingtalk?.webhookUrl,
      signSecret: dingtalk?.signSecret,
      token: dingtalk?.token,
      aesKey: dingtalk?.aesKey,
    },
  };
}

export const dingtalkPlugin: ChannelPlugin = {
  id: "dingtalk",
  meta: {
    id: "dingtalk",
    label: "钉钉",
    selectionLabel: "钉钉 (DingTalk)",
    detailLabel: "钉钉机器人",
    docsPath: "/channels/dingtalk",
    docsLabel: "dingtalk",
    blurb: "钉钉企业内部应用或群机器人。",
    aliases: ["ding", "dd"],
    order: 101,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.appKey && account.config.appSecret);
    },
  },
  outbound: dingtalkOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.appKey && config.appSecret);
      return {
        configured,
        hasWebhook: Boolean(config.webhookUrl),
        appKey: config.appKey ? `${config.appKey.substring(0, 8)}...` : undefined,
      };
    },
  },
};

export default dingtalkPlugin;
