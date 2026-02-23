// GitHub Token OAuth - Device Code flow
// 用于 Skill 搜索/安装的 GitHub 个人 Token（非 Copilot）
// 使用用户注册的 GitHub OAuth App

const CLIENT_ID = 'Ov23liUMvuVrHpYMVCwy'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export interface GitHubDeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export async function requestGitHubDeviceCode(): Promise<GitHubDeviceCode> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'public_repo read:user',
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

export async function pollGitHubToken(
  deviceCode: GitHubDeviceCode,
  signal?: AbortSignal
): Promise<string> {
  const expiresAt = Date.now() + deviceCode.expiresIn * 1000
  let intervalMs = Math.max(1000, deviceCode.interval * 1000)

  const bodyBase = new URLSearchParams({
    client_id: CLIENT_ID,
    device_code: deviceCode.deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })

  while (Date.now() < expiresAt) {
    if (signal?.aborted) throw new Error('已取消')

    await new Promise((r) => setTimeout(r, intervalMs))

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

    if (err === 'authorization_pending') continue
    if (err === 'slow_down') {
      intervalMs += 2000
      continue
    }
    if (err === 'expired_token') throw new Error('GitHub 设备码已过期，请重新登录')
    if (err === 'access_denied') throw new Error('GitHub 登录已取消')

    throw new Error(`GitHub 设备流错误: ${err}`)
  }

  throw new Error('GitHub 设备码已过期，请重新登录')
}
