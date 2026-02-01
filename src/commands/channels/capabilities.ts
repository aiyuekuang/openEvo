import { getChannelPlugin, listChannelPlugins } from "../../channels/plugins/index.js";
import { resolveChannelDefaultAccountId } from "../../channels/plugins/helpers.js";
import type { ChannelCapabilities, ChannelPlugin } from "../../channels/plugins/types.js";
// OpenClaw CN: 移除海外渠道 imports (discord, slack)
import { danger } from "../../globals.js";
import type { OpenClawConfig } from "../../config/config.js";
import { defaultRuntime, type RuntimeEnv } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { formatChannelAccountLabel, requireValidConfig } from "./shared.js";

export type ChannelsCapabilitiesOptions = {
  channel?: string;
  account?: string;
  target?: string;
  timeout?: string;
  json?: boolean;
};

// OpenClaw CN: 移除 Discord/Slack 相关类型定义

type ChannelCapabilitiesReport = {
  channel: string;
  accountId: string;
  accountName?: string;
  configured?: boolean;
  enabled?: boolean;
  support?: ChannelCapabilities;
  actions?: string[];
  probe?: unknown;
};

// OpenClaw CN: 移除 REQUIRED_DISCORD_PERMISSIONS

const TEAMS_GRAPH_PERMISSION_HINTS: Record<string, string> = {
  "ChannelMessage.Read.All": "channel history",
  "Chat.Read.All": "chat history",
  "Channel.ReadBasic.All": "channel list",
  "Team.ReadBasic.All": "team list",
  "TeamsActivity.Read.All": "teams activity",
  "Sites.Read.All": "files (SharePoint)",
  "Files.Read.All": "files (OneDrive)",
};

function normalizeTimeout(raw: unknown, fallback = 10_000) {
  const value = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function formatSupport(capabilities?: ChannelCapabilities) {
  if (!capabilities) return "unknown";
  const bits: string[] = [];
  if (capabilities.chatTypes?.length) {
    bits.push(`chatTypes=${capabilities.chatTypes.join(",")}`);
  }
  if (capabilities.polls) bits.push("polls");
  if (capabilities.reactions) bits.push("reactions");
  if (capabilities.edit) bits.push("edit");
  if (capabilities.unsend) bits.push("unsend");
  if (capabilities.reply) bits.push("reply");
  if (capabilities.effects) bits.push("effects");
  if (capabilities.groupManagement) bits.push("groupManagement");
  if (capabilities.threads) bits.push("threads");
  if (capabilities.media) bits.push("media");
  if (capabilities.nativeCommands) bits.push("nativeCommands");
  if (capabilities.blockStreaming) bits.push("blockStreaming");
  return bits.length ? bits.join(" ") : "none";
}

// OpenClaw CN: 移除 Discord 相关函数 (summarizeDiscordTarget, formatDiscordIntents)

function formatProbeLines(channelId: string, probe: unknown): string[] {
  const lines: string[] = [];
  if (!probe || typeof probe !== "object") return lines;
  const probeObj = probe as Record<string, unknown>;

  // OpenClaw CN: 移除 discord, telegram, slack, signal 的 probe 处理
  // 保留 msteams (可能用于参考)
  if (channelId === "msteams") {
    const appId = typeof probeObj.appId === "string" ? probeObj.appId.trim() : "";
    if (appId) lines.push(`App: ${theme.accent(appId)}`);
    const graph = probeObj.graph as
      | { ok?: boolean; roles?: unknown; scopes?: unknown; error?: string }
      | undefined;
    if (graph) {
      const roles = Array.isArray(graph.roles)
        ? graph.roles.map((role) => String(role).trim()).filter(Boolean)
        : [];
      const scopes =
        typeof graph.scopes === "string"
          ? graph.scopes
              .split(/\s+/)
              .map((scope) => scope.trim())
              .filter(Boolean)
          : Array.isArray(graph.scopes)
            ? graph.scopes.map((scope) => String(scope).trim()).filter(Boolean)
            : [];
      if (graph.ok === false) {
        lines.push(`Graph: ${theme.error(graph.error ?? "failed")}`);
      } else if (roles.length > 0 || scopes.length > 0) {
        const formatPermission = (permission: string) => {
          const hint = TEAMS_GRAPH_PERMISSION_HINTS[permission];
          return hint ? `${permission} (${hint})` : permission;
        };
        if (roles.length > 0) {
          lines.push(`Graph roles: ${roles.map(formatPermission).join(", ")}`);
        }
        if (scopes.length > 0) {
          lines.push(`Graph scopes: ${scopes.map(formatPermission).join(", ")}`);
        }
      } else if (graph.ok === true) {
        lines.push("Graph: ok");
      }
    }
  }

  // 企业微信 (WeCom)
  if (channelId === "wecom") {
    const corpId = typeof probeObj.corpId === "string" ? probeObj.corpId.trim() : "";
    if (corpId) lines.push(`企业ID: ${theme.accent(corpId)}`);
    const agentId = typeof probeObj.agentId === "number" ? probeObj.agentId : undefined;
    if (agentId !== undefined) lines.push(`应用ID: ${theme.accent(String(agentId))}`);
    const tokenValid = typeof probeObj.tokenValid === "boolean" ? probeObj.tokenValid : undefined;
    if (tokenValid === true) lines.push(`Token: ${theme.success("有效")}`);
    if (tokenValid === false) lines.push(`Token: ${theme.error("无效或过期")}`);
  }

  // 钉钉 (DingTalk)
  if (channelId === "dingtalk") {
    const appKey = typeof probeObj.appKey === "string" ? probeObj.appKey.trim() : "";
    if (appKey) lines.push(`AppKey: ${theme.accent(appKey)}`);
    const robotCode = typeof probeObj.robotCode === "string" ? probeObj.robotCode.trim() : "";
    if (robotCode) lines.push(`机器人Code: ${theme.accent(robotCode)}`);
    const tokenValid = typeof probeObj.tokenValid === "boolean" ? probeObj.tokenValid : undefined;
    if (tokenValid === true) lines.push(`Token: ${theme.success("有效")}`);
    if (tokenValid === false) lines.push(`Token: ${theme.error("无效或过期")}`);
  }

  // 飞书 (Feishu)
  if (channelId === "feishu") {
    const appId = typeof probeObj.appId === "string" ? probeObj.appId.trim() : "";
    if (appId) lines.push(`AppID: ${theme.accent(appId)}`);
    const tenantKey = typeof probeObj.tenantKey === "string" ? probeObj.tenantKey.trim() : "";
    if (tenantKey) lines.push(`租户: ${theme.accent(tenantKey)}`);
    const tokenValid = typeof probeObj.tokenValid === "boolean" ? probeObj.tokenValid : undefined;
    if (tokenValid === true) lines.push(`Token: ${theme.success("有效")}`);
    if (tokenValid === false) lines.push(`Token: ${theme.error("无效或过期")}`);
  }

  const ok = typeof probeObj.ok === "boolean" ? probeObj.ok : undefined;
  if (ok === true && lines.length === 0) {
    lines.push("Probe: ok");
  }
  if (ok === false) {
    const error =
      typeof probeObj.error === "string" && probeObj.error ? ` (${probeObj.error})` : "";
    lines.push(`Probe: ${theme.error(`failed${error}`)}`);
  }
  return lines;
}

// OpenClaw CN: 移除 buildDiscordPermissions 函数

async function resolveChannelReports(params: {
  plugin: ChannelPlugin;
  cfg: OpenClawConfig;
  timeoutMs: number;
  accountOverride?: string;
  target?: string;
}): Promise<ChannelCapabilitiesReport[]> {
  const { plugin, cfg, timeoutMs } = params;
  const accountIds = params.accountOverride
    ? [params.accountOverride]
    : (() => {
        const ids = plugin.config.listAccountIds(cfg);
        return ids.length > 0
          ? ids
          : [resolveChannelDefaultAccountId({ plugin, cfg, accountIds: ids })];
      })();
  const reports: ChannelCapabilitiesReport[] = [];
  const listedActions = plugin.actions?.listActions?.({ cfg }) ?? [];
  const actions = Array.from(
    new Set<string>(["send", "broadcast", ...listedActions.map((action) => String(action))]),
  );

  for (const accountId of accountIds) {
    const resolvedAccount = plugin.config.resolveAccount(cfg, accountId);
    const configured = plugin.config.isConfigured
      ? await plugin.config.isConfigured(resolvedAccount, cfg)
      : Boolean(resolvedAccount);
    const enabled = plugin.config.isEnabled
      ? plugin.config.isEnabled(resolvedAccount, cfg)
      : (resolvedAccount as { enabled?: boolean }).enabled !== false;
    let probe: unknown;
    if (configured && enabled && plugin.status?.probeAccount) {
      try {
        probe = await plugin.status.probeAccount({
          account: resolvedAccount,
          timeoutMs,
          cfg,
        });
      } catch (err) {
        probe = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // OpenClaw CN: 移除 slack/discord 特有处理

    reports.push({
      channel: plugin.id,
      accountId,
      accountName:
        typeof (resolvedAccount as { name?: string }).name === "string"
          ? (resolvedAccount as { name?: string }).name?.trim() || undefined
          : undefined,
      configured,
      enabled,
      support: plugin.capabilities,
      probe,
      actions,
    });
  }
  return reports;
}

export async function channelsCapabilitiesCommand(
  opts: ChannelsCapabilitiesOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) return;
  const timeoutMs = normalizeTimeout(opts.timeout, 10_000);
  const rawChannel = typeof opts.channel === "string" ? opts.channel.trim().toLowerCase() : "";
  const rawTarget = typeof opts.target === "string" ? opts.target.trim() : "";

  if (opts.account && (!rawChannel || rawChannel === "all")) {
    runtime.error(danger("--account requires a specific --channel."));
    runtime.exit(1);
    return;
  }
  // OpenClaw CN: 移除 discord target 验证
  void rawTarget;

  const plugins = listChannelPlugins();
  const selected =
    !rawChannel || rawChannel === "all"
      ? plugins
      : (() => {
          const plugin = getChannelPlugin(rawChannel);
          if (!plugin) return null;
          return [plugin];
        })();

  if (!selected || selected.length === 0) {
    runtime.error(danger(`Unknown channel "${rawChannel}".`));
    runtime.exit(1);
    return;
  }

  const reports: ChannelCapabilitiesReport[] = [];
  for (const plugin of selected) {
    const accountOverride = opts.account?.trim() || undefined;
    reports.push(
      ...(await resolveChannelReports({
        plugin,
        cfg,
        timeoutMs,
        accountOverride,
      })),
    );
  }

  if (opts.json) {
    runtime.log(JSON.stringify({ channels: reports }, null, 2));
    return;
  }

  const lines: string[] = [];
  for (const report of reports) {
    const label = formatChannelAccountLabel({
      channel: report.channel,
      accountId: report.accountId,
      name: report.accountName,
      channelStyle: theme.accent,
      accountStyle: theme.heading,
    });
    lines.push(theme.heading(label));
    lines.push(`Support: ${formatSupport(report.support)}`);
    if (report.actions && report.actions.length > 0) {
      lines.push(`Actions: ${report.actions.join(", ")}`);
    }
    if (report.configured === false || report.enabled === false) {
      const configuredLabel = report.configured === false ? "not configured" : "configured";
      const enabledLabel = report.enabled === false ? "disabled" : "enabled";
      lines.push(`Status: ${configuredLabel}, ${enabledLabel}`);
    }
    const probeLines = formatProbeLines(report.channel, report.probe);
    if (probeLines.length > 0) {
      lines.push(...probeLines);
    } else if (report.configured && report.enabled) {
      lines.push(theme.muted("Probe: unavailable"));
    }
    // OpenClaw CN: 移除 slack/discord 特有报告输出
    lines.push("");
  }

  runtime.log(lines.join("\n").trimEnd());
}
