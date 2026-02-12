/**
 * Claude CLI 适配器
 *
 * 通过 spawn 调用本地 claude CLI 命令
 * 不需要 API Key，使用 CLI 的认证
 */

import { spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { exec as execCb } from 'child_process'
import os from 'os'

const exec = promisify(execCb)

export interface ClaudeStreamEvent {
  type: 'token' | 'done' | 'error'
  content?: string
  fullResponse?: string
  error?: string
}

/**
 * 解析 shell 环境变量（避免 Electron GUI 无法找到 claude 命令）
 */
async function getShellEnv(): Promise<Record<string, string>> {
  const base = { ...process.env }
  delete base.ELECTRON_RUN_AS_NODE

  if (process.platform === 'win32') {
    return base as Record<string, string>
  }

  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await exec(`${shell} -ilc 'echo "__SHELL_PATH__=$PATH"'`, {
      env: base,
      timeout: 5000,
    })
    const line = stdout.split('\n').find((l) => l.startsWith('__SHELL_PATH__='))
    if (line) {
      base.PATH = line.slice('__SHELL_PATH__='.length)
    }
  } catch {
    // Fallback: prepend common bin dirs
    const home = os.homedir()
    const extra = [
      `${home}/.nvm/versions/node/${process.versions.node}/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      `${home}/.cargo/bin`,
    ].join(':')
    base.PATH = `${extra}:${base.PATH || '/usr/bin:/bin'}`
  }

  return base as Record<string, string>
}

/**
 * Claude CLI 适配器类
 */
export class ClaudeCLIAdapter {
  private model: string

  constructor(model = 'claude-sonnet-4-5-20250929') {
    this.model = model
  }

  /**
   * 检查 claude CLI 是否可用
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const env = await getShellEnv()
      await exec('claude --version', { env, timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * 发送消息并获取流式响应
   */
  async sendMessage(
    message: string,
    onStream?: (event: ClaudeStreamEvent) => void
  ): Promise<string> {
    const env = await getShellEnv()

    return new Promise((resolve, reject) => {
      let fullResponse = ''
      let jsonBuffer = ''

      // 使用 claude CLI 的 stream-json 模式
      const child = spawn(
        'claude',
        [
          '--model',
          this.model,
          '--print',
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
          message,
        ],
        { env }
      )

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        jsonBuffer += chunk

        // 解析 JSONL 格式（每行一个 JSON）
        const lines = jsonBuffer.split('\n')
        jsonBuffer = lines.pop() || '' // 保留不完整的行

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line)

            // stream_event: token 级增量
            if (event.type === 'stream_event') {
              if (event.event?.type === 'content_block_delta') {
                const delta = event.event.delta
                if (delta?.type === 'text_delta' && delta.text) {
                  fullResponse += delta.text

                  if (onStream) {
                    onStream({
                      type: 'token',
                      content: delta.text,
                      fullResponse,
                    })
                  }
                }
              }
            }
            // assistant: 完整的助手消息
            else if (event.type === 'assistant') {
              if (event.message?.content) {
                const content = event.message.content
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) {
                      fullResponse = block.text
                    }
                  }
                }
              }
            }
            // result: 最终结果
            else if (event.type === 'result') {
              if (event.result?.content) {
                const content = event.result.content
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) {
                      fullResponse = block.text
                    }
                  }
                }
              }
            }
          } catch (err) {
            // 忽略解析错误（可能是不完整的 JSON）
          }
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        // Claude CLI 的 stderr 通常包含进度信息，不是真正的错误
        // 真正的错误会在 'error' 和 'close' 事件中捕获
        // 如需调试，取消注释下面这行：
        // console.error('[Claude CLI stderr]:', data.toString())
      })

      child.on('error', (err) => {
        if (onStream) {
          onStream({
            type: 'error',
            error: err.message,
          })
        }
        reject(new Error(`Claude CLI error: ${err.message}`))
      })

      child.on('close', (code) => {
        if (code === 0) {
          if (onStream) {
            onStream({
              type: 'done',
              fullResponse,
            })
          }
          resolve(fullResponse)
        } else {
          const errorMsg = `Claude CLI exited with code ${code}`
          if (onStream) {
            onStream({
              type: 'error',
              error: errorMsg,
            })
          }
          reject(new Error(errorMsg))
        }
      })
    })
  }
}

/**
 * 创建 Claude CLI 适配器实例
 */
export function createClaudeCLIAdapter(model?: string): ClaudeCLIAdapter {
  return new ClaudeCLIAdapter(model)
}
