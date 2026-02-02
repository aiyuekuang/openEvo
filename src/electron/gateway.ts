import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 调试模式 - 生产环境应设为 false */
const DEBUG = process.env.NODE_ENV !== 'production';

// ============ 路径解析 ============
// 与 src/config/paths.ts 保持一致
const DEFAULT_GATEWAY_PORT = 18789;
const STATE_DIRNAME = '.openclaw';
const CONFIG_FILENAME = 'openclaw.json';

/** 解析状态目录 (~/.openclaw) */
function resolveStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) return path.resolve(override.replace(/^~(?=$|[/\\])/, os.homedir()));
  return path.join(os.homedir(), STATE_DIRNAME);
}

/** 解析配置文件路径 */
function resolveConfigPath(): string {
  const override = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) return path.resolve(override.replace(/^~(?=$|[/\\])/, os.homedir()));
  return path.join(resolveStateDir(), CONFIG_FILENAME);
}

/** 解析 Gateway lock 目录 (临时目录) - 与 gateway-lock.ts 一致 */
function resolveGatewayLockDir(): string {
  const base = os.tmpdir();
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const suffix = uid != null ? `openclaw-${uid}` : 'openclaw';
  return path.join(base, suffix);
}

/** 解析 Gateway 端口 */
function resolveGatewayPort(): number {
  const envRaw = process.env.OPENCLAW_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  // 从配置文件读取
  try {
    const configPath = resolveConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      const configPort = config?.gateway?.port;
      if (typeof configPort === 'number' && Number.isFinite(configPort) && configPort > 0) {
        return configPort;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_GATEWAY_PORT;
}

// ============ 运行时配置 ============
// 这些参数可以根据需要调整，未来可迁移到配置文件
const GATEWAY_TIMING = {
  /** 健康检查超时 (ms) */
  healthCheckTimeoutMs: 1500,
  /** 健康检查轮询间隔 (ms) */
  healthCheckPollIntervalMs: 400,
  /** 等待 Gateway 就绪超时 (秒) */
  startupTimeoutSec: 6,
  /** SIGTERM 后等待进程退出的时间 (ms) */
  termGracePeriodMs: 500,
  /** SIGKILL 后等待时间 (ms) */
  killGracePeriodMs: 300,
  /** 端口释放等待时间 (ms) */
  portReleaseWaitMs: 1000,
  /** 停止时最大等待时间 (ms) */
  stopMaxWaitMs: 5000,
  /** 停止时轮询间隔 (ms) */
  stopPollIntervalMs: 100,
};

export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'error';

export class GatewayManager {
  private process: ChildProcess | null = null;
  private status: GatewayStatus = 'stopped';
  private port: number;
  private token: string | null = null;
  private hasCleanedUp: boolean = false;

  constructor() {
    this.port = resolveGatewayPort();
    this.loadToken();
  }

  /**
   * 从配置文件加载 gateway token
   */
  private loadToken(): void {
    try {
      const configPath = resolveConfigPath();
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        this.token = config?.gateway?.auth?.token || null;
      }
    } catch (error) {
      console.error('[Gateway] Failed to load token:', error);
    }
  }

  getStatus(): GatewayStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  getToken(): string | null {
    return this.token;
  }

  /**
   * 通过 HTTP 健康检查探测 Gateway 是否就绪
   * 参考 macOS 版本的 GatewayProcessManager.swift
   */
  private async probeHealth(timeoutMs: number = GATEWAY_TIMING.healthCheckTimeoutMs): Promise<boolean> {
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
  private async waitForReady(timeoutSec: number = GATEWAY_TIMING.startupTimeoutSec): Promise<boolean> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (await this.probeHealth()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.healthCheckPollIntervalMs));
    }
    return false;
  }

  /**
   * 获取占用指定端口的进程 PID 列表
   * 跨平台支持: macOS/Linux 使用 lsof, Windows 使用 netstat
   */
  private findProcessesOnPort(): number[] {
    const pids: number[] = [];
    try {
      if (process.platform === 'win32') {
        // Windows: netstat -ano | findstr :PORT
        // 输出格式: TCP    0.0.0.0:18789    0.0.0.0:0    LISTENING    12345
        const result = execSync(
          `netstat -ano | findstr :${this.port} | findstr LISTENING`,
          { encoding: 'utf-8', windowsHide: true }
        ).trim();
        for (const line of result.split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pidStr = parts[parts.length - 1];
          const pid = parseInt(pidStr, 10);
          if (pid && !pids.includes(pid)) {
            pids.push(pid);
          }
        }
      } else {
        // macOS/Linux: lsof
        const result = execSync(`lsof -ti :${this.port} 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
        for (const pidStr of result.split('\n').filter(Boolean)) {
          const pid = parseInt(pidStr, 10);
          if (pid && !pids.includes(pid)) {
            pids.push(pid);
          }
        }
      }
    } catch {
      // 命令执行失败或无结果
    }
    return pids;
  }

  /**
   * 终止指定进程
   * 跨平台支持: Unix 使用 SIGTERM/SIGKILL, Windows 使用 taskkill
   */
  private async killProcess(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      // Windows: taskkill
      try {
        execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8', windowsHide: true });
        await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.termGracePeriodMs));
      } catch {
        // 进程可能已退出
      }
    } else {
      // Unix: SIGTERM -> SIGKILL
      try {
        process.kill(pid, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.termGracePeriodMs));
        try {
          process.kill(pid, 0); // 检查进程是否存在
          process.kill(pid, 'SIGKILL');
          await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.killGracePeriodMs));
        } catch {
          // 进程已退出
        }
      } catch {
        // 进程可能已退出
      }
    }
  }

  /**
   * 强制清理占用端口的残留进程
   */
  private async killStaleProcess(): Promise<void> {
    try {
      const pids = this.findProcessesOnPort();
      for (const pid of pids) {
        // 不要杀死自己
        if (pid !== process.pid) {
          if (DEBUG) console.log(`[Gateway] Killing stale process PID ${pid} on port ${this.port}`);
          await this.killProcess(pid);
        }
      }
    } catch (err) {
      console.warn('[Gateway] Failed to check for stale processes:', err);
    }
  }

  /**
   * 清理残留 lock 文件
   * 使用与 gateway-lock.ts 相同的 lock 目录
   */
  private cleanupLockFiles(): void {
    try {
      const lockDir = resolveGatewayLockDir();
      if (fs.existsSync(lockDir)) {
        const files = fs.readdirSync(lockDir);
        for (const file of files) {
          if (file.startsWith('gateway.') && file.endsWith('.lock')) {
            const lockPath = path.join(lockDir, file);
            try {
              // 读取 lock 文件检查进程是否存在
              const content = fs.readFileSync(lockPath, 'utf-8');
              const payload = JSON.parse(content);
              if (payload.pid) {
                try {
                  process.kill(payload.pid, 0); // 检查进程是否存在
                  // 进程还在运行，不删除 lock
          if (DEBUG) console.log(`[Gateway] Lock file ${file} owned by running process ${payload.pid}`);
                } catch {
                  // 进程已退出，删除残留 lock 文件
                  fs.unlinkSync(lockPath);
                  if (DEBUG) console.log(`[Gateway] Removed stale lock file: ${file}`);
                }
              }
            } catch {
              // 无法解析的 lock 文件，删除
              fs.unlinkSync(lockPath);
              if (DEBUG) console.log(`[Gateway] Removed invalid lock file: ${file}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Gateway] Failed to cleanup lock files:', err);
    }
  }

  /**
   * 启动前的强制清理
   * 确保软件启动时处于干净状态：无残留进程、无端口占用、无废弃 lock 文件
   */
  async cleanupBeforeStart(): Promise<void> {
    if (this.hasCleanedUp) {
      return;
    }
    
    if (DEBUG) console.log('[Gateway] 🧹 Starting pre-launch cleanup...');
    
    // 1. 清理残留 lock 文件
    this.cleanupLockFiles();
    
    // 2. 无条件清理端口占用的进程
    const pids = this.findProcessesOnPort();
    if (pids.length > 0) {
      if (DEBUG) console.log(`[Gateway] Found ${pids.length} process(es) on port ${this.port}, cleaning up...`);
      for (const pid of pids) {
        if (pid !== process.pid) {
          if (DEBUG) console.log(`[Gateway] Terminating stale process PID ${pid}`);
          await this.killProcess(pid);
        }
      }
      // 等待端口完全释放
      await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.portReleaseWaitMs));
    }
    
    // 3. 验证端口已释放
    const remainingPids = this.findProcessesOnPort();
    if (remainingPids.length > 0) {
      console.warn(`[Gateway] ⚠️ Port ${this.port} still occupied by PIDs: ${remainingPids.join(', ')}`);
    } else {
      if (DEBUG) console.log(`[Gateway] ✅ Port ${this.port} is clean`);
    }
    
    this.hasCleanedUp = true;
    if (DEBUG) console.log('[Gateway] 🧹 Pre-launch cleanup completed');
  }

  async start(): Promise<boolean> {
    // 启动前强制清理
    await this.cleanupBeforeStart();
    
    // 检查是否已有我们管理的进程在运行
    if (this.process) {
      if (await this.probeHealth()) {
        if (DEBUG) console.log('[Gateway] Our gateway is already running');
        this.status = 'running';
        return true;
      }
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
        if (DEBUG) console.log('[Gateway]', data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        if (DEBUG) console.error('[Gateway Error]', data.toString());
      });

      this.process.on('close', (code) => {
        if (DEBUG) console.log(`[Gateway] Process exited with code ${code}`);
        this.process = null;
        this.status = 'stopped';
      });

      this.process.on('error', (err) => {
        console.error('[Gateway] Failed to start:', err);
        this.status = 'error';
      });

      // 等待 Gateway 就绪（通过健康检查 API）
      const ready = await this.waitForReady();
      if (ready) {
        this.status = 'running';
        if (DEBUG) console.log('[Gateway] Started successfully');
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

  async stop(): Promise<void> {
    if (this.process) {
      if (DEBUG) console.log('[Gateway] Stopping gateway...');
      this.process.kill('SIGTERM');
      
      // 等待进程退出
      const pid = this.process.pid;
      const maxIterations = Math.ceil(GATEWAY_TIMING.stopMaxWaitMs / GATEWAY_TIMING.stopPollIntervalMs);
      for (let i = 0; i < maxIterations; i++) {
        await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.stopPollIntervalMs));
        if (!this.process) break;
        try {
          if (pid) process.kill(pid, 0); // 检查进程是否存在
        } catch {
          // 进程已退出
          break;
        }
      }
      
      // 如果还没退出，强制杀死
      if (this.process && this.process.pid) {
        if (DEBUG) console.log('[Gateway] Force killing gateway...');
        try {
          this.process.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
      
      this.process = null;
      this.status = 'stopped';
      
      // 等待端口释放
      await new Promise(resolve => setTimeout(resolve, GATEWAY_TIMING.termGracePeriodMs));
      if (DEBUG) console.log('[Gateway] Gateway stopped');
    }
  }
}
