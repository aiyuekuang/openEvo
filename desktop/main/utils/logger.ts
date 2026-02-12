/**
 * Logger Utility (Simplified)
 * 简化的日志工具，用于 Gateway 集成
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLevel = LogLevel.DEBUG;

function formatMessage(level: string, message: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ' ' + args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ') : '';

  return `[${timestamp}] [${level.padEnd(5)}] ${message}${formattedArgs}`;
}

export const logger = {
  init: () => {
    // 简化版：不需要文件初始化
  },

  setLevel: (level: LogLevel) => {
    currentLevel = level;
  },

  debug: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.DEBUG) {
      const formatted = formatMessage('DEBUG', message, ...args);
      console.debug(formatted);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.INFO) {
      const formatted = formatMessage('INFO', message, ...args);
      console.info(formatted);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.WARN) {
      const formatted = formatMessage('WARN', message, ...args);
      console.warn(formatted);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (currentLevel <= LogLevel.ERROR) {
      const formatted = formatMessage('ERROR', message, ...args);
      console.error(formatted);
    }
  },
};
