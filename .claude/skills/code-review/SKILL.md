# Code Review Skill

基于 GitHub 最火热的 AI 代码检查配置，适配 OpenClaw CN 项目。

## 触发条件

以下场景自动启用此 skill：
- 代码编写或修改后
- PR/MR 提交前
- 代码审查请求
- 提及 "review"、"检查"、"审查"、"代码质量"
- `git diff` 有未提交的改动

## 检查清单

### 🔴 安全问题 (CRITICAL - 必须修复)

#### 硬编码密钥检测
```typescript
// ❌ 严重：硬编码密钥
const apiKey = "sk-proj-xxxxx"
const password = "admin123"
const token = "ghp_xxxxxxxxxxxx"

// ✅ 正确：使用环境变量
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

#### SQL/NoSQL 注入
```typescript
// ❌ 严重：SQL 注入风险
const query = `SELECT * FROM users WHERE id = ${userId}`

// ✅ 正确：参数化查询
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId])
```

#### XSS 跨站脚本
```typescript
// ❌ 高危：XSS 漏洞
element.innerHTML = userInput

// ✅ 正确：使用 textContent 或 sanitize
element.textContent = userInput
// 或使用 DOMPurify
import DOMPurify from 'dompurify'
element.innerHTML = DOMPurify.sanitize(userInput)
```

#### 命令注入
```typescript
// ❌ 严重：命令注入
const { exec } = require('child_process')
exec(`ping ${userInput}`, callback)

// ✅ 正确：使用安全 API
import { execFile } from 'child_process'
execFile('ping', ['-c', '1', sanitizedInput], callback)
```

#### SSRF 服务端请求伪造
```typescript
// ❌ 高危：SSRF 漏洞
const response = await fetch(userProvidedUrl)

// ✅ 正确：验证和白名单
const allowedDomains = ['api.example.com', 'cdn.example.com']
const url = new URL(userProvidedUrl)
if (!allowedDomains.includes(url.hostname)) {
  throw new Error('Invalid URL')
}
```

### 🟠 代码质量 (HIGH - 应该修复)

#### 函数和文件大小
- 函数超过 50 行 → 拆分
- 文件超过 800 行 → 拆分
- 嵌套超过 4 层 → 重构

#### 错误处理
```typescript
// ❌ 缺少错误处理
const data = await fetchData()

// ✅ 正确：完善的错误处理
try {
  const data = await fetchData()
} catch (error) {
  logger.error('Failed to fetch data', { error })
  throw new AppError('DATA_FETCH_FAILED', 'Unable to fetch data')
}
```

#### 调试代码
- 移除所有 `console.log` 语句
- 移除 `debugger` 语句
- 处理或移除 `TODO/FIXME` 注释

### 🟡 配置驱动开发 (HIGH - 应该修复)

**重要**: 所有功能改动、行为调整，都必须优先通过配置来实现，而不是写死在代码里。

#### 检查清单
- [ ] **硬编码魔法数字/字符串** → 应抽成配置项
- [ ] **行为开关** → 应有 `enabled` 类配置
- [ ] **阈值/限制** → 应可配置调整
- [ ] **过滤规则** → 应可配置扩展
- [ ] **配置 schema** → 有类型/默认值/范围/描述
- [ ] **配置读取** → 集中读取，不到处分散
- [ ] **运行时生效** → 支持热更新

#### 反模式示例
```typescript
// ❌ 硬编码魔法数字
const TIMEOUT = 5000
const MAX_RETRIES = 3
const BATCH_SIZE = 100

// ✅ 使用配置
const config = getConfig()
const timeout = config.timeout ?? 5000
const maxRetries = config.maxRetries ?? 3
const batchSize = config.batchSize ?? 100
```

```typescript
// ❌ 硬编码开关
const FEATURE_ENABLED = true
if (FEATURE_ENABLED) { ... }

// ✅ 配置驱动
const config = getConfig()
if (config.features?.newFeature?.enabled) { ... }
```

```typescript
// ❌ 配置分散在业务代码中
function processData() {
  const config = vscode.workspace.getConfiguration('myExt')
  const timeout = config.get('timeout', 5000)
  // ...
}

// ✅ 集中读取配置
class ConfigService {
  private config = loadConfig()

  getTimeout() { return this.config.timeout }
  
  onConfigChange(callback: () => void) {
    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('myExt')) {
        this.config = loadConfig()
        callback()
      }
    })
  }
}
```

#### 配置项设计标准
```typescript
// ✅ 完整的配置 schema
interface Config {
  /** 是否启用功能 */
  enabled: boolean           // 默认: true
  
  /** 请求超时时间 (ms) */
  timeout: number            // 默认: 5000, 范围: 1000-60000
  
  /** 最大重试次数 */
  maxRetries: number         // 默认: 3, 范围: 0-10
  
  /** 文件保留天数 */
  retentionDays: number      // 默认: 30, 范围: 1-365
  
  /** 要排除的文件模式 */
  excludePatterns: string[]  // 默认: ['node_modules', '.git']
}
```

#### 审查问题清单
每次代码审查时，问自己：
1. 这个行为未来是否可能需要"关掉/调小/调大"？
2. 谁来改这些配置（开发、运维、用户）？
3. 合理默认值和安全边界是什么？
4. 配置变更时是否需要重启？

### 🟡 最佳实践 (MEDIUM - 建议修复)

#### 命名规范
```typescript
// ❌ 差的命名
const x = getData()
const tmp = process(x)
const data = transform(tmp)

// ✅ 好的命名
const userProfile = fetchUserProfile()
const validatedProfile = validateProfile(userProfile)
const enrichedProfile = enrichWithMetadata(validatedProfile)
```

#### 不可变性
```typescript
// ❌ 直接修改对象
user.name = newName
array.push(newItem)

// ✅ 使用不可变模式
const updatedUser = { ...user, name: newName }
const newArray = [...array, newItem]
```

#### TypeScript 类型
```typescript
// ❌ 使用 any
function process(data: any): any { ... }

// ✅ 正确的类型定义
function process(data: UserInput): ProcessedOutput { ... }
```

## OpenClaw CN 特定检查

### 渠道安全
- [ ] 企业微信/钉钉/飞书消息加密正确实现
- [ ] 回调签名验证完整
- [ ] Token 安全存储（不在日志中打印）

### API 安全
- [ ] 所有端点有身份验证
- [ ] 输入参数有验证
- [ ] 有速率限制
- [ ] CORS 正确配置

### 配置安全
- [ ] 敏感配置使用环境变量
- [ ] 配置文件不包含密钥
- [ ] 生产环境关闭 debug 模式

## 检查输出格式

```
[CRITICAL] 硬编码 API 密钥
文件: src/api/client.ts:42
问题: API 密钥暴露在源代码中
修复: 移动到环境变量

const apiKey = "sk-abc123";  // ❌ 问题代码
const apiKey = process.env.API_KEY;  // ✓ 修复方案
```

## 审批标准

- ✅ **通过**: 无 CRITICAL 或 HIGH 问题
- ⚠️ **警告**: 仅有 MEDIUM 问题（可谨慎合并）
- ❌ **阻止**: 存在 CRITICAL 或 HIGH 问题

## 检查命令

```bash
# 检查依赖漏洞
pnpm audit

# 检查代码质量
pnpm lint

# 查看未提交的改动
git diff --stat

# 搜索硬编码密钥
grep -r "api[_-]?key\|password\|secret\|token" --include="*.ts" --include="*.js" src/
```

## 常见误报排除

以下情况不应标记为问题：
- `.env.example` 中的示例值
- 测试文件中明确标注的测试凭据
- 公开的 API 密钥（如某些前端 SDK）
- 用于校验和的 SHA256/MD5（非密码）

**始终验证上下文后再标记问题。**
