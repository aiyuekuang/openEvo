import { loadOrCreateDeviceIdentity, signDevicePayload } from './device-identity';

type GatewayEventHandler = (event: string, payload: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// 构建设备认证 payload
function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? 'v2' : 'v1';
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === 'v2') {
    base.push(params.nonce ?? '');
  }
  return base.join('|');
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: GatewayEventHandler[] = [];
  private reconnectTimer: number | null = null;
  private connectNonce: string | null = null;
  private isConnecting = false;
  private connectSent = false;
  private onConnectedCallback?: () => void;
  private onErrorCallback?: (err: Error) => void;
  private connectionTimeout?: ReturnType<typeof setTimeout>;
  
  constructor(
    private url: string,
    private token?: string
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this.connectSent = false;
      this.onConnectedCallback = resolve;
      this.onErrorCallback = reject;
      this.ws = new WebSocket(this.url);

      this.connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.onopen = () => {
        // 等待 connect.challenge 事件
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        this.isConnecting = false;
        this.scheduleReconnect();
      };
    });
  }

  private handleMessage(data: string) {
    try {
      const frame = JSON.parse(data);

      // 处理连接挑战
      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        this.connectNonce = frame.payload?.nonce;
        void this.sendConnect();
        return;
      }

      // 处理 hello-ok
      if (frame.type === 'res' && frame.id === 'connect') {
        if (frame.ok) {
          this.isConnecting = false;
          if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
          this.onConnectedCallback?.();
        } else {
          if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
          this.onErrorCallback?.(new Error(frame.error?.message || 'Connect failed'));
        }
        return;
      }

      // 处理普通响应
      if (frame.type === 'res') {
        const pending = this.pending.get(frame.id);
        if (pending) {
          this.pending.delete(frame.id);
          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            pending.reject(new Error(frame.error?.message || 'Request failed'));
          }
        }
        return;
      }

      // 处理事件
      if (frame.type === 'event') {
        this.eventHandlers.forEach((handler) => {
          try {
            handler(frame.event, frame.payload);
          } catch (e) {
            console.error('Event handler error:', e);
          }
        });
      }
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }

  private async sendConnect() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.connectSent) return;
    this.connectSent = true;

    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing'];
    const role = 'operator';
    const clientId = 'openclaw-control-ui';
    const clientMode = 'webchat';

    // 检查是否在安全上下文中（crypto.subtle 只在 HTTPS 或 localhost 可用）
    const isSecureContext = typeof crypto !== 'undefined' && !!crypto.subtle;

    let device: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce: string | undefined;
    } | undefined;

    if (isSecureContext) {
      try {
        const deviceIdentity = await loadOrCreateDeviceIdentity();
        const signedAtMs = Date.now();
        const nonce = this.connectNonce ?? undefined;
        const payload = buildDeviceAuthPayload({
          deviceId: deviceIdentity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: this.token ?? null,
          nonce,
        });
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce,
        };
      } catch (e) {
        console.error('Failed to create device identity:', e);
      }
    }

    const frame = {
      type: 'req',
      id: 'connect',
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          version: '1.0.0',
          platform: navigator.platform || 'web',
          mode: clientMode,
        },
        role,
        scopes,
        device,
        caps: [],
        auth: this.token ? { token: this.token } : undefined,
        userAgent: navigator.userAgent,
        locale: navigator.language,
      },
    };

    this.ws.send(JSON.stringify(frame));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, 3000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  onEvent(handler: GatewayEventHandler) {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = crypto.randomUUID();
    const frame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  // 便捷方法
  async getHealth() {
    return this.request('health');
  }

  async getConfig() {
    return this.request('config.get');
  }

  async setConfig(config: unknown) {
    return this.request('config.set', { config });
  }

  async patchConfig(patch: unknown) {
    return this.request('config.patch', { patch });
  }

  async getChannelsStatus() {
    return this.request('channels.status');
  }

  async getModelsList() {
    return this.request('models.list');
  }

  async sendMessage(sessionKey: string, message: string) {
    return this.request('send', { sessionKey, message });
  }
}

// 单例
let gatewayClient: GatewayClient | null = null;
let lastPort: number | null = null;
let lastToken: string | undefined = undefined;

// 从 localStorage 读取持久化的 token
function getPersistedToken(): string | null {
  try {
    const stored = localStorage.getItem('openclaw-cn-storage');
    if (stored) {
      const data = JSON.parse(stored);
      return data?.state?.gatewayToken || null;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getGatewayClient(port = 18789, token?: string): GatewayClient {
  // 优先级: 传入的 token > 上次使用的 token > localStorage 中的 token
  const effectiveToken = token ?? lastToken ?? getPersistedToken();
  
  // 如果端口或 token 变化，重建客户端
  if (gatewayClient && (lastPort !== port || lastToken !== effectiveToken)) {
    gatewayClient.disconnect();
    gatewayClient = null;
  }
  
  if (!gatewayClient) {
    gatewayClient = new GatewayClient(`ws://127.0.0.1:${port}`, effectiveToken);
    lastPort = port;
    lastToken = effectiveToken;
  }
  return gatewayClient;
}

export function resetGatewayClient() {
  gatewayClient?.disconnect();
  gatewayClient = null;
  lastPort = null;
  lastToken = undefined;
}
