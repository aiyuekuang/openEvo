import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

// OpenClaw CN: 移除海外渠道 send deps
// 中国渠道 (wecom, dingtalk, feishu) 将通过插件注册
export type CliDeps = Record<string, never>;

export function createOutboundSendDeps(_deps: CliDeps): OutboundSendDeps {
  return {};
}
