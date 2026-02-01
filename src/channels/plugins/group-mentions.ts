import type { OpenClawConfig } from "../../config/config.js";
import {
  resolveChannelGroupRequireMention,
  resolveChannelGroupToolsPolicy,
} from "../../config/group-policy.js";
import type { GroupToolPolicyConfig } from "../../config/types.tools.js";

type GroupMentionParams = {
  cfg: OpenClawConfig;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GroupMentionParams): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}

export function resolveGoogleChatGroupToolPolicy(
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  return resolveChannelGroupToolsPolicy({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
}
