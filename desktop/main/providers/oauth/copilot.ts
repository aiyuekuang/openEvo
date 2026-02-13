// GitHub Copilot OAuth - Device Code flow
// Ported from openclaw src/providers/github-copilot-auth.ts

const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token'

export const DEFAULT_COPILOT_API_BASE_URL = 'https://api.individual.githubcopilot.com'

export interface CopilotDeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface CopilotOAuthToken {
  githubToken: string
  copilotToken: string
  copilotTokenExpiresAt: number
  baseUrl: string
}

export async function requestCopilotDeviceCode(): Promise<CopilotDeviceCode> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'read:user',
  })

  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) throw new Error(`GitHub 设备码请求失败: HTTP ${res.status}`)

  const json = (await res.json()) as Record<string, unknown>
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error('GitHub 设备码响应缺少必要字段')
  }

  return {
    deviceCode: json.device_code as string,
    userCode: json.user_code as string,
    verificationUri: json.verification_uri as string,
    expiresIn: (json.expires_in as number) ?? 900,
    interval: (json.interval as number) ?? 5,
  }
}

async function pollGitHubAccessToken(params: {
  deviceCode: string
  intervalMs: number
  expiresAt: number
  signal?: AbortSignal
}): Promise<string> {
  const bodyBase = new URLSearchParams({
    client_id: CLIENT_ID,
    device_code: params.deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })

  let intervalMs = params.intervalMs

  while (Date.now() < params.expiresAt) {
    if (params.signal?.aborted) throw new Error('已取消')

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyBase,
    })

    if (!res.ok) throw new Error(`GitHub token 请求失败: HTTP ${res.status}`)

    const json = (await res.json()) as Record<string, unknown>

    if ('access_token' in json && typeof json.access_token === 'string') {
      return json.access_token
    }

    const err = ('error' in json ? json.error : 'unknown') as string

    if (err === 'authorization_pending') {
      await new Promise((r) => setTimeout(r, intervalMs))
      continue
    }
    if (err === 'slow_down') {
      intervalMs += 2000
      await new Promise((r) => setTimeout(r, intervalMs))
      continue
    }
    if (err === 'expired_token') throw new Error('GitHub 设备码已过期，请重新登录')
    if (err === 'access_denied') throw new Error('GitHub 登录已取消')

    throw new Error(`GitHub 设备流错误: ${err}`)
  }

  throw new Error('GitHub 设备码已过期，请重新登录')
}

function deriveCopilotApiBaseUrl(token: string): string {
  const proxyEp = token.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i)?.[1]?.trim()
  if (!proxyEp) return DEFAULT_COPILOT_API_BASE_URL
  const host = proxyEp.replace(/^https?:\/\//, '').replace(/^proxy\./i, 'api.')
  return host ? `https://${host}` : DEFAULT_COPILOT_API_BASE_URL
}

export async function exchangeCopilotToken(githubToken: string): Promise<{
  token: string
  expiresAt: number
  baseUrl: string
}> {
  const res = await fetch(COPILOT_TOKEN_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${githubToken}`,
    },
  })

  if (!res.ok) throw new Error(`Copilot token 交换失败: HTTP ${res.status}`)

  const json = (await res.json()) as Record<string, unknown>
  const token = json.token as string
  const expiresAt = json.expires_at as number

  if (!token) throw new Error('Copilot token 响应缺少 token')
  if (!expiresAt) throw new Error('Copilot token 响应缺少 expires_at')

  const expiresAtMs = expiresAt > 1e10 ? expiresAt : expiresAt * 1000

  return {
    token,
    expiresAt: expiresAtMs,
    baseUrl: deriveCopilotApiBaseUrl(token),
  }
}

export async function pollCopilotToken(
  deviceCode: CopilotDeviceCode,
  signal?: AbortSignal
): Promise<CopilotOAuthToken> {
  const expiresAt = Date.now() + deviceCode.expiresIn * 1000
  const intervalMs = Math.max(1000, deviceCode.interval * 1000)

  // Step 1: Poll for GitHub access token
  const githubToken = await pollGitHubAccessToken({
    deviceCode: deviceCode.deviceCode,
    intervalMs,
    expiresAt,
    signal,
  })

  // Step 2: Exchange for Copilot API token
  const copilot = await exchangeCopilotToken(githubToken)

  return {
    githubToken,
    copilotToken: copilot.token,
    copilotTokenExpiresAt: copilot.expiresAt,
    baseUrl: copilot.baseUrl,
  }
}
