// ═══════════════════════════════════════════════════════════════
// skill_install — 从 GitHub 下载并安装 Skill
//
// 流程：
//   1. 通过 GitHub tarball API 下载仓库压缩包
//   2. 解压到临时目录
//   3. 定位 skill.json（可能在根目录或子目录中）
//   4. 调用 skill_validate 验证安全性
//   5. 复制到 ~/.openevo/skills/market/{skill_name}/
// ═══════════════════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as zlib from 'zlib'
import type { SkillContext } from '../../types'

// ─── 类型 ───

interface InstallInput {
  repo: string
  skill_name: string
  branch?: string
}

interface InstallOutput {
  success: boolean
  skill_name: string
  installed_path?: string
  files?: string[]
  error?: string
}

// ─── 辅助：获取 GitHub Token ───

function getGitHubToken(ctx: SkillContext): string | undefined {
  const envToken = (ctx.env as Record<string, unknown>)?.githubToken as string | undefined
  if (envToken) return envToken
  return process.env.GITHUB_TOKEN || undefined
}

// ─── 执行器 ───

export async function execute(
  input: InstallInput,
  ctx: SkillContext,
): Promise<InstallOutput> {
  const { repo, skill_name } = input
  const branch = input.branch || 'main'
  const marketDir = path.join(os.homedir(), '.openevo', 'skills', 'market')
  const installDir = path.join(marketDir, skill_name)
  const tmpDir = path.join(os.tmpdir(), `openevo-install-${Date.now()}`)
  const token = getGitHubToken(ctx)

  try {
    // 1. 下载 tarball
    ctx.log(`正在从 ${repo}@${branch} 下载...`)
    const tarballUrl = `https://api.github.com/repos/${repo}/tarball/${branch}`
    const tarData = await downloadTarball(tarballUrl, token)

    // 2. 解压
    ctx.log('正在解压...')
    fs.mkdirSync(tmpDir, { recursive: true })
    await extractTarGz(tarData, tmpDir)

    // 3. 定位 skill.json
    const skillJsonDir = findSkillJson(tmpDir)
    if (!skillJsonDir) {
      return {
        success: false, skill_name,
        error: `仓库 ${repo} 中未找到 skill.json`,
      }
    }

    // 4. 调用 skill_validate 验证
    ctx.log('正在验证安全性...')
    const validation = await ctx.call<{
      safe: boolean
      issues: string[]
      warnings: string[]
    }>('skill_validate', { local_path: skillJsonDir })

    if (!validation.safe) {
      return {
        success: false, skill_name,
        error: `安全校验失败: ${validation.issues.join('; ')}`,
      }
    }

    if (validation.warnings.length > 0) {
      ctx.log(`安全警告: ${validation.warnings.join('; ')}`)
    }

    // 5. 复制到 market 目录
    ctx.log(`正在安装到 ${installDir}...`)
    fs.mkdirSync(installDir, { recursive: true })
    const files = copySkillFiles(skillJsonDir, installDir)

    // 清理临时目录
    fs.rmSync(tmpDir, { recursive: true, force: true })

    ctx.log(`安装完成: ${skill_name} (${files.length} 个文件)`)

    return {
      success: true,
      skill_name,
      installed_path: installDir,
      files,
    }
  } catch (err) {
    // 清理临时目录
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }

    return {
      success: false,
      skill_name,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── 下载 tarball ───

async function downloadTarball(url: string, token?: string): Promise<Buffer> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'OpenEvo-SkillInstall/1.0',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    headers,
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ─── 解压 tar.gz ───
// 简单的 tar 解析器 — 不引入第三方依赖

async function extractTarGz(data: Buffer, outDir: string): Promise<void> {
  // 解压 gzip
  const tarData = await new Promise<Buffer>((resolve, reject) => {
    zlib.gunzip(data, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  // 解析 tar
  let offset = 0
  while (offset < tarData.length) {
    // tar header = 512 bytes
    if (offset + 512 > tarData.length) break

    const header = tarData.subarray(offset, offset + 512)

    // 空 block = 结束
    if (header.every(b => b === 0)) break

    // 文件名
    const rawName = header.subarray(0, 100).toString('utf-8').replace(/\0/g, '')
    if (!rawName) break

    // 文件大小（八进制）
    const sizeStr = header.subarray(124, 136).toString('utf-8').replace(/\0/g, '').trim()
    const fileSize = parseInt(sizeStr, 8) || 0

    // 类型标志
    const typeFlag = header[156]

    offset += 512 // 跳过 header

    if (typeFlag === 53 || rawName.endsWith('/')) {
      // 目录
      const dirPath = path.join(outDir, rawName)
      fs.mkdirSync(dirPath, { recursive: true })
    } else if (typeFlag === 0 || typeFlag === 48) {
      // 普通文件
      const filePath = path.join(outDir, rawName)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })

      if (fileSize > 0) {
        const fileData = tarData.subarray(offset, offset + fileSize)
        fs.writeFileSync(filePath, fileData)
      } else {
        fs.writeFileSync(filePath, '')
      }
    }

    // 对齐到 512 字节
    offset += Math.ceil(fileSize / 512) * 512
  }
}

// ─── 定位 skill.json ───

function findSkillJson(dir: string): string | null {
  // GitHub tarball 通常有一层 prefix 目录（如 owner-repo-sha/）
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  // 直接检查当前目录
  if (fs.existsSync(path.join(dir, 'skill.json'))) {
    return dir
  }

  // 检查子目录（一般只有一个 prefix 目录）
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name)
      if (fs.existsSync(path.join(subDir, 'skill.json'))) {
        return subDir
      }
      // 再搜一层
      const deeper = findSkillJson(subDir)
      if (deeper) return deeper
    }
  }

  return null
}

// ─── 复制 Skill 文件 ───

function copySkillFiles(srcDir: string, destDir: string): string[] {
  const files: string[] = []

  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    // 跳过不需要的文件/目录
    if (entry.name === 'node_modules' || entry.name === '.git') continue

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      const subFiles = copySkillFiles(srcPath, destPath)
      files.push(...subFiles.map(f => path.join(entry.name, f)))
    } else {
      fs.copyFileSync(srcPath, destPath)
      files.push(entry.name)
    }
  }

  return files
}
