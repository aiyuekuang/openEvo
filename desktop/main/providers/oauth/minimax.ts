// MiniMax OAuth - Device Code + PKCE flow
// Ported from openclaw/extensions/minimax-portal-auth/oauth.ts

import { createHash, randomBytes, randomUUID } from 'node:crypto'

export type MiniMaxRegion = 'cn' | 'global'

const MINIMAX_OAUTH_CONFIG = {
  cn: {
    baseUrl: 'https://api.minimaxi.com',
    clientId: '78257093-7e40-4613-99e0-527b14b39113',
  },
  global: {
    baseUrl: 'https://api.minimax.io',
    clientId: '78257093-7e40-4613-99e0-527b14b39113',
  },
} as const

const MINIMAX_OAUTH_SCOPE = 'group_id profile model.completion'
const MINIMAX_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:user_code'

function getOAuthEndpoints(region: MiniMaxRegion) {
  const config = MINIMAX_OAUTH_CONFIG[region]
  return {
    codeEndpoint: `${config.baseUrl}/oauth/code`,
    tokenEndpoint: `${config.baseUrl}/oauth/token`,
    clientId: config.clientId,
    baseUrl: config.baseUrl,
  }
}

export interface MiniMaxDeviceCode {
  userCode: string
  verificationUri: string
  expiresAt: number
  interval: number
}

export interface MiniMaxOAuthToken {
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
  const state = randomBytes(16).toString('base64url')
  return { verifier, challenge, state }
}

export async function requestMiniMaxDeviceCode(region: MiniMaxRegion = 'cn'): Promise<{
  deviceCode: MiniMaxDeviceCode
  _internal: { verifier: string; region: MiniMaxRegion }
}> {
  const { verifier, challenge, state } = generatePkce()
  const endpoints = getOAuthEndpoints(region)

  const response = await fetch(endpoints.codeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-request-id': randomUUID(),
    },
    body: toFormUrlEncoded({
      response_type: 'code',
      client_id: endpoints.clientId,
      scope: MINIMAX_OAUTH_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`MiniMax OAuth 授权失败: ${text || response.statusText}`)
  }

  const payload = (await response.json()) as {
    user_code?: string
    verification_uri?: string
    expired_in?: number
    interval?: number
    state?: string
    error?: string
  }

  if (!payload.user_code || !payload.verification_uri) {
    throw new Error(payload.error ?? 'MiniMax OAuth 返回数据不完整')
  }

  if (payload.state !== state) {
    throw new Error('MiniMax OAuth state 不匹配')
  }

  return {
    deviceCode: {
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      expiresAt: payload.expired_in ?? Date.now() + 300_000,
      interval: payload.interval ?? 2000,
    },
    _internal: { verifier, region },
  }
}

type PollResult =
  | { status: 'success'; token: MiniMaxOAuthToken }
  | { status: 'pending' }
  | { status: 'error'; message: string }

async function pollOnce(params: {
  userCode: string
  verifier: string
  region: MiniMaxRegion
}): Promise<PollResult> {
  const endpoints = getOAuthEndpoints(params.region)

  const response = await fetch(endpoints.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: toFormUrlEncoded({
      grant_type: MINIMAX_OAUTH_GRANT_TYPE,
      client_id: endpoints.clientId,
      user_code: params.userCode,
      code_verifier: params.verifier,
    }),
  })

  const text = await response.text()
  let payload: Record<string, unknown> | undefined
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      payload = undefined
    }
  }

  if (!response.ok) {
    const msg =
      (payload?.base_resp as Record<string, string>)?.status_msg ?? text
    return { status: 'error', message: msg || 'MiniMax OAuth 请求失败' }
  }

  if (!payload) {
    return { status: 'error', message: 'MiniMax OAuth 响应解析失败' }
  }

  if (payload.status === 'error') {
    return { status: 'error', message: '发生错误，请稍后重试' }
  }

  if (payload.status !== 'success') {
    return { status: 'pending' }
  }

  if (!payload.access_token || !payload.refresh_token || !payload.expired_in) {
    return { status: 'error', message: 'MiniMax OAuth 返回 token 数据不完整' }
  }

  return {
    status: 'success',
    token: {
      access: payload.access_token as string,
      refresh: payload.refresh_token as string,
      expires: payload.expired_in as number,
      resourceUrl: payload.resource_url as string | undefined,
    },
  }
}

export async function pollMiniMaxToken(
  deviceCode: MiniMaxDeviceCode,
  internal: { verifier: string; region: MiniMaxRegion },
  signal?: AbortSignal
): Promise<MiniMaxOAuthToken> {
  let pollIntervalMs = deviceCode.interval || 2000

  while (Date.now() < deviceCode.expiresAt) {
    if (signal?.aborted) throw new Error('已取消')

    const result = await pollOnce({
      userCode: deviceCode.userCode,
      verifier: internal.verifier,
      region: internal.region,
    })

    if (result.status === 'success') return result.token
    if (result.status === 'error') throw new Error(result.message)

    pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000)
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('MiniMax OAuth 授权超时')
}
