import type { ChannelMeta } from "./plugins/types.js";
import type { ChannelId } from "./plugins/types.js";
import { requireActivePluginRegistry } from "../plugins/runtime.js";

// Channel docking: add new core channels here (order + meta + aliases), then
// register the plugin in its extension entrypoint and keep protocol IDs in sync.
//
// OpenClaw CN: 中国渠道 - 企业微信/钉钉/飞书
export const CHAT_CHANNEL_ORDER = [
  "wecom",
  "dingtalk",
  "feishu",
  "googlechat",
] as const;

export type ChatChannelId = (typeof CHAT_CHANNEL_ORDER)[number];

export const CHANNEL_IDS = [...CHAT_CHANNEL_ORDER] as const;

export const DEFAULT_CHAT_CHANNEL: ChatChannelId = "wecom";

export type ChatChannelMeta = ChannelMeta;

const WEBSITE_URL = "https://openclaw.ai";

const CHAT_CHANNEL_META: Record<ChatChannelId, ChannelMeta> = {
  wecom: {
    id: "wecom",
    label: "企业微信",
    selectionLabel: "企业微信 (WeCom)",
    detailLabel: "企业微信应用",
    docsPath: "/channels/wecom",
    docsLabel: "wecom",
    blurb: "企业微信应用机器人，支持自建应用。",
    systemImage: "message.badge",
    selectionDocsPrefix: "文档:",
    selectionExtras: [WEBSITE_URL],
  },
  dingtalk: {
    id: "dingtalk",
    label: "钉钉",
    selectionLabel: "钉钉 (DingTalk)",
    detailLabel: "钉钉机器人",
    docsPath: "/channels/dingtalk",
    docsLabel: "dingtalk",
    blurb: "钉钉企业内部应用或群机器人。",
    systemImage: "bubble.left.and.bubble.right",
  },
  feishu: {
    id: "feishu",
    label: "飞书",
    selectionLabel: "飞书 (Feishu/Lark)",
    detailLabel: "飞书机器人",
    docsPath: "/channels/feishu",
    docsLabel: "feishu",
    blurb: "飞书企业自建应用，支持消息卡片。",
    systemImage: "paperplane",
  },
  googlechat: {
    id: "googlechat",
    label: "Google Chat",
    selectionLabel: "Google Chat (Chat API)",
    detailLabel: "Google Chat",
    docsPath: "/channels/googlechat",
    docsLabel: "googlechat",
    blurb: "Google Workspace Chat app with HTTP webhook.",
    systemImage: "message.badge",
  },
};

export const CHAT_CHANNEL_ALIASES: Record<string, ChatChannelId> = {
  wechat: "wecom",
  "wechat-work": "wecom",
  lark: "feishu",
  "google-chat": "googlechat",
  gchat: "googlechat",
};

const normalizeChannelKey = (raw?: string | null): string | undefined => {
  const normalized = raw?.trim().toLowerCase();
  return normalized || undefined;
};

export function listChatChannels(): ChatChannelMeta[] {
  return CHAT_CHANNEL_ORDER.map((id) => CHAT_CHANNEL_META[id]);
}

export function listChatChannelAliases(): string[] {
  return Object.keys(CHAT_CHANNEL_ALIASES);
}

export function getChatChannelMeta(id: ChatChannelId): ChatChannelMeta {
  return CHAT_CHANNEL_META[id];
}

export function normalizeChatChannelId(raw?: string | null): ChatChannelId | null {
  const normalized = normalizeChannelKey(raw);
  if (!normalized) return null;
  const resolved = CHAT_CHANNEL_ALIASES[normalized] ?? normalized;
  return CHAT_CHANNEL_ORDER.includes(resolved as ChatChannelId)
    ? (resolved as ChatChannelId)
    : null;
}

// Channel docking: prefer this helper in shared code. Importing from
// `src/channels/plugins/*` can eagerly load channel implementations.
export function normalizeChannelId(raw?: string | null): ChatChannelId | null {
  return normalizeChatChannelId(raw);
}

// Normalizes registered channel plugins (bundled or external).
//
// Keep this light: we do not import channel plugins here (those are "heavy" and can pull in
// monitors, web login, etc). The plugin registry must be initialized first.
export function normalizeAnyChannelId(raw?: string | null): ChannelId | null {
  const key = normalizeChannelKey(raw);
  if (!key) return null;

  const registry = requireActivePluginRegistry();
  const hit = registry.channels.find((entry) => {
    const id = String(entry.plugin.id ?? "")
      .trim()
      .toLowerCase();
    if (id && id === key) return true;
    return (entry.plugin.meta.aliases ?? []).some((alias) => alias.trim().toLowerCase() === key);
  });
  return (hit?.plugin.id as ChannelId | undefined) ?? null;
}

export function formatChannelPrimerLine(meta: ChatChannelMeta): string {
  return `${meta.label}: ${meta.blurb}`;
}

export function formatChannelSelectionLine(
  meta: ChatChannelMeta,
  docsLink: (path: string, label?: string) => string,
): string {
  const docsPrefix = meta.selectionDocsPrefix ?? "Docs:";
  const docsLabel = meta.docsLabel ?? meta.id;
  const docs = meta.selectionDocsOmitLabel
    ? docsLink(meta.docsPath)
    : docsLink(meta.docsPath, docsLabel);
  const extras = (meta.selectionExtras ?? []).filter(Boolean).join(" ");
  return `${meta.label} — ${meta.blurb} ${docsPrefix ? `${docsPrefix} ` : ""}${docs}${extras ? ` ${extras}` : ""}`;
}
