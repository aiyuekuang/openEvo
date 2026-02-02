# 技能状态设计文档

## 一、状态枚举定义

### 1.1 主状态 (SkillStatus)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         技能生命周期状态图                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌────────────┐                                                         │
│   │ not_installed│  未安装 - 技能市场中的可选技能                          │
│   └──────┬─────┘                                                         │
│          │ 点击安装                                                       │
│          ▼                                                               │
│   ┌────────────┐                                                         │
│   │ installing  │  安装中 - 复制技能文件到 ~/.openclaw/skills/             │
│   └──────┬─────┘                                                         │
│          │ 安装完成                                                       │
│          ▼                                                               │
│   ┌────────────────────────────────────────────────────────┐             │
│   │                    依赖检测分支                          │             │
│   ├────────────────────────────────────────────────────────┤             │
│   │                                                        │             │
│   │   缺少 CLI?  ─────→  needs_deps     需要安装依赖        │             │
│   │       │                   │                            │             │
│   │       │                   │ 用户安装                    │             │
│   │       │                   ▼                            │             │
│   │       │            installing_deps  安装依赖中          │             │
│   │       │                   │                            │             │
│   │       │                   │ 安装完成                    │             │
│   │       ▼                   ▼                            │             │
│   │   缺少配置? ─────→  needs_config    需要配置            │             │
│   │       │                   │                            │             │
│   │       │                   │ 用户配置                    │             │
│   │       │                   ▼                            │             │
│   │       │            configuring       配置中             │             │
│   │       │                   │                            │             │
│   │       │                   │ 配置完成                    │             │
│   │       ▼                   ▼                            │             │
│   │   ┌─────────┐                                          │             │
│   │   │  ready  │  已就绪 - 可以正常使用                    │             │
│   │   └────┬────┘                                          │             │
│   └────────┼───────────────────────────────────────────────┘             │
│            │                                                             │
│            │ 启用技能                                                     │
│            ▼                                                             │
│     ┌────────────┐                                                       │
│     │   active   │  运行中 - Agent 可调用此技能                           │
│     └────────────┘                                                       │
│                                                                          │
│   特殊状态:                                                               │
│   ┌────────────┐                                                         │
│   │   error    │  错误 - 检测/安装/配置过程出错                           │
│   └────────────┘                                                         │
│   ┌────────────┐                                                         │
│   │  disabled  │  已禁用 - 用户手动禁用                                   │
│   └────────────┘                                                         │
│   ┌────────────┐                                                         │
│   │ unsupported│  不支持 - 当前系统不支持此技能                           │
│   └────────────┘                                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 状态枚举值

| 状态值 | 显示名称 | 图标 | 颜色 | 说明 |
|--------|----------|------|------|------|
| `not_installed` | 未安装 | ➕ | default | 在市场中可见，未安装到本地 |
| `installing` | 安装中 | ⏳ | processing | 正在复制技能文件 |
| `needs_deps` | 需安装依赖 | 📦 | warning | 缺少必要的 CLI 工具 |
| `installing_deps` | 安装依赖中 | ⏳ | processing | 正在安装 CLI 依赖 |
| `needs_config` | 需配置 | ⚙️ | warning | 缺少 API Key 等配置 |
| `configuring` | 配置中 | ⏳ | processing | 正在保存配置 |
| `ready` | 已就绪 | ✅ | success | 可用但未启用 |
| `active` | 运行中 | 🟢 | success | 已启用，Agent 可调用 |
| `disabled` | 已禁用 | ⏸️ | default | 用户手动禁用 |
| `error` | 错误 | ❌ | error | 出现错误 |
| `unsupported` | 不支持 | 🚫 | default | 系统不支持 |

---

## 二、状态对应的 UI 交互

### 2.1 技能卡片状态展示

#### 状态: `not_installed` (未安装)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录                       │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                             [+ 安装]  │
└──────────────────────────────────────┘
```
**操作按钮**: `+ 安装` (primary)

---

#### 状态: `installing` (安装中)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录                       │
│ ⏳ 安装中...                          │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                        [安装中...]    │
└──────────────────────────────────────┘
```
**操作按钮**: `安装中...` (disabled, loading)

---

#### 状态: `needs_deps` (需安装依赖)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录            ✓ 已安装   │
│ ⚠️ 缺少依赖: memo                     │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                        [📦 安装依赖]  │
└──────────────────────────────────────┘
```
**操作按钮**: `📦 安装依赖` (warning color)
**点击后弹窗**: 显示安装方式选择（brew/npm/手动等）

---

#### 状态: `needs_config` (需配置)
```
┌──────────────────────────────────────┐
│ 📝 Notion 集成             ✓ 已安装   │
│ ⚙️ 需要配置 API Key                   │
│                                      │
│ 连接 Notion 数据库和页面              │
│                                      │
│ [笔记] [集成]                         │
│                          [⚙️ 配置]    │
└──────────────────────────────────────┘
```
**操作按钮**: `⚙️ 配置` (warning color)
**点击后弹窗**: 显示配置表单

---

#### 状态: `ready` (已就绪)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录            ✓ 已安装   │
│ ✅ 已就绪                             │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                 [详情]  [▶️ 启用]      │
└──────────────────────────────────────┘
```
**操作按钮**: `▶️ 启用` (primary)
**次要按钮**: `详情` / `配置` / `卸载`

---

#### 状态: `active` (运行中)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录            ✓ 已安装   │
│ 🟢 运行中                             │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                 [详情]  [⏸️ 禁用]      │
└──────────────────────────────────────┘
```
**操作按钮**: `⏸️ 禁用` (default)
**次要按钮**: `详情` / `配置`

---

#### 状态: `disabled` (已禁用)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录            ✓ 已安装   │
│ ⏸️ 已禁用                             │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│             [🗑 卸载]  [▶️ 启用]       │
└──────────────────────────────────────┘
```
**操作按钮**: `▶️ 启用` (primary)
**次要按钮**: `🗑 卸载`

---

#### 状态: `error` (错误)
```
┌──────────────────────────────────────┐
│ 📝 Apple 备忘录            ✓ 已安装   │
│ ❌ 错误: memo 命令执行失败             │
│                                      │
│ 通过 memo CLI 管理 macOS 备忘录       │
│                                      │
│ [备忘录] [notes]                      │
│                [查看详情] [🔄 重试]    │
└──────────────────────────────────────┘
```
**操作按钮**: `🔄 重试` (danger color)
**次要按钮**: `查看详情`

---

### 2.2 弹窗设计

#### 2.2.1 安装依赖弹窗

```
┌───────────────────────────────────────────────────┐
│ 📦 安装依赖 - Apple 备忘录                    [X] │
├───────────────────────────────────────────────────┤
│                                                   │
│  此技能需要安装以下依赖:                           │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  memo  - macOS 备忘录 CLI 工具               │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  选择安装方式:                                     │
│                                                   │
│  ○ Homebrew (推荐)                                │
│    brew install memo                             │
│                                                   │
│  ○ 手动安装                                       │
│    访问 https://github.com/xxx/memo              │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 💡 安装完成后点击"验证"检测                   │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│                        [取消]  [一键安装]  [验证]  │
└───────────────────────────────────────────────────┘
```

#### 2.2.2 配置弹窗

```
┌───────────────────────────────────────────────────┐
│ ⚙️ 配置 - Notion 集成                         [X] │
├───────────────────────────────────────────────────┤
│                                                   │
│  Notion API Key *                                 │
│  ┌─────────────────────────────────────────────┐  │
│  │ ●●●●●●●●●●●●●●●●                         👁  │  │
│  └─────────────────────────────────────────────┘  │
│  获取 API Key: https://notion.so/my-integrations  │
│                                                   │
│  默认数据库 ID (可选)                              │
│  ┌─────────────────────────────────────────────┐  │
│  │                                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 配置将安全保存到 ~/.openclaw/skills/        │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│                              [取消]  [保存并验证]  │
└───────────────────────────────────────────────────┘
```

---

## 三、状态转换逻辑

### 3.1 状态转换表

| 当前状态 | 触发动作 | 下一状态 | 条件 |
|----------|----------|----------|------|
| `not_installed` | 点击安装 | `installing` | - |
| `installing` | 安装完成 | `needs_deps` | 缺少 CLI |
| `installing` | 安装完成 | `needs_config` | 有 CLI，缺配置 |
| `installing` | 安装完成 | `ready` | 无依赖需求 |
| `installing` | 安装失败 | `error` | - |
| `needs_deps` | 点击安装依赖 | `installing_deps` | - |
| `needs_deps` | 点击验证 | `needs_config` | CLI 已安装，缺配置 |
| `needs_deps` | 点击验证 | `ready` | CLI 已安装，无需配置 |
| `installing_deps` | 安装完成 | `needs_config` | 缺配置 |
| `installing_deps` | 安装完成 | `ready` | 无需配置 |
| `installing_deps` | 安装失败 | `error` | - |
| `needs_config` | 点击配置 | `configuring` | - |
| `configuring` | 配置完成 | `ready` | - |
| `configuring` | 配置失败 | `error` | - |
| `ready` | 点击启用 | `active` | - |
| `active` | 点击禁用 | `disabled` | - |
| `disabled` | 点击启用 | `active` | - |
| `disabled` | 点击卸载 | `not_installed` | - |
| `error` | 点击重试 | 之前状态 | - |
| `*` (已安装) | 点击卸载 | `not_installed` | - |

### 3.2 状态检测优先级

检测顺序（从高到低）:

1. **系统支持检测** → 不支持则 `unsupported`
2. **安装检测** → 未安装则 `not_installed`  
3. **用户禁用检测** → 已禁用则 `disabled`
4. **依赖检测** → 缺 CLI 则 `needs_deps`
5. **配置检测** → 缺配置则 `needs_config`
6. **启用检测** → 已启用则 `active`，否则 `ready`

---

## 四、代码实现

### 4.1 更新后的状态枚举

```typescript
/**
 * 技能生命周期状态
 */
export type SkillStatus =
  // === 未安装阶段 ===
  | "not_installed"      // 未安装 - 在市场中可见
  
  // === 安装阶段 ===
  | "installing"         // 安装中 - 复制技能文件
  
  // === 依赖阶段 ===
  | "needs_deps"         // 需安装依赖 - 缺少 CLI 工具
  | "installing_deps"    // 安装依赖中
  
  // === 配置阶段 ===
  | "needs_config"       // 需配置 - 缺少 API Key 等
  | "configuring"        // 配置中
  
  // === 可用阶段 ===
  | "ready"              // 已就绪 - 可用但未启用
  | "active"             // 运行中 - 已启用，Agent 可调用
  
  // === 特殊状态 ===
  | "disabled"           // 已禁用 - 用户手动禁用
  | "error"              // 错误
  | "unsupported";       // 不支持当前系统
```

### 4.2 状态配置

```typescript
export const SKILL_STATUS_CONFIG: Record<SkillStatus, {
  label: string;
  icon: string;
  color: 'default' | 'processing' | 'success' | 'warning' | 'error';
  description: string;
  actions: SkillAction[];
}> = {
  not_installed: {
    label: '未安装',
    icon: '➕',
    color: 'default',
    description: '点击安装使用此技能',
    actions: ['install'],
  },
  installing: {
    label: '安装中',
    icon: '⏳',
    color: 'processing',
    description: '正在安装技能...',
    actions: [],
  },
  needs_deps: {
    label: '需安装依赖',
    icon: '📦',
    color: 'warning',
    description: '缺少必要的 CLI 工具',
    actions: ['install_deps', 'verify', 'uninstall'],
  },
  installing_deps: {
    label: '安装依赖中',
    icon: '⏳',
    color: 'processing',
    description: '正在安装依赖...',
    actions: [],
  },
  needs_config: {
    label: '需配置',
    icon: '⚙️',
    color: 'warning',
    description: '需要配置 API Key 等信息',
    actions: ['configure', 'uninstall'],
  },
  configuring: {
    label: '配置中',
    icon: '⏳',
    color: 'processing',
    description: '正在保存配置...',
    actions: [],
  },
  ready: {
    label: '已就绪',
    icon: '✅',
    color: 'success',
    description: '可以启用此技能',
    actions: ['enable', 'configure', 'uninstall'],
  },
  active: {
    label: '运行中',
    icon: '🟢',
    color: 'success',
    description: 'Agent 可以调用此技能',
    actions: ['disable', 'configure'],
  },
  disabled: {
    label: '已禁用',
    icon: '⏸️',
    color: 'default',
    description: '技能已被禁用',
    actions: ['enable', 'uninstall'],
  },
  error: {
    label: '错误',
    icon: '❌',
    color: 'error',
    description: '出现错误，请重试',
    actions: ['retry', 'view_error', 'uninstall'],
  },
  unsupported: {
    label: '不支持',
    icon: '🚫',
    color: 'default',
    description: '当前系统不支持此技能',
    actions: [],
  },
};
```

---

## 五、数据结构

### 5.1 技能状态详情

```typescript
export type SkillStatusInfo = {
  /** 当前状态 */
  status: SkillStatus;
  
  /** 是否已安装到本地 */
  installed: boolean;
  
  /** 是否已启用 */
  enabled: boolean;
  
  /** 状态消息 */
  message?: string;
  
  /** 依赖信息 */
  deps?: {
    /** 缺失的 CLI */
    missing: string[];
    /** 可用的安装方式 */
    installOptions: SkillInstallOption[];
  };
  
  /** 配置信息 */
  config?: {
    /** 缺失的配置项 */
    missing: string[];
    /** 配置字段定义 */
    fields: SkillConfigField[];
  };
  
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: string;
  };
};
```

### 5.2 技能安装选项

```typescript
export type SkillInstallOption = {
  /** 安装方式 ID */
  id: string;
  
  /** 显示名称 */
  label: string;
  
  /** 安装命令 */
  command: string;
  
  /** 是否推荐 */
  recommended?: boolean;
  
  /** 安装说明链接 */
  docUrl?: string;
};
```

### 5.3 技能配置字段

```typescript
export type SkillConfigField = {
  /** 字段 key */
  key: string;
  
  /** 显示名称 */
  label: string;
  
  /** 字段类型 */
  type: 'text' | 'password' | 'select' | 'boolean';
  
  /** 是否必填 */
  required: boolean;
  
  /** 占位符 */
  placeholder?: string;
  
  /** 帮助文本 */
  helpText?: string;
  
  /** 帮助链接 */
  helpUrl?: string;
  
  /** 下拉选项 (type=select 时) */
  options?: { value: string; label: string }[];
  
  /** 默认值 */
  defaultValue?: string | boolean;
};
```

### 5.4 技能动作类型

```typescript
export type SkillAction =
  | 'install'          // 安装技能
  | 'uninstall'        // 卸载技能
  | 'install_deps'     // 安装依赖
  | 'verify'           // 验证依赖
  | 'configure'        // 打开配置
  | 'enable'           // 启用技能
  | 'disable'          // 禁用技能
  | 'retry'            // 重试
  | 'view_error';      // 查看错误详情
```

---

## 六、状态检测实现

### 6.1 检测流程

```typescript
export async function detectSkillStatus(
  skill: SkillDefinition,
  installedSkills: Map<string, InstalledSkill>,
  userConfig: SkillUserConfig
): Promise<SkillStatusInfo> {
  // 1. 系统支持检测
  if (skill.platforms && !skill.platforms.includes(process.platform)) {
    return {
      status: 'unsupported',
      installed: false,
      enabled: false,
      message: `此技能仅支持 ${skill.platforms.join(', ')}`
    };
  }

  // 2. 安装检测
  const installed = installedSkills.has(skill.id);
  if (!installed) {
    return {
      status: 'not_installed',
      installed: false,
      enabled: false,
    };
  }

  // 3. 用户禁用检测
  if (userConfig.disabled?.includes(skill.id)) {
    return {
      status: 'disabled',
      installed: true,
      enabled: false,
    };
  }

  // 4. 依赖检测
  const missingDeps = await detectMissingDeps(skill);
  if (missingDeps.length > 0) {
    return {
      status: 'needs_deps',
      installed: true,
      enabled: false,
      deps: {
        missing: missingDeps,
        installOptions: getInstallOptions(skill, missingDeps),
      },
    };
  }

  // 5. 配置检测
  const missingConfig = await detectMissingConfig(skill);
  if (missingConfig.length > 0) {
    return {
      status: 'needs_config',
      installed: true,
      enabled: false,
      config: {
        missing: missingConfig,
        fields: getConfigFields(skill),
      },
    };
  }

  // 6. 启用检测
  const enabled = userConfig.enabled?.includes(skill.id) ?? false;
  return {
    status: enabled ? 'active' : 'ready',
    installed: true,
    enabled,
  };
}
```

### 6.2 CLI 依赖检测

```typescript
import { which } from './utils';

export async function detectMissingDeps(
  skill: SkillDefinition
): Promise<string[]> {
  if (!skill.requirements?.cli) {
    return [];
  }

  const missing: string[] = [];
  
  for (const cli of skill.requirements.cli) {
    const found = await which(cli.command);
    if (!found) {
      missing.push(cli.command);
    }
  }

  return missing;
}
```

### 6.3 配置检测

```typescript
export async function detectMissingConfig(
  skill: SkillDefinition
): Promise<string[]> {
  if (!skill.config?.fields) {
    return [];
  }

  const savedConfig = await loadSkillConfig(skill.id);
  const missing: string[] = [];

  for (const field of skill.config.fields) {
    if (field.required && !savedConfig?.[field.key]) {
      missing.push(field.key);
    }
  }

  return missing;
}
```

---

## 七、状态持久化

### 7.1 用户配置文件结构

配置存储在 `~/.openclaw/skills/config.json`:

```json
{
  "enabled": ["apple-notes", "notion"],
  "disabled": ["calendar"],
  "configs": {
    "notion": {
      "apiKey": "secret_xxx",
      "defaultDatabase": "abc123"
    },
    "github": {
      "token": "ghp_xxx"
    }
  }
}
```

### 7.2 技能安装记录

安装记录存储在 `~/.openclaw/skills/installed.json`:

```json
{
  "apple-notes": {
    "installedAt": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "source": "marketplace"
  },
  "notion": {
    "installedAt": "2024-01-16T14:20:00Z",
    "version": "2.1.0",
    "source": "marketplace"
  }
}
```

---

## 八、API 接口设计

### 8.1 技能状态 API

```typescript
// GET /api/skills
// 获取所有技能及状态
interface SkillListResponse {
  skills: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    tags: string[];
    statusInfo: SkillStatusInfo;
  }>;
}

// POST /api/skills/:id/install
// 安装技能
interface InstallSkillResponse {
  success: boolean;
  statusInfo: SkillStatusInfo;
}

// POST /api/skills/:id/uninstall
// 卸载技能
interface UninstallSkillResponse {
  success: boolean;
}

// POST /api/skills/:id/enable
// 启用技能
interface EnableSkillResponse {
  success: boolean;
  statusInfo: SkillStatusInfo;
}

// POST /api/skills/:id/disable
// 禁用技能
interface DisableSkillResponse {
  success: boolean;
}

// POST /api/skills/:id/configure
// 保存技能配置
interface ConfigureSkillRequest {
  config: Record<string, string | boolean>;
}
interface ConfigureSkillResponse {
  success: boolean;
  statusInfo: SkillStatusInfo;
}

// POST /api/skills/:id/verify-deps
// 验证依赖是否已安装
interface VerifyDepsResponse {
  success: boolean;
  statusInfo: SkillStatusInfo;
}
```

---

## 九、前端状态管理

### 9.1 Zustand Store

```typescript
import { create } from 'zustand';

interface SkillsState {
  /** 技能列表 */
  skills: SkillWithStatus[];
  
  /** 加载状态 */
  loading: boolean;
  
  /** 当前操作中的技能 */
  processingSkills: Set<string>;
  
  /** 操作 */
  fetchSkills: () => Promise<void>;
  installSkill: (id: string) => Promise<void>;
  uninstallSkill: (id: string) => Promise<void>;
  enableSkill: (id: string) => Promise<void>;
  disableSkill: (id: string) => Promise<void>;
  configureSkill: (id: string, config: Record<string, any>) => Promise<void>;
  verifyDeps: (id: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  loading: false,
  processingSkills: new Set(),

  fetchSkills: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      set({ skills: data.skills });
    } finally {
      set({ loading: false });
    }
  },

  installSkill: async (id: string) => {
    set(state => ({
      processingSkills: new Set([...state.processingSkills, id]),
      skills: state.skills.map(s =>
        s.id === id
          ? { ...s, statusInfo: { ...s.statusInfo, status: 'installing' } }
          : s
      ),
    }));

    try {
      const res = await fetch(`/api/skills/${id}/install`, { method: 'POST' });
      const data = await res.json();
      
      set(state => ({
        skills: state.skills.map(s =>
          s.id === id ? { ...s, statusInfo: data.statusInfo } : s
        ),
      }));
    } finally {
      set(state => {
        const next = new Set(state.processingSkills);
        next.delete(id);
        return { processingSkills: next };
      });
    }
  },

  // ... 其他操作类似
}));
```

---

## 十、测试用例

### 10.1 状态检测测试

```typescript
describe('detectSkillStatus', () => {
  it('应返回 unsupported 当平台不支持时', async () => {
    const skill = { id: 'ios-only', platforms: ['darwin'] };
    // 模拟 Windows 环境
    const result = await detectSkillStatus(skill, new Map(), {});
    expect(result.status).toBe('unsupported');
  });

  it('应返回 not_installed 当技能未安装时', async () => {
    const skill = { id: 'test-skill' };
    const result = await detectSkillStatus(skill, new Map(), {});
    expect(result.status).toBe('not_installed');
  });

  it('应返回 needs_deps 当缺少 CLI 时', async () => {
    const skill = {
      id: 'test-skill',
      requirements: { cli: [{ command: 'nonexistent-cli' }] }
    };
    const installed = new Map([['test-skill', {}]]);
    const result = await detectSkillStatus(skill, installed, {});
    expect(result.status).toBe('needs_deps');
    expect(result.deps?.missing).toContain('nonexistent-cli');
  });

  it('应返回 needs_config 当缺少配置时', async () => {
    const skill = {
      id: 'test-skill',
      config: {
        fields: [{ key: 'apiKey', required: true }]
      }
    };
    const installed = new Map([['test-skill', {}]]);
    const result = await detectSkillStatus(skill, installed, {});
    expect(result.status).toBe('needs_config');
  });

  it('应返回 active 当技能已启用时', async () => {
    const skill = { id: 'test-skill' };
    const installed = new Map([['test-skill', {}]]);
    const userConfig = { enabled: ['test-skill'] };
    const result = await detectSkillStatus(skill, installed, userConfig);
    expect(result.status).toBe('active');
    expect(result.enabled).toBe(true);
  });
});
```

### 10.2 状态转换测试

```typescript
describe('状态转换', () => {
  it('not_installed -> installing -> ready', async () => {
    // 模拟安装流程
  });

  it('ready -> active -> disabled -> active', async () => {
    // 模拟启用/禁用流程
  });

  it('error -> retry -> ready', async () => {
    // 模拟错误恢复流程
  });
});
```

---

## 十一、SKILL.md 配置规范

每个技能的完整配置存储在 `skills-registry/<skill-name>/SKILL.md` 文件中。

### 11.1 文件结构

```yaml
---
# === 基本信息 ===
name: 1password                    # 技能名称 (ID)
description: 1Password CLI 密码管理   # 简短描述
homepage: https://1password.com    # 官网链接

# === 元数据 (JSON) ===
metadata: {"openclaw": {...}}
---

# 技能名称

详细的技能使用文档 (Markdown 格式)...
```

### 11.2 metadata.openclaw 完整结构

```typescript
interface SkillOpenClawMetadata {
  // === 版本信息 ===
  version?: string;                  // 版本号 (semver: "1.0.0")
  minOpenClawVersion?: string;       // 最低兼容的 OpenClaw 版本
  
  // === 显示信息 ===
  emoji?: string;                    // 图标 emoji
  icon?: string;                     // 图标 URL (优先级高于 emoji)
  screenshots?: string[];            // 截图 URL 列表
  
  // === 分类与标签 ===
  category?: SkillCategory;          // 分类: tool | channel | provider | memory | automation | analytics | security | integration | utility
  tags?: string[];                   // 标签列表
  
  // === 依赖要求 ===
  requires?: {
    bins?: string[];                 // 需要的 CLI 命令 (全部必须存在)
    anyBins?: string[];              // 需要的 CLI 命令 (存在其一即可)
    env?: string[];                  // 需要的环境变量 / API Key
    auth?: AuthCheck;                // 认证检测 (检测 CLI 是否已登录)
  };
  
  // === API Key 配置 ===
  primaryEnv?: string;               // 主要的环境变量 (用于 UI 突出显示)
  envHelp?: {                        // 环境变量帮助信息
    [envVar: string]: {
      description: string;           // 说明文字 (如: "免费注册即可获取，每月82000次免费调用")
      helpUrl: string;               // 获取教程链接
      placeholder?: string;          // 输入框占位符
    };
  };
  
  // === 安装方法 (跨平台) ===
  install?: InstallMethod[];
  
  // === 能力声明 ===
  capabilities?: SkillCapability[];
  
  // === 作者信息 ===
  author?: {
    name: string;
    email?: string;
    url?: string;
    verified?: boolean;
  };
  
  // === 兼容性 ===
  engines?: {
    openclaw?: string;               // OpenClaw 最低版本
    node?: string;                   // Node.js 版本要求
  };
  platforms?: Platform[];            // 支持的平台: darwin | linux | win32
  
  // === 市场信息 ===
  featured?: boolean;                // 是否推荐
  verified?: boolean;                // 是否官方认证
  deprecated?: boolean;              // 是否已废弃
  deprecatedReason?: string;         // 废弃原因
}
```

### 11.3 AuthCheck 认证检测

```typescript
/**
 * 认证检测配置
 * 用于检测 CLI 工具是否已登录/认证
 */
interface AuthCheck {
  command: string;      // 检测命令 (如: "gh auth status")
  expect: string;       // 成功时输出匹配的正则 (如: "Logged in")
  message: string;      // 失败提示 (如: "需要登录 GitHub")
  action: string;       // 认证命令 - 显示给用户 (如: "gh auth login")
  helpUrl?: string;     // 帮助链接
}
```

**示例配置：**

```json
// GitHub CLI
"auth": {
  "command": "gh auth status",
  "expect": "Logged in",
  "message": "需要登录 GitHub",
  "action": "gh auth login",
  "helpUrl": "https://cli.github.com/manual/gh_auth_login"
}

// 1Password CLI
"auth": {
  "command": "op account list",
  "expect": ".+",
  "message": "需要登录 1Password",
  "action": "op signin"
}

// Google Cloud
"auth": {
  "command": "gcloud auth list --filter=status:ACTIVE --format=value(account)",
  "expect": "@",
  "message": "需要登录 Google Cloud",
  "action": "gcloud auth login"
}
```

### 11.4 InstallMethod 安装方法

```typescript
type InstallKind =
  // === 跨平台 ===
  | 'uv'      // Python 包: uv tool install
  | 'pip'    // Python 包: pip install
  | 'npm'    // Node.js 包: npm install -g
  | 'npx'    // Node.js 运行时: npx
  | 'go'     // Go 工具: go install
  | 'cargo'  // Rust 包: cargo install
  // === macOS ===
  | 'brew'   // Homebrew: brew install
  // === Linux ===
  | 'apt'    // Debian/Ubuntu: apt-get install
  | 'yum'    // RHEL/CentOS: yum install
  | 'dnf'    // Fedora: dnf install
  // === Windows ===
  | 'winget' // Windows: winget install
  | 'choco'  // Chocolatey: choco install
  | 'scoop'; // Scoop: scoop install

type Platform = 'darwin' | 'linux' | 'win32' | 'all';

interface InstallMethod {
  id: string;           // 安装方法 ID
  kind: InstallKind;    // 安装类型
  package?: string;     // 包名 (uv/pip/npm/cargo/apt/winget)
  formula?: string;     // Homebrew formula 名
  module?: string;      // Go module 路径
  bins?: string[];      // 安装后提供的命令
  label?: string;       // 显示标签 (如: "Install via Homebrew")
  platform?: Platform;  // 适用平台 (省略则根据 kind 自动推断)
}
```

### 11.4 平台自动推断规则

| kind | 默认平台 | 说明 |
|------|----------|------|
| `brew` | darwin | macOS Homebrew |
| `apt`, `yum`, `dnf` | linux | Linux 包管理器 |
| `winget`, `choco`, `scoop` | win32 | Windows 包管理器 |
| `uv`, `pip`, `npm`, `npx`, `go`, `cargo` | all | 跨平台工具 |

### 11.5 配置示例

#### 示例 1: 需要 API Key 的技能 (Web Search)

```yaml
---
name: web-search
description: 网络搜索工具，支持 Brave Search API
homepage: https://brave.com/search/api/
metadata: {
  "openclaw": {
    "version": "1.0.0",
    "emoji": "🔍",
    "category": "tool",
    "tags": ["搜索", "search", "brave"],
    "requires": {
      "env": ["BRAVE_SEARCH_API_KEY"]
    },
    "primaryEnv": "BRAVE_SEARCH_API_KEY",
    "envHelp": {
      "BRAVE_SEARCH_API_KEY": {
        "description": "免费注册即可获取，每月2000次免费调用",
        "helpUrl": "https://brave.com/search/api/"
      }
    },
    "capabilities": [
      { "type": "tool", "names": ["web_search"] }
    ]
  }
}
---
```

#### 示例 2: 需要 CLI 工具的技能 (1Password)

```yaml
---
name: 1password
description: 1Password CLI 密码管理
homepage: https://developer.1password.com/docs/cli/
metadata: {
  "openclaw": {
    "version": "1.0.0",
    "emoji": "🔐",
    "category": "security",
    "tags": ["密码", "security", "1password"],
    "requires": {
      "bins": ["op"]
    },
    "install": [
      {
        "id": "brew",
        "kind": "brew",
        "formula": "1password-cli",
        "bins": ["op"],
        "label": "Install via Homebrew (macOS)",
        "platform": "darwin"
      },
      {
        "id": "winget",
        "kind": "winget",
        "package": "AgileBits.1Password.CLI",
        "bins": ["op"],
        "label": "Install via winget (Windows)",
        "platform": "win32"
      },
      {
        "id": "apt",
        "kind": "apt",
        "package": "1password-cli",
        "bins": ["op"],
        "label": "Install via apt (Debian/Ubuntu)",
        "platform": "linux"
      }
    ],
    "capabilities": [
      { "type": "tool", "names": ["op_read", "op_run"] }
    ]
  }
}
---
```

#### 示例 3: Python CLI 工具 (nano-pdf)

```yaml
---
name: nano-pdf
description: 使用自然语言指令编辑 PDF
homepage: https://pypi.org/project/nano-pdf/
metadata: {
  "openclaw": {
    "version": "1.0.0",
    "emoji": "📄",
    "category": "tool",
    "tags": ["pdf", "文档", "editing"],
    "requires": {
      "bins": ["nano-pdf"]
    },
    "install": [
      {
        "id": "uv",
        "kind": "uv",
        "package": "nano-pdf",
        "bins": ["nano-pdf"],
        "label": "Install via uv (推荐)"
      },
      {
        "id": "pip",
        "kind": "pip",
        "package": "nano-pdf",
        "bins": ["nano-pdf"],
        "label": "Install via pip"
      }
    ],
    "capabilities": [
      { "type": "tool", "names": ["edit_pdf"] }
    ]
  }
}
---
```

#### 示例 4: 多个 API Key 的技能 (Notion)

```yaml
---
name: notion
description: Notion API 集成
homepage: https://developers.notion.com/
metadata: {
  "openclaw": {
    "version": "1.0.0",
    "emoji": "📝",
    "category": "integration",
    "tags": ["笔记", "notion", "数据库"],
    "requires": {
      "env": ["NOTION_API_KEY"]
    },
    "primaryEnv": "NOTION_API_KEY",
    "envHelp": {
      "NOTION_API_KEY": {
        "description": "Notion Integration Token，在 Notion Integrations 创建",
        "helpUrl": "https://www.notion.so/my-integrations",
        "placeholder": "ntn_xxx 或 secret_xxx"
      }
    },
    "capabilities": [
      { "type": "tool", "names": ["notion_search", "notion_create_page", "notion_query_database"] }
    ]
  }
}
---
```

### 11.6 配置读取流程

```
SKILL.md
    │
    ├── frontmatter (name, description, homepage)
    │
    └── metadata.openclaw
            │
            ├── requires.bins[] ──────────────────────────────┬─── 检测是否存在
            │                                              │
            ├── install[] ───── 按 platform 过滤 ────────────└─── 缺少时显示安装方法
            │
            ├── requires.env[] ──────────────────────────────┬─── 检测是否配置
            │                                              │
            └── envHelp[env] ───────────────────────────────└─── 缺少时显示配置弹窗
                  │                                            - description
                  ├── description ────────────────────────────── - helpUrl
                  ├── helpUrl ─────────────────────────────────── - placeholder
                  └── placeholder
```

### 11.7 UI 显示效果

配置弹窗示例：

```
┌───────────────────────────────────────────────────┐
│ ⚙️ 配置 网络搜索      [点击查看如何获取]   [X] │  ← helpUrl 链接
├───────────────────────────────────────────────────┤
│                                                   │
│  * BRAVE SEARCH API Key  ⓘ 获取方法                │  ← label + helpUrl
│  ┌─────────────────────────────────────────────┐  │
│  │ 输入您的 API Key                           👁 │  │  ← placeholder
│  └─────────────────────────────────────────────┘  │
│  💡 免费注册即可获取，每月2000次免费调用           │  ← description
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ ✓ 配置安全存储在本地 ~/.openclaw/skills/      │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│                              [取消]  [保存]        │
└───────────────────────────────────────────────────┘
```

---

## 十二、实现清单

### Phase 1: 核心状态 (MVP) ✅
- [x] 实现 SkillStatus 枚举 - `skill-metadata.ts`
- [x] 实现状态检测逻辑 - `skill-status.ts:computeSkillStatus()`
- [x] 实现 CLI 依赖检测 (which) - `dependency-checker.ts`
- [x] 实现配置检测 - `skill-status.ts:detectMissingConfig()`
- [x] 实现状态持久化 - `config-manager.ts`

### Phase 2: 安装流程 ✅
- [x] 实现技能安装 (复制文件) - `skill-service.ts:installSkill()`
- [x] 实现技能卸载 (删除文件) - `skill-service.ts:uninstallSkill()`
- [ ] 实现安装依赖弹窗 - 前端 UI
- [x] 实现一键安装 (brew/npm) - `agents/skills-install.ts`

### Phase 3: 配置流程 ✅
- [x] 实现配置表单生成 - `skill-parser.ts:generateConfigFields()`
- [x] 实现配置保存 - `skill-service.ts:configureSkill()`
- [x] 实现配置验证 - `skill-service.ts:verifySkillDeps()`

### Phase 4: 前端集成 ✅
- [x] 实现技能卡片组件 - `Marketplace.tsx:SkillCard`
- [x] 实现状态图标/颜色 - `skill-status.ts:STATUS_DISPLAY`
- [x] 实现 Zustand Store - `app/src/stores/skills.ts`
- [x] 实现安装/配置弹窗 - `Marketplace.tsx`
- [x] 支持完整的 11 状态枚举 - `Marketplace.tsx:STATUS_CONFIG`

### Phase 5: 测试与优化
- [ ] 单元测试覆盖
- [ ] E2E 测试
- [ ] 性能优化
- [ ] 错误处理完善
