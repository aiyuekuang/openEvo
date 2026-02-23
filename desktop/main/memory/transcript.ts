/**
 * Transcript — JSONL 对话记录存储
 * 存储位置: ~/.openevo/sessions/<sessionId>.jsonl
 * 格式: append-only JSONL
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const SESSIONS_DIR = path.join(os.homedir(), '.openevo', 'sessions')

export interface TranscriptEntry {
  id: string
  parentId?: string
  type: 'message' | 'tool_call' | 'tool_result' | 'system'
  role?: 'user' | 'assistant' | 'system'
  content?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  toolResults?: Array<{ toolCallId: string; content: string; isError?: boolean }>
  timestamp: number
  model?: string
  providerId?: string
}

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

export function appendTranscript(sessionId: string, entry: TranscriptEntry): void {
  ensureDir()
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`)
  const line = JSON.stringify(entry) + '\n'
  fs.appendFileSync(filePath, line, 'utf-8')
}

export function readTranscript(sessionId: string): TranscriptEntry[] {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`)
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter((entry): entry is TranscriptEntry => entry !== null)
}

export function listSessions(): Array<{ id: string; mtime: number; size: number }> {
  ensureDir()
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const absPath = path.join(SESSIONS_DIR, f)
        const stat = fs.statSync(absPath)
        return {
          id: f.replace('.jsonl', ''),
          mtime: stat.mtimeMs,
          size: stat.size,
        }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch {
    return []
  }
}

export function deleteSession(sessionId: string): boolean {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`)
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch {}
  return false
}

export function getSessionsDir(): string {
  return SESSIONS_DIR
}
