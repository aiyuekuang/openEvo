/**
 * 飞书渠道插件
 * Feishu (Lark) Channel Plugin
 */

import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { FeishuConfig } from "./types.js";
import { feishuOutbound } from "./outbound.js";

export interface FeishuAccountConfig {
  /** 应用 App ID */
  appId: string;
  /** 应用 App Secret */
  appSecret: string;
  /** 事件订阅 Verification Token */
  verificationToken?: string;
  /** 事件订阅 Encrypt Key */
  encryptKey?: string;
  /** 允许的发送者列表 */
  allowFrom?: string[];
}

export interface FeishuChannelConfig {
  /** 默认账号配置 */
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  allowFrom?: string[];
  /** 多账号配置 */
  accounts?: Record<string, FeishuAccountConfig>;
}

function normalizeAccountId(accountId?: string | null): string {
  return (accountId ?? "default").trim().toLowerCase() || "default";
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const feishu = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  if (!feishu) return [];

  const ids = new Set<string>();

  // 检查默认配置
  if (feishu.appId && feishu.appSecret) {
    ids.add("default");
  }

  // 检查多账号配置
  if (feishu.accounts) {
    for (const accountId of Object.keys(feishu.accounts)) {
      const account = feishu.accounts[accountId];
      if (account?.appId && account?.appSecret) {
        ids.add(normalizeAccountId(accountId));
      }
    }
  }

  return Array.from(ids);
}

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null
): { config: FeishuConfig; accountId: string } {
  const feishu = cfg.channels?.feishu as FeishuChannelConfig | undefined;
  const normalizedAccountId = normalizeAccountId(accountId);

  // 尝试获取指定账号
  if (feishu?.accounts?.[normalizedAccountId]) {
    const account = feishu.accounts[normalizedAccountId];
    return {
      accountId: normalizedAccountId,
      config: {
        appId: account.appId,
        appSecret: account.appSecret,
        verificationToken: account.verificationToken,
        encryptKey: account.encryptKey,
      },
    };
  }

  // 回退到默认配置
  return {
    accountId: "default",
    config: {
      appId: feishu?.appId ?? "",
      appSecret: feishu?.appSecret ?? "",
      verificationToken: feishu?.verificationToken,
      encryptKey: feishu?.encryptKey,
    },
  };
}

export const feishuPlugin: ChannelPlugin = {
  id: "feishu",
  meta: {
    id: "feishu",
    label: "飞书",
    selectionLabel: "飞书 (Feishu/Lark)",
    detailLabel: "飞书机器人",
    docsPath: "/channels/feishu",
    docsLabel: "feishu",
    blurb: "飞书企业自建应用机器人。",
    aliases: ["lark"],
    order: 102,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    isConfigured: async (account) => {
      return Boolean(account.config.appId && account.config.appSecret);
    },
  },
  outbound: feishuOutbound,
  status: {
    buildChannelSummary: async (params) => {
      const { config } = params.account;
      const configured = Boolean(config.appId && config.appSecret);
      return {
        configured,
        appId: config.appId ? `${config.appId.substring(0, 8)}...` : undefined,
        hasEncryption: Boolean(config.encryptKey),
      };
    },
  },
};

export default feishuPlugin;
