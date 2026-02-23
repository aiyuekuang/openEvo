/**
 * Memory Store — OpenEvo 记忆文件读写
 * 存储位置: ~/.openevo/memory/
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const MEMORY_DIR = path.join(os.homedir(), '.openevo', 'memory')
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md')

function ensureDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dailyLogPath(dateStr: string): string {
  return path.join(MEMORY_DIR, `${dateStr}.md`)
}

// --- MEMORY.md (长期记忆) ---

export function loadMemory(): string {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return fs.readFileSync(MEMORY_FILE, 'utf-8')
    }
  } catch { /* ignore */ }
  return ''
}

export function saveMemory(content: string): void {
  ensureDir()
  fs.writeFileSync(MEMORY_FILE, content, 'utf-8')
}

export function appendToMemory(entry: string): void {
  ensureDir()
  const existing = loadMemory()
  const separator = existing && !existing.endsWith('\n') ? '\n' : ''
  fs.writeFileSync(MEMORY_FILE, existing + separator + entry + '\n', 'utf-8')
}

// --- 每日日志 ---

export function loadDailyLog(dateStr?: string): string {
  const d = dateStr || formatDate(new Date())
  const filePath = dailyLogPath(d)
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  } catch { /* ignore */ }
  return ''
}

export function appendToDailyLog(entry: string, dateStr?: string): void {
  ensureDir()
  const d = dateStr || formatDate(new Date())
  const filePath = dailyLogPath(d)
  let existing = ''
  try {
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, 'utf-8')
    }
  } catch { /* ignore */ }

  if (!existing) {
    existing = `# Daily Log - ${d}\n\n`
  }

  const separator = existing.endsWith('\n') ? '' : '\n'
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const formatted = `- [${timestamp}] ${entry}\n`
  fs.writeFileSync(filePath, existing + separator + formatted, 'utf-8')
}

// --- 工具函数 ---

export function getTodayStr(): string {
  return formatDate(new Date())
}

export function getYesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

export function listDailyLogs(): string[] {
  ensureDir()
  try {
    return fs.readdirSync(MEMORY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace('.md', ''))
      .sort((a, b) => b.localeCompare(a))
  } catch { /* ignore */ }
  return []
}

export function getMemoryDir(): string {
  return MEMORY_DIR
}
