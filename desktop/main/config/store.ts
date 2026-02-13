import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.openevo')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export class ConfigStore {
  private data: Record<string, unknown> = {}

  constructor() {
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        this.data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      }
    } catch {
      this.data = {}
    }
  }

  private save() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2))
  }

  get(key: string): unknown {
    return this.data[key]
  }

  set(key: string, value: unknown) {
    this.data[key] = value
    this.save()
  }

  delete(key: string) {
    delete this.data[key]
    this.save()
  }
}
