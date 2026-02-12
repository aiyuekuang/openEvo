/**
 * Configuration Constants
 * 配置常量
 */

export const PORTS = {
  /** OpenClaw Gateway WebSocket port */
  OPENCLAW_GATEWAY: 18789,
  /** OpenClaw Control UI port */
  OPENCLAW_CONTROL_UI: 18790,
} as const;

export const TIMEOUTS = {
  /** Gateway startup timeout (ms) */
  GATEWAY_START: 120000,
  /** Gateway health check interval (ms) */
  HEALTH_CHECK: 30000,
  /** WebSocket ping interval (ms) */
  PING: 30000,
  /** RPC request timeout (ms) */
  RPC: 30000,
} as const;
