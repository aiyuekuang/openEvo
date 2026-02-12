/**
 * Gateway 连接测试脚本
 * 用法: node desktop/test-gateway.js
 */

const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')

// 读取 gatewayToken (从 Electron 应用数据目录)
const configPath = path.join(
  process.env.HOME || process.env.USERPROFILE,
  'Library/Application Support/openclaw-cn/config/store.json'
)

let config = {}
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
} catch (err) {
  console.error('❌ 无法读取配置文件:', err.message)
  process.exit(1)
}

const gatewayToken = config.gatewayToken
if (!gatewayToken) {
  console.error('❌ 未找到 gatewayToken，请先运行应用初始化配置')
  process.exit(1)
}

console.log('✅ 找到 Gateway Token:', gatewayToken.substring(0, 20) + '...')

// 连接 Gateway
const wsUrl = 'ws://localhost:18789/ws'
console.log('\n🔌 正在连接 Gateway:', wsUrl)

const ws = new WebSocket(wsUrl)

let requestId = 1
const pendingRequests = new Map()

// 发送 Gateway RPC 请求 (OpenClaw 协议格式)
function sendRequest(method, params = {}) {
  const id = `${method}-${requestId++}`
  const request = {
    type: 'req',
    id,
    method,
    params,
  }

  console.log(`\n📤 发送请求 [${method}]:`, JSON.stringify(params, null, 2))

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, method })
    ws.send(JSON.stringify(request))

    // 30秒超时
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }
    }, 30000)

    pendingRequests.get(id).timeout = timeout
  })
}

ws.on('open', async () => {
  console.log('✅ WebSocket 已连接')

  try {
    // 1. 发送 connect 握手
    console.log('\n🤝 发送连接握手...')
    const connectResult = await sendRequest('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'gateway-client',
        displayName: 'ClawX',
        version: '0.1.0',
        platform: process.platform,
        mode: 'ui',
      },
      auth: {
        token: gatewayToken,
      },
      caps: [],
      role: 'operator',
      scopes: [],
    })
    console.log('✅ 连接握手成功:', connectResult)

    // 2. 发送聊天消息
    console.log('\n💬 发送测试消息...')
    const sessionKey = `test-${Date.now()}`
    const idempotencyKey = `idem-${Date.now()}`

    const chatResult = await sendRequest('chat.send', {
      sessionKey,
      message: '你好，这是一个测试消息。请用一句话简短回复。',
      deliver: false,
      idempotencyKey,
    })

    console.log('✅ chat.send 调用成功:', chatResult)
    console.log('\n⏳ 等待 Claude 流式响应...')
    console.log('（应该会收到 chat/message 通知）\n')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    ws.close()
    process.exit(1)
  }
})

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString())

    // Gateway 响应 (type: "res")
    if (msg.type === 'res' && msg.id !== undefined) {
      const pending = pendingRequests.get(msg.id)
      if (pending) {
        clearTimeout(pending.timeout)
        pendingRequests.delete(msg.id)

        if (msg.error) {
          console.error(`❌ 请求错误 [${pending.method}]:`, msg.error)
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        } else {
          console.log(`✅ 收到响应 [${pending.method}]:`, msg.result || '(empty)')
          pending.resolve(msg.result)
        }
      }
      return
    }

    // Gateway 事件 (type: "event")
    if (msg.type === 'event') {
      console.log(`\n📥 收到事件 [${msg.event}]:`)

      // 聊天消息事件
      if (msg.event === 'chat/message') {
        const message = msg.payload?.message || {}
        console.log('   消息类型:', message.type)

        if (message.type === 'content_block_start') {
          console.log('   ✅ 内容块开始')
        } else if (message.type === 'content_block_delta') {
          const text = message.delta?.text || ''
          process.stdout.write(`   📝 ${text}`)
        } else if (message.type === 'content_block_stop') {
          console.log('\n   ✅ 内容块结束')
        } else if (message.type === 'message_start') {
          console.log('   ✅ Claude 开始响应')
        } else if (message.type === 'message_delta') {
          console.log('   📊 消息元数据更新')
        } else if (message.type === 'message_stop') {
          console.log('\n   ✅ Claude 响应完成')
          console.log('\n🎉 测试成功！Gateway 通信正常，流式响应工作正常。')

          setTimeout(() => {
            ws.close()
            process.exit(0)
          }, 1000)
        } else {
          console.log('   详情:', JSON.stringify(message, null, 2))
        }
      } else {
        console.log('   负载:', JSON.stringify(msg.payload, null, 2))
      }
      return
    }

    // 其他消息
    console.log('\n📥 收到消息:', JSON.stringify(msg, null, 2))

  } catch (err) {
    console.error('❌ 解析消息失败:', err.message)
    console.log('原始数据:', data.toString())
  }
})

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message)
  process.exit(1)
})

ws.on('close', (code, reason) => {
  console.log(`\n🔌 连接已关闭 [${code}]: ${reason || '无原因'}`)
  process.exit(0)
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⏹️  收到中断信号，正在关闭...')
  ws.close()
  process.exit(0)
})
