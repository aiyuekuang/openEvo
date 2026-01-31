import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'error';

export class GatewayManager {
  private process: ChildProcess | null = null;
  private status: GatewayStatus = 'stopped';
  private port: number = 18789;

  getStatus(): GatewayStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  /**
   * 通过 HTTP 健康检查探测 Gateway 是否就绪
   * 参考 macOS 版本的 GatewayProcessManager.swift
   */
  private async probeHealth(timeoutMs: number = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: '/health',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  /**
   * 等待 Gateway 就绪，最多等待 timeout 秒
   * 参考 macOS 版本的 waitForGatewayReady
   */
  private async waitForReady(timeoutSec: number = 6): Promise<boolean> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (await this.probeHealth()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    return false;
  }

  async start(): Promise<boolean> {
    // 先检查是否已有 Gateway 在运行
    if (await this.probeHealth()) {
      console.log('[Gateway] Existing gateway detected, attaching...');
      this.status = 'running';
      return true;
    }

    if (this.process) {
      return true;
    }

    this.status = 'starting';

    try {
      const isDev = !app.isPackaged;
      
      let cwd: string;
      let command: string;
      let args: string[];

      if (isDev) {
        // 开发模式: 直接运行 gateway
        cwd = path.resolve(__dirname, '../..');
        command = 'node';
        args = ['openclaw.mjs', 'gateway'];
      } else {
        // 生产模式: 使用打包的后端
        const backendPath = path.join(process.resourcesPath, 'backend');
        cwd = backendPath;
        command = 'node';
        args = [path.join(backendPath, 'cli/index.js'), 'gateway'];
      }

      this.process = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          OPENCLAW_GATEWAY_PORT: String(this.port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        console.log('[Gateway]', data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Gateway Error]', data.toString());
      });

      this.process.on('close', (code) => {
        console.log(`[Gateway] Process exited with code ${code}`);
        this.process = null;
        this.status = 'stopped';
      });

      this.process.on('error', (err) => {
        console.error('[Gateway] Failed to start:', err);
        this.status = 'error';
      });

      // 等待 Gateway 就绪（通过健康检查 API）
      const ready = await this.waitForReady(6);
      if (ready) {
        this.status = 'running';
        console.log('[Gateway] Started successfully');
        return true;
      } else {
        this.status = 'error';
        console.error('[Gateway] Failed to start: health check timeout');
        return false;
      }
    } catch (error) {
      console.error('[Gateway] Start error:', error);
      this.status = 'error';
      return false;
    }
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.status = 'stopped';
    }
  }
}
