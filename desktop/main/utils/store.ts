/**
 * Configuration Store (使用 JSON 文件)
 * 简化版配置存储，避免 electron-store 的 ESM 问题
 */
import { app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';

interface StoreSchema {
  gatewayToken?: string;
  gatewayPort?: number;
  [key: string]: unknown;
}

class Store {
  private filePath: string;
  private data: StoreSchema;

  constructor() {
    const userDataPath = app.getPath('userData');
    const configDir = join(userDataPath, 'config');

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    this.filePath = join(configDir, 'store.json');
    this.data = this.load();
  }

  private load(): StoreSchema {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load store:', error);
    }
    return { gatewayPort: 18789 };
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save store:', error);
    }
  }

  get(key: string): unknown {
    return this.data[key];
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.save();
  }

  delete(key: string): void {
    delete this.data[key];
    this.save();
  }

  clear(): void {
    this.data = { gatewayPort: 18789 };
    this.save();
  }
}

const store = new Store();

/**
 * Get setting from store
 */
export async function getSetting<T = unknown>(key: string): Promise<T> {
  // 特殊处理：gatewayToken 如果不存在则生成
  if (key === 'gatewayToken') {
    let token = store.get('gatewayToken') as string | undefined;
    if (!token) {
      token = randomBytes(32).toString('hex');
      store.set('gatewayToken', token);
    }
    return token as T;
  }

  return store.get(key) as T;
}

/**
 * Set setting in store
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
}

/**
 * Delete setting from store
 */
export async function deleteSetting(key: string): Promise<void> {
  store.delete(key);
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  return { ...store };
}

/**
 * Clear all settings
 */
export async function clearAllSettings(): Promise<void> {
  store.clear();
}
