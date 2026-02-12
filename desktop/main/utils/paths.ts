/**
 * Path Utilities
 * OpenClaw 路径解析工具
 */
import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';

/**
 * Get OpenClaw config directory
 */
export function getOpenClawConfigDir(): string {
  return join(homedir(), '.openclaw');
}

/**
 * Get OpenClaw skills directory
 */
export function getOpenClawSkillsDir(): string {
  return join(getOpenClawConfigDir(), 'skills');
}

/**
 * Get OpenClaw package directory
 * - Production (packaged): from resources/openclaw
 * - Development: from node_modules/openclaw
 */
export function getOpenClawDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'openclaw');
  }
  // Development: use node_modules/openclaw
  return join(__dirname, '../../node_modules/openclaw');
}

/**
 * Get OpenClaw entry script path (openclaw.mjs)
 */
export function getOpenClawEntryPath(): string {
  return join(getOpenClawDir(), 'openclaw.mjs');
}

/**
 * Check if OpenClaw package exists
 */
export function isOpenClawPresent(): boolean {
  const dir = getOpenClawDir();
  const pkgJsonPath = join(dir, 'package.json');
  return existsSync(dir) && existsSync(pkgJsonPath);
}

/**
 * Check if OpenClaw is built (has dist folder)
 */
export function isOpenClawBuilt(): boolean {
  const dir = getOpenClawDir();
  const distDir = join(dir, 'dist');
  return existsSync(distDir);
}

/**
 * Get OpenClaw status
 */
export interface OpenClawStatus {
  packageExists: boolean;
  isBuilt: boolean;
  entryPath: string;
  dir: string;
  version?: string;
}

export function getOpenClawStatus(): OpenClawStatus {
  const dir = getOpenClawDir();
  let version: string | undefined;

  try {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      version = pkg.version;
    }
  } catch {
    // Ignore
  }

  return {
    packageExists: isOpenClawPresent(),
    isBuilt: isOpenClawBuilt(),
    entryPath: getOpenClawEntryPath(),
    dir,
    version,
  };
}
