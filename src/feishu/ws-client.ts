/**
 * 飞书 WebSocket 长连接客户端
 * Feishu WebSocket Client
 *
 * 使用飞书长连接模式接收消息，无需公网暴露
 * 参考: https://open.feishu.cn/document/server-docs/event-subscription-guide/long-connection-guide
 */

import WebSocket from "ws";
import type { FeishuConfig, FeishuMessage, FeishuEventCallback } from "./types.js";
import { getTenantAccessToken } from "./api.js";
import { handleMessageEvent, decryptEventBody } from "./callback.js";

const WS_ENDPOINT = "wss://open.feishu.cn/open-apis/ws/v2/endpoint";

export interface FeishuWsClientOptions {
  /** 飞书配置 */
  config: FeishuConfig;
  /** 消息处理器 */
  onMessage?: (message: FeishuMessage) => Promise<void>;
  /** 事件处理器 (非消息事件) */
  onEvent?: (eventType: string, event: FeishuEventCallback) => Promise<void>;
  /** 连接成功回调 */
  onConnect?: () => void;
  /** 断开连接回调 */
  onDisconnect?: (code: number, reason: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 日志函数 */
  log?: (msg: string) => void;
  /** 重连间隔 (毫秒) */
  reconnectIntervalMs?: number;
  /** 最大重连次数 (0 表示无限重连) */
  maxReconnectAttempts?: number;
}

export interface FeishuWsClient {
  /** 连接 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): void;
  /** 是否已连接 */
  isConnected(): boolean;
}

/**
 * 创建飞书 WebSocket 客户端
 */
export function createFeishuWsClient(options: FeishuWsClientOptions): FeishuWsClient {
  const {
    config,
    onMessage,
    onEvent,
    onConnect,
    onDisconnect,
    onError,
    log,
    reconnectIntervalMs = 5000,
    maxReconnectAttempts = 0,
  } = options;

  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let shouldReconnect = true;

  /**
   * 获取 WebSocket 连接 URL
   */
  async function getWsUrl(): Promise<string> {
    const accessToken = await getTenantAccessToken(config);
    return `${WS_ENDPOINT}?token=${accessToken}`;
  }

  /**
   * 处理接收到的消息
   */
  async function handleWsMessage(data: string) {
    try {
      let body = JSON.parse(data) as FeishuEventCallback & {
        // WebSocket 协议特有字段
        type?: string;
        // 心跳响应
        pong?: boolean;
      };

      // 心跳响应
      if (body.pong) {
        log?.("Feishu WS: pong received");
        return;
      }

      // 如果消息被加密，先解密
      if (body.encrypt && config.encryptKey) {
        body = decryptEventBody(config, body);
      }

      // URL 验证 (WebSocket 模式下不应该收到，但保险起见)
      if (body.type === "url_verification") {
        log?.("Feishu WS: URL verification received (unexpected in WS mode)");
        return;
      }

      // 处理消息事件
      const eventType = body.header?.event_type;
      if (eventType === "im.message.receive_v1") {
        const result = handleMessageEvent(config, body);
        if (result.success && result.message && onMessage) {
          try {
            await onMessage(result.message);
          } catch (err) {
            log?.(`Feishu WS: message handler error - ${String(err)}`);
          }
        } else if (!result.success) {
          log?.(`Feishu WS: message parse error - ${result.error}`);
        }
      } else if (eventType && onEvent) {
        // 其他事件
        try {
          await onEvent(eventType, body);
        } catch (err) {
          log?.(`Feishu WS: event handler error - ${String(err)}`);
        }
      }
    } catch (err) {
      log?.(`Feishu WS: parse message error - ${String(err)}`);
    }
  }

  /**
   * 启动心跳
   */
  function startHeartbeat() {
    if (pingTimer) {
      clearInterval(pingTimer);
    }
    // 每 30 秒发送一次心跳
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
        log?.("Feishu WS: ping sent");
      }
    }, 30000);
  }

  /**
   * 停止心跳
   */
  function stopHeartbeat() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  /**
   * 调度重连
   */
  function scheduleReconnect() {
    if (!shouldReconnect) {
      return;
    }

    if (maxReconnectAttempts > 0 && reconnectAttempts >= maxReconnectAttempts) {
      log?.(`Feishu WS: max reconnect attempts (${maxReconnectAttempts}) reached`);
      return;
    }

    reconnectAttempts++;
    const delay = Math.min(reconnectIntervalMs * Math.pow(1.5, reconnectAttempts - 1), 60000);
    log?.(`Feishu WS: reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(async () => {
      try {
        await connect();
      } catch (err) {
        log?.(`Feishu WS: reconnect failed - ${String(err)}`);
        scheduleReconnect();
      }
    }, delay);
  }

  /**
   * 连接 WebSocket
   */
  async function connect(): Promise<void> {
    if (ws && ws.readyState === WebSocket.OPEN) {
      log?.("Feishu WS: already connected");
      return;
    }

    shouldReconnect = true;

    try {
      const url = await getWsUrl();
      log?.("Feishu WS: connecting...");

      ws = new WebSocket(url);

      ws.on("open", () => {
        log?.("Feishu WS: connected");
        reconnectAttempts = 0;
        startHeartbeat();
        onConnect?.();
      });

      ws.on("message", (data: WebSocket.Data) => {
        const msg = typeof data === "string" ? data : data.toString();
        handleWsMessage(msg).catch((err) => {
          log?.(`Feishu WS: handle message error - ${String(err)}`);
        });
      });

      ws.on("close", (code: number, reason: Buffer) => {
        log?.(`Feishu WS: disconnected (code=${code}, reason=${reason.toString()})`);
        stopHeartbeat();
        onDisconnect?.(code, reason.toString());
        scheduleReconnect();
      });

      ws.on("error", (err: Error) => {
        log?.(`Feishu WS: error - ${err.message}`);
        onError?.(err);
      });
    } catch (err) {
      log?.(`Feishu WS: connect failed - ${String(err)}`);
      throw err;
    }
  }

  /**
   * 断开连接
   */
  function disconnect(): void {
    shouldReconnect = false;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stopHeartbeat();

    if (ws) {
      ws.close();
      ws = null;
    }

    log?.("Feishu WS: disconnected manually");
  }

  /**
   * 是否已连接
   */
  function isConnected(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    disconnect,
    isConnected,
  };
}

export default createFeishuWsClient;
