// OAuth module - unified Device Code flow handler for all providers

import { shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { setProviderAuth } from '../store'
import { requestMiniMaxDeviceCode, pollMiniMaxToken } from './minimax'
import { requestQwenDeviceCode, pollQwenToken } from './qwen'
import { requestCopilotDeviceCode, pollCopilotToken } from './copilot'
import { requestGitHubDeviceCode, pollGitHubToken } from './github-token'
import { ConfigStore } from '../../config/store'

export type OAuthProviderId = 'github-copilot' | 'minimax-portal' | 'qwen-portal' | 'github-token'

export interface OAuthDeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
}

export type OAuthStatus =
  | { status: 'device_code'; info: OAuthDeviceCodeInfo }
  | { status: 'polling' }
  | { status: 'success' }
  | { status: 'error'; error: string }

const activeFlows = new Map<string, AbortController>()

export function cancelOAuthFlow(providerId: string) {
  const controller = activeFlows.get(providerId)
  if (controller) {
    controller.abort()
    activeFlows.delete(providerId)
  }
}

export async function startOAuthFlow(
  providerId: OAuthProviderId,
  sender: Electron.WebContents,
  _win?: BrowserWindow
): Promise<void> {
  // Cancel any existing flow for this provider
  cancelOAuthFlow(providerId)

  const controller = new AbortController()
  activeFlows.set(providerId, controller)

  const sendStatus = (status: OAuthStatus) => {
    if (!sender.isDestroyed()) {
      sender.send('oauth:status', { providerId, ...status })
    }
  }

  try {
    switch (providerId) {
      case 'minimax-portal': {
        const { deviceCode, _internal } = await requestMiniMaxDeviceCode('cn')
        sendStatus({
          status: 'device_code',
          info: {
            userCode: deviceCode.userCode,
            verificationUri: deviceCode.verificationUri,
            expiresIn: Math.floor((deviceCode.expiresAt - Date.now()) / 1000),
          },
        })

        shell.openExternal(deviceCode.verificationUri)
        sendStatus({ status: 'polling' })

        const token = await pollMiniMaxToken(deviceCode, _internal, controller.signal)

        setProviderAuth({
          providerId: 'minimax-portal',
          mode: 'oauth',
          accessToken: token.access,
          refreshToken: token.refresh,
          expiresAt: token.expires,
        })

        sendStatus({ status: 'success' })
        break
      }

      case 'qwen-portal': {
        const { deviceCode, _internal } = await requestQwenDeviceCode()
        const uri = deviceCode.verificationUriComplete || deviceCode.verificationUri

        sendStatus({
          status: 'device_code',
          info: {
            userCode: deviceCode.userCode,
            verificationUri: uri,
            expiresIn: deviceCode.expiresIn,
          },
        })

        shell.openExternal(uri)
        sendStatus({ status: 'polling' })

        const token = await pollQwenToken(deviceCode, _internal, controller.signal)

        setProviderAuth({
          providerId: 'qwen-portal',
          mode: 'oauth',
          accessToken: token.access,
          refreshToken: token.refresh,
          expiresAt: token.expires,
        })

        sendStatus({ status: 'success' })
        break
      }

      case 'github-copilot': {
        const deviceCode = await requestCopilotDeviceCode()

        sendStatus({
          status: 'device_code',
          info: {
            userCode: deviceCode.userCode,
            verificationUri: deviceCode.verificationUri,
            expiresIn: deviceCode.expiresIn,
          },
        })

        shell.openExternal(deviceCode.verificationUri)
        sendStatus({ status: 'polling' })

        const token = await pollCopilotToken(deviceCode, controller.signal)

        setProviderAuth({
          providerId: 'github-copilot',
          mode: 'oauth',
          // Store GitHub token for refresh, Copilot token as access
          accessToken: token.copilotToken,
          refreshToken: token.githubToken,
          expiresAt: token.copilotTokenExpiresAt,
        })

        sendStatus({ status: 'success' })
        break
      }

      case 'github-token': {
        const ghDeviceCode = await requestGitHubDeviceCode()

        sendStatus({
          status: 'device_code',
          info: {
            userCode: ghDeviceCode.userCode,
            verificationUri: ghDeviceCode.verificationUri,
            expiresIn: ghDeviceCode.expiresIn,
          },
        })

        shell.openExternal(ghDeviceCode.verificationUri)
        sendStatus({ status: 'polling' })

        const ghToken = await pollGitHubToken(ghDeviceCode, controller.signal)

        // 存到 ConfigStore（与手动输入共用同一个 key）
        const configStore = new ConfigStore()
        configStore.set('githubToken', ghToken)

        sendStatus({ status: 'success' })
        break
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      sendStatus({ status: 'error', error: '已取消' })
    } else {
      sendStatus({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    activeFlows.delete(providerId)
  }
}
