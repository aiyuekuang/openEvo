// Provider auth & config persistence

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { ProviderAuth, ProviderConfig, ProviderStatus } from './types'
import { getProviderById, PRESET_PROVIDERS } from './registry'

const CONFIG_DIR = path.join(app?.getPath('userData') || '', 'config')
const PROVIDERS_FILE = path.join(CONFIG_DIR, 'providers.json')
const CUSTOM_PROVIDERS_FILE = path.join(CONFIG_DIR, 'custom-providers.json')

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

// --- Provider Auth ---

function loadProviderAuths(): Record<string, ProviderAuth> {
  try {
    if (fs.existsSync(PROVIDERS_FILE)) {
      return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveProviderAuths(auths: Record<string, ProviderAuth>) {
  ensureDir()
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(auths, null, 2))
}

export function getProviderAuth(providerId: string): ProviderAuth | null {
  const auths = loadProviderAuths()
  return auths[providerId] || null
}

export function setProviderAuth(auth: ProviderAuth): void {
  const auths = loadProviderAuths()
  auths[auth.providerId] = auth
  saveProviderAuths(auths)
}

export function deleteProviderAuth(providerId: string): void {
  const auths = loadProviderAuths()
  delete auths[providerId]
  saveProviderAuths(auths)
}

// --- Default Model ---

const DEFAULTS_FILE = path.join(CONFIG_DIR, 'defaults.json')

function loadDefaults(): Record<string, string> {
  try {
    if (fs.existsSync(DEFAULTS_FILE)) {
      return JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveDefaults(defaults: Record<string, string>) {
  ensureDir()
  fs.writeFileSync(DEFAULTS_FILE, JSON.stringify(defaults, null, 2))
}

export function getDefaultModel(providerId: string): string | null {
  return loadDefaults()[providerId] || null
}

export function setDefaultModel(providerId: string, modelId: string): void {
  const defaults = loadDefaults()
  defaults[providerId] = modelId
  saveDefaults(defaults)
}

/** Get the globally active provider + model for task execution */
export function getActiveProvider(): { providerId: string; model: string } | null {
  const defaults = loadDefaults()
  const activeId = defaults['__active_provider__']
  const activeModel = defaults['__active_model__']
  if (activeId && activeModel) return { providerId: activeId, model: activeModel }
  // Fallback: find first configured provider
  const auths = loadProviderAuths()
  for (const [id, auth] of Object.entries(auths)) {
    if (auth.apiKey || auth.accessToken) {
      const provider = getProviderById(id)
      const model = defaults[id] || provider?.models[0]?.id
      if (model) return { providerId: id, model }
    }
  }
  return null
}

export function setActiveProvider(providerId: string, model: string): void {
  const defaults = loadDefaults()
  defaults['__active_provider__'] = providerId
  defaults['__active_model__'] = model
  saveDefaults(defaults)
}

// --- Provider Status (for frontend) ---

export function getAllProviderStatuses(): ProviderStatus[] {
  const auths = loadProviderAuths()
  const defaults = loadDefaults()

  return PRESET_PROVIDERS.map((p) => {
    const auth = auths[p.id]
    const configured = !!(auth?.apiKey || auth?.accessToken)
    return {
      providerId: p.id,
      configured,
      authMode: auth?.mode,
      email: auth?.email,
      maskedKey: auth?.apiKey ? maskKey(auth.apiKey) : undefined,
      defaultModel: defaults[p.id] || p.models[0]?.id,
    }
  })
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.substring(0, 8) + '...****'
}

// --- Custom Providers ---

function loadCustomProviders(): ProviderConfig[] {
  try {
    if (fs.existsSync(CUSTOM_PROVIDERS_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOM_PROVIDERS_FILE, 'utf-8'))
    }
  } catch {}
  return []
}

function saveCustomProviders(providers: ProviderConfig[]) {
  ensureDir()
  fs.writeFileSync(CUSTOM_PROVIDERS_FILE, JSON.stringify(providers, null, 2))
}

export function getCustomProvider(id: string): ProviderConfig | null {
  return loadCustomProviders().find((p) => p.id === id) || null
}

export function addCustomProvider(provider: ProviderConfig): void {
  const providers = loadCustomProviders()
  providers.push(provider)
  saveCustomProviders(providers)
}

export function removeCustomProvider(id: string): void {
  const providers = loadCustomProviders().filter((p) => p.id !== id)
  saveCustomProviders(providers)
  deleteProviderAuth(id)
}

export function getCustomProviders(): ProviderConfig[] {
  return loadCustomProviders()
}
