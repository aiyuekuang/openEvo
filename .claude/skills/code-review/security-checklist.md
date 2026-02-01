# 安全检查清单

## OWASP Top 10 检查

### 1. 注入攻击 (Injection)
- [ ] SQL 查询使用参数化
- [ ] NoSQL 查询安全处理
- [ ] 命令行参数已转义
- [ ] LDAP 查询已过滤

### 2. 身份验证失效 (Broken Authentication)
- [ ] 密码使用安全哈希 (bcrypt, argon2)
- [ ] JWT 正确验证
- [ ] Session 安全配置
- [ ] 支持 MFA

### 3. 敏感数据泄露 (Sensitive Data Exposure)
- [ ] HTTPS 强制启用
- [ ] 密钥使用环境变量
- [ ] PII 加密存储
- [ ] 日志已脱敏

### 4. XML 外部实体 (XXE)
- [ ] XML 解析器安全配置
- [ ] 外部实体处理已禁用

### 5. 访问控制失效 (Broken Access Control)
- [ ] 每个路由都有授权检查
- [ ] 对象引用使用间接引用
- [ ] CORS 正确配置

### 6. 安全配置错误 (Security Misconfiguration)
- [ ] 默认凭据已更改
- [ ] 错误处理安全
- [ ] 安全 Headers 已设置
- [ ] 生产环境关闭 debug

### 7. 跨站脚本 (XSS)
- [ ] 输出已转义/清理
- [ ] CSP 策略已设置
- [ ] 框架默认转义

### 8. 不安全的反序列化 (Insecure Deserialization)
- [ ] 用户输入安全反序列化
- [ ] 反序列化库已更新

### 9. 使用已知漏洞组件 (Using Components with Known Vulnerabilities)
- [ ] 依赖已更新
- [ ] npm audit 通过
- [ ] CVE 监控中

### 10. 日志和监控不足 (Insufficient Logging & Monitoring)
- [ ] 安全事件已记录
- [ ] 日志有监控
- [ ] 告警已配置

## OpenClaw CN 特定安全检查

### 渠道集成安全

#### 企业微信 (WeCom)
```typescript
// ✅ 正确的签名验证
import { verifySignature } from './wecom/crypto'

const isValid = verifySignature({
  token: process.env.WECOM_TOKEN,
  timestamp,
  nonce,
  signature: msgSignature
})

if (!isValid) {
  throw new Error('Invalid signature')
}
```

#### 钉钉 (DingTalk)
```typescript
// ✅ 正确的签名验证
import { verifyCallback } from './dingtalk/crypto'

const isValid = verifyCallback({
  token: process.env.DINGTALK_TOKEN,
  timestamp,
  nonce,
  signature
})
```

#### 飞书 (Feishu)
```typescript
// ✅ 正确的签名验证
import { verifySignature } from './feishu/crypto'

const isValid = verifySignature({
  encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  timestamp,
  nonce,
  signature
})
```

### Token 管理
- [ ] Access Token 不记录在日志中
- [ ] Token 刷新机制正确实现
- [ ] Token 过期处理得当
- [ ] 存储使用安全方式

### 消息加解密
- [ ] AES-256-CBC 正确实现
- [ ] IV 每次随机生成
- [ ] PKCS7 填充正确
- [ ] 解密失败安全处理

### Webhook 安全
- [ ] 来源 IP 验证（如适用）
- [ ] 请求签名验证
- [ ] 重放攻击防护
- [ ] 超时处理

## 检查脚本

```bash
#!/bin/bash

echo "🔍 Running security checks..."

# 1. 检查硬编码密钥
echo "\n📌 Checking for hardcoded secrets..."
grep -rn "api[_-]?key\s*[:=]\s*['\"][^'\"]*['\"]" \
  --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules \
  src/ && echo "⚠️ Potential hardcoded secrets found!" || echo "✅ No hardcoded secrets"

# 2. 检查依赖漏洞
echo "\n📌 Checking for vulnerable dependencies..."
pnpm audit --audit-level=high

# 3. 检查 console.log
echo "\n📌 Checking for console.log statements..."
grep -rn "console\\.log" \
  --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules \
  --exclude="*.test.ts" --exclude="*.spec.ts" \
  src/ && echo "⚠️ console.log statements found!" || echo "✅ No console.log"

# 4. 类型检查
echo "\n📌 Running TypeScript type check..."
pnpm tsc --noEmit

echo "\n✅ Security check complete!"
```

## 紧急响应流程

发现 CRITICAL 漏洞时：

1. **记录** - 创建详细报告
2. **通知** - 立即告知项目负责人
3. **建议修复** - 提供安全代码示例
4. **测试修复** - 验证修复有效
5. **检查影响** - 确认漏洞是否已被利用
6. **轮换密钥** - 如凭据泄露则轮换
7. **更新文档** - 添加到安全知识库
