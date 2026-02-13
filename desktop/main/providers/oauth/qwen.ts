// Qwen OAuth - Device Code + PKCE flow
// Ported from openclaw/extensions/qwen-portal-auth/oauth.ts

import { createHash, randomBytes, randomUUID } from 'node:crypto'

const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai'
const QWEN_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`
const QWEN_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`
const QWEN_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
const QWEN_SCOPE = 'openid profile email model.completion'
const QWEN_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export interface QwenDeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  interval: number
}

export interface QwenOAuthToken {
  access: string
  refresh: string
  expires: number
  resourceUrl?: string
}

function toFormUrlEncoded(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function generatePkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export async function requestQwenDeviceCode(): Promise<{
  deviceCode: QwenDeviceCode
  _internal: { verifier: string }
}> {
  const { verifier, challenge } = generatePkce()

  const response = await fetch(QWEN_DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-request-id': randomUUID(),
    },
    body: toFormUrlEncoded({
      client_id: QWEN_CLIENT_ID,
      scope: QWEN_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Qwen OAuth 授权失败: ${text || response.statusText}`)
  }

  const payload = (await response.json()) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    verification_uri_complete?: string
    expires_in?: number
    interval?: number
    error?: string
  }

  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error(payload.error ?? 'Qwen OAuth 返回数据不完整')
  }

  return {
    deviceCode: {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      verificationUriComplete: payload.verification_uri_complete,
      expiresIn: payload.expires_in ?? 300,
      interval: payload.interval ?? 2,
    },
    _internal: { verifier },
  }
}

type PollResult =
  | { status: 'success'; token: QwenOAuthToken }
  | { status: 'pending'; slowDown?: boolean }
  | { status: 'error'; message: string }

async function pollOnce(params: {
  deviceCode: string
  verifier: string
}): Promise<PollResult> {
  const response = await fetch(QWEN_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: toFormUrlEncoded({
      grant_type: QWEN_GRANT_TYPE,
      client_id: QWEN_CLIENT_ID,
      device_code: params.deviceCode,
      code_verifier: params.verifier,
    }),
  })

  if (!response.ok) {
    let payload: { error?: string; error_description?: string } | undefined
    try {
      payload = (await response.json()) as { error?: string; error_description?: string }
    } catch {
      const text = await response.text()
      return { status: 'error', message: text || response.statusText }
    }

    if (payload?.error === 'authorization_pending') return { status: 'pending' }
    if (payload?.error === 'slow_down') return { status: 'pending', slowDown: true }

    return {
      status: 'error',
      message: payload?.error_description || payload?.error || response.statusText,
    }
  }

  const tokenPayload = (await response.json()) as {
    access_token?: string | null
    refresh_token?: string | null
    expires_in?: number | null
    resource_url?: string
  }

  if (!tokenPayload.access_token || !tokenPayload.refresh_token || !tokenPayload.expires_in) {
    return { status: 'error', message: 'Qwen OAuth 返回 token 数据不完整' }
  }

  return {
    status: 'success',
    token: {
      access: tokenPayload.access_token,
      refresh: tokenPayload.refresh_token,
      expires: Date.now() + tokenPayload.expires_in * 1000,
      resourceUrl: tokenPayload.resource_url,
    },
  }
}

export async function pollQwenToken(
  deviceCode: QwenDeviceCode,
  internal: { verifier: string },
  signal?: AbortSignal
): Promise<QwenOAuthToken> {
  const start = Date.now()
  let pollIntervalMs = deviceCode.interval * 1000 || 2000
  const timeoutMs = deviceCode.expiresIn * 1000

  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new Error('已取消')

    const result = await pollOnce({
      deviceCode: deviceCode.deviceCode,
      verifier: internal.verifier,
    })

    if (result.status === 'success') return result.token
    if (result.status === 'error') throw new Error(result.message)
    if (result.status === 'pending' && result.slowDown) {
      pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000)
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Qwen OAuth 授权超时')
}
