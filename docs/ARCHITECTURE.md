# OpenClaw CN — AI Skills 进化平台架构设计

## 1. 项目定位

基于 OpenClaw 的个人助理 Skills 进化平台。以桌面应用为入口，一键启动所有依赖环境，通过 AI 调度器支持多任务编排，自动搜索/匹配/开发 Skills，实现自进化闭环。

## 2. 桌面应用层 (Desktop Shell)

### 2.1 技术选型：Electron

| 对比项 | Electron | Tauri |
|--------|----------|-------|
| 后端语言 | Node.js (项目全栈 TS) | Rust (需额外学习) |
| 系统命令 | child_process 直接调用 | Rust Command API |
| Claude CLI 集成 | 原生 spawn，stdin/stdout 直通 | 需 sidecar 桥接 |
| 后端服务集成 | 同进程，零成本 | 需 Node sidecar 或重写 |
| 包体积 | ~150MB | ~10MB |
| 开发速度 | 快（一套 TS） | 慢（Rust + TS 双栈） |

**选择 Electron 的核心理由：**

本项目的 Scheduler、Orchestrator、Registry、Factory 全部是 TypeScript。用 Electron 意味着桌面壳和后端引擎**零成本同进程运行**，不需要 sidecar 桥接。Claude CLI 集成也只是 `child_process.spawn('claude', [...])` 一行的事。包体积大一点，但换来的是开发效率的巨大提升。

### 2.2 应用流程 — OpenClaw First

```
App 启动 → openclaw:check
  ├─ 已安装 → 直接进入 Main
  └─ 未安装 → OpenClawSetup（自动安装 + 终端日志）→ 安装完成 → Main
```

核心理念：**OpenClaw 是唯一核心依赖**。应用启动后检测 OpenClaw 是否已安装，未安装则自动运行 `npm install -g openclaw`，通过 `child_process.spawn()` 实时流式传输安装日志到终端 UI。安装完成后直接进入主界面。

#### IPC 通道

| Channel | 方向 | 说明 |
|---------|------|------|
| `openclaw:check` | renderer → main | 检测 OpenClaw 是否已安装，返回 `{ installed, version }` |
| `openclaw:install` | renderer → main | 启动安装流程（spawn），返回 `{ ok, version, error }` |
| `install:log` | main → renderer | 安装过程的流式日志推送（每行/每 chunk） |

#### 平台适配

| 平台 | 安装命令 | 说明 |
|------|---------|------|
| macOS / Linux | `npm install -g openclaw` | 默认 |
| Windows | `npm.cmd install -g openclaw` | shell: true |

### 2.3 Screen 1: AI 供应商配置 — 扫描优先，配置兜底

核心理念：**不让用户从零配置**。应用启动后自动扫描本地已有的 AI 工具和配置，发现什么就列出什么，用户只需下拉选择。

#### 2.3.1 自动扫描流程

```
应用启动
   │
   ▼
┌─────────────────────────────────────────────────────┐
│                  本地 AI 资源扫描器                    │
│                                                     │
│  扫描点 1: ~/.openclaw/openclaw.json                │
│    → 读取 agents.defaults.model.primary             │
│    → 读取 auth.profiles 中所有已配置的 provider       │
│    → 读取 credentials/ 目录下的 token 文件           │
│    → 结果: "github-copilot/gpt-4o (已认证, 可用)"   │
│                                                     │
│  扫描点 2: Claude CLI                               │
│    → which claude → 找到 v2.1.33                    │
│    → 读取 ~/.claude/settings.json 确认已登录         │
│    → 结果: "Claude CLI (Anthropic 账号, 可用)"       │
│                                                     │
│  扫描点 3: 环境变量                                  │
│    → $OPENAI_API_KEY → 未设置                       │
│    → $ANTHROPIC_API_KEY → 未设置                    │
│    → $DEEPSEEK_API_KEY → 未设置                     │
│                                                     │
│  扫描点 4: Ollama 本地模型                           │
│    → which ollama → 未找到                          │
│                                                     │
└─────────────────────────────────────────────────────┘
   │
   ▼
扫描结果: 发现 2 个可用 AI 供应商
```

#### 2.3.2 界面设计 — 发现已有供应商时

扫描到本地资源后，直接展示可用选项，用户下拉选一个即可：

```
┌─────────────────────────────────────────────┐
│          选择 AI 大模型                       │
│                                             │
│  ✓ 已扫描到本地 AI 资源                       │
│                                             │
│  ┌─ 选择供应商 ──────────────────────────┐   │
│  │                                       │   │
│  │  ┌─ 从本地发现 ─────────────────────┐ │   │
│  │  │                                  │ │   │
│  │  │  ● OpenClaw (github-copilot)     │ │   │
│  │  │    模型: gpt-4o                  │ │   │
│  │  │    来源: ~/.openclaw/            │ │   │
│  │  │    状态: ✓ 已认证                 │ │   │
│  │  │                                  │ │   │
│  │  │  ○ Claude CLI                    │ │   │
│  │  │    版本: v2.1.33                 │ │   │
│  │  │    来源: ~/.claude/              │ │   │
│  │  │    状态: ✓ 已登录                 │ │   │
│  │  │                                  │ │   │
│  │  └──────────────────────────────────┘ │   │
│  │                                       │   │
│  │  ┌─ 手动添加 ───────────────────────┐ │   │
│  │  │  ○ DeepSeek / Qwen / 智谱 / ... │ │   │
│  │  │  ○ 自定义 OpenAI 兼容接口        │ │   │
│  │  └──────────────────────────────────┘ │   │
│  └───────────────────────────────────────┘   │
│                                             │
│  [测试连接]                  状态: ✓ 可用    │
│                                             │
│                              [下一步 →]      │
└─────────────────────────────────────────────┘
```

#### 2.3.3 界面设计 — 未发现任何供应商时

兜底到手动配置模式：

```
┌─────────────────────────────────────────────┐
│          配置 AI 大模型                       │
│                                             │
│  ⚠ 未检测到本地 AI 工具，请手动配置           │
│                                             │
│  ┌─ 选择供应商 ──────────────────────────┐   │
│  │  ○ Claude API                        │   │
│  │  ○ OpenAI / GPT                      │   │
│  │  ○ 深度求索 (DeepSeek)                │   │
│  │  ○ 通义千问 (Qwen)                    │   │
│  │  ○ 智谱 (ChatGLM)                    │   │
│  │  ○ 月之暗面 (Moonshot / Kimi)         │   │
│  │  ○ 自定义 OpenAI 兼容接口              │   │
│  └───────────────────────────────────────┘   │
│                                             │
│  ┌─ 连接信息 ────────────────────────────┐   │
│  │  API Key:  [sk-xxxx____________]      │   │
│  │  Base URL: [https://api.xxx.com]      │   │
│  │  Model:    [deepseek-chat    ▼]       │   │
│  │                                       │   │
│  │  [测试连接]          状态: ✓ 已连接    │   │
│  └───────────────────────────────────────┘   │
│                                             │
│                              [下一步 →]      │
└─────────────────────────────────────────────┘
```

#### 2.3.4 本地扫描器实现

```typescript
// 扫描器 — 发现本地所有可用的 AI 资源
interface DiscoveredProvider {
  id: string;
  name: string;
  source: 'openclaw' | 'claude-cli' | 'env' | 'ollama';
  sourcePath: string;            // 配置来源路径
  model: string;
  status: 'ready' | 'need_auth'; // 是否可直接使用
  adapter: LLMProviderType;
}

class LocalAIScanner {

  async scan(): Promise<DiscoveredProvider[]> {
    const results: DiscoveredProvider[] = [];

    // 并行扫描所有来源
    const [openclaw, claude, envVars, ollama] = await Promise.allSettled([
      this.scanOpenClaw(),
      this.scanClaudeCLI(),
      this.scanEnvVars(),
      this.scanOllama(),
    ]);

    // 合并所有发现的供应商
    for (const result of [openclaw, claude, envVars, ollama]) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(...result.value);
      }
    }

    return results;
  }

  // 扫描点 1: OpenClaw 配置
  private async scanOpenClaw(): Promise<DiscoveredProvider[]> {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) return [];

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const providers: DiscoveredProvider[] = [];

    // 读取已配置的 auth profiles
    const profiles = config.auth?.profiles ?? {};
    for (const [key, profile] of Object.entries(profiles)) {
      // 检查对应的 credential 文件是否存在
      const credPath = path.join(os.homedir(), '.openclaw', 'credentials', `${profile.provider}.token.json`);
      const hasCredential = fs.existsSync(credPath);

      providers.push({
        id: `openclaw:${profile.provider}`,
        name: `OpenClaw (${profile.provider})`,
        source: 'openclaw',
        sourcePath: configPath,
        model: config.agents?.defaults?.model?.primary ?? 'unknown',
        status: hasCredential ? 'ready' : 'need_auth',
        adapter: 'openclaw-bridge',  // 通过 OpenClaw Gateway 桥接调用
      });
    }

    return providers;
  }

  // 扫描点 2: Claude CLI
  private async scanClaudeCLI(): Promise<DiscoveredProvider[]> {
    try {
      const { stdout } = await exec('claude --version');
      const version = stdout.trim();

      // 检查是否已登录
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const isLoggedIn = fs.existsSync(settingsPath);

      return [{
        id: 'claude-cli',
        name: `Claude CLI (${version})`,
        source: 'claude-cli',
        sourcePath: '~/.claude/',
        model: 'claude-sonnet-4-5-20250929',  // Claude CLI 默认模型
        status: isLoggedIn ? 'ready' : 'need_auth',
        adapter: 'claude-cli',
      }];
    } catch {
      return [];
    }
  }

  // 扫描点 3: 环境变量中的 API Key
  private async scanEnvVars(): Promise<DiscoveredProvider[]> {
    const envMap: Record<string, { name: string; baseUrl: string; model: string }> = {
      'OPENAI_API_KEY':    { name: 'OpenAI',   baseUrl: 'https://api.openai.com',    model: 'gpt-4o' },
      'ANTHROPIC_API_KEY': { name: 'Claude API', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5-20250929' },
      'DEEPSEEK_API_KEY':  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',  model: 'deepseek-chat' },
    };

    const results: DiscoveredProvider[] = [];
    for (const [envKey, info] of Object.entries(envMap)) {
      if (process.env[envKey]) {
        results.push({
          id: `env:${envKey}`,
          name: `${info.name} (环境变量)`,
          source: 'env',
          sourcePath: `$${envKey}`,
          model: info.model,
          status: 'ready',
          adapter: 'openai-compatible',
        });
      }
    }
    return results;
  }

  // 扫描点 4: Ollama 本地模型
  private async scanOllama(): Promise<DiscoveredProvider[]> {
    try {
      const { stdout } = await exec('ollama list');
      const models = parseOllamaList(stdout);
      return models.map(m => ({
        id: `ollama:${m.name}`,
        name: `Ollama (${m.name})`,
        source: 'ollama',
        sourcePath: 'ollama://localhost:11434',
        model: m.name,
        status: 'ready',
        adapter: 'openai-compatible',  // Ollama 兼容 OpenAI 接口
      }));
    } catch {
      return [];
    }
  }
}
```

#### 2.3.5 供应商适配器 — 统一调用接口

不管来源是什么，最终都统一为一个接口调用：

```typescript
interface LLMProvider {
  id: string;
  name: string;

  chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

// 适配器类型
type LLMProviderType =
  | 'claude-cli'          // spawn 本地 claude 进程
  | 'openclaw-bridge'     // 通过 OpenClaw Gateway 桥接
  | 'openai-compatible'   // 标准 OpenAI HTTP 接口
  | 'manual';             // 用户手动配置的接口
```

**Claude CLI 适配器** — spawn 本地进程：

```typescript
class ClaudeCLIAdapter implements LLMProvider {
  async *chat(messages: Message[]) {
    const proc = spawn('claude', [
      '--print', '--output-format', 'stream-json',
      messages[messages.length - 1].content
    ]);
    for await (const chunk of proc.stdout) {
      yield parseStreamChunk(chunk);
    }
  }
}
```

**OpenClaw Bridge 适配器** — 复用 OpenClaw Gateway 已有的 LLM 通道：

```typescript
class OpenClawBridgeAdapter implements LLMProvider {
  constructor(private gatewayUrl: string, private gatewayToken: string) {}

  async *chat(messages: Message[]) {
    // 通过 OpenClaw Gateway 的 API 调用其已配置的 LLM
    // Gateway 地址和 token 从 ~/.openclaw/openclaw.json 读取
    const resp = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.gatewayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, stream: true }),
    });
    for await (const chunk of parseSSE(resp.body)) {
      yield chunk;
    }
  }
}
```

**OpenAI 兼容适配器** — 通吃国内外大部分供应商：

```typescript
class OpenAICompatAdapter implements LLMProvider {
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  async *chat(messages: Message[]) {
    const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    for await (const chunk of parseSSE(resp.body)) {
      yield chunk;
    }
  }
}
```

#### 2.3.6 供应商注册表 — 手动添加时的预设

当用户选择手动添加时，提供国内外常见供应商的预设配置：

```typescript
const presetProviders = {
  'claude-api':   { name: 'Claude API',    baseUrl: 'https://api.anthropic.com',                     models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20250918'] },
  'openai':       { name: 'OpenAI',        baseUrl: 'https://api.openai.com',                        models: ['gpt-4o', 'gpt-4o-mini', 'o1'] },
  'deepseek':     { name: '深度求索',       baseUrl: 'https://api.deepseek.com',                      models: ['deepseek-chat', 'deepseek-reasoner'] },
  'qwen':         { name: '通义千问',       baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  'zhipu':        { name: '智谱 ChatGLM',  baseUrl: 'https://open.bigmodel.cn/api/paas',             models: ['glm-4-plus', 'glm-4'] },
  'moonshot':     { name: '月之暗面 Kimi',  baseUrl: 'https://api.moonshot.cn',                       models: ['moonshot-v1-128k', 'moonshot-v1-32k'] },
  'custom':       { name: '自定义接口',     baseUrl: '',                                               models: [] },
};
```

### 2.4 Screen 2: 一键启动 — AI 驱动的依赖安装

用户只看到一个「开始」按钮。点击后，系统读取依赖清单，用 AI 智能检测和安装。

```
┌─────────────────────────────────────────┐
│                                         │
│            OpenClaw CN                  │
│                                         │
│         ┌──────────────────┐            │
│         │                  │            │
│         │      开始        │            │
│         │                  │            │
│         └──────────────────┘            │
│                                         │
│    点击开始，AI 将自动检测并安装依赖       │
│                                         │
└─────────────────────────────────────────┘
```

点击后进入安装流程：

```
┌─────────────────────────────────────────┐
│          环境初始化                       │
│                                         │
│  MySQL          [████████████████] ✓ 已存在 │
│    → 检测到本地 MySQL 8.0.35            │
│    → 连接测试通过                        │
│                                         │
│  Redis          [████████░░░░░░░░] 安装中 │
│    → 未检测到 Redis                      │
│    → 正在通过 brew install redis 安装... │
│                                         │
│  OpenClaw       [░░░░░░░░░░░░░░░░] 等待中 │
│                                         │
│  Node.js        [████████████████] ✓ 已存在 │
│    → 检测到 Node.js v22.5.0             │
│                                         │
│  Claude CLI     [████████████████] ✓ 已存在 │
│    → 检测到 claude 1.0.16               │
│                                         │
│  ──────────────────────────────────────  │
│  总进度          [████████░░░░░░░░] 3/5  │
│                                         │
└─────────────────────────────────────────┘
```

**依赖清单（dependencies.json）：**

```json
{
  "dependencies": [
    {
      "id": "mysql",
      "name": "MySQL",
      "version": ">=8.0",
      "required": true,
      "detect": {
        "commands": ["mysql --version", "mysqld --version"],
        "ports": [3306]
      },
      "install": {
        "darwin": "brew install mysql && brew services start mysql",
        "linux": "sudo apt-get install -y mysql-server && sudo systemctl start mysql",
        "win32": "choco install mysql"
      },
      "config": {
        "host": { "label": "主机地址", "default": "localhost" },
        "port": { "label": "端口", "type": "number", "default": 3306 },
        "username": { "label": "用户名", "default": "root" },
        "password": { "label": "密码", "type": "password" },
        "database": { "label": "数据库名", "default": "openclaw" }
      }
    },
    {
      "id": "redis",
      "name": "Redis",
      "version": ">=7.0",
      "required": true,
      "detect": {
        "commands": ["redis-server --version", "redis-cli ping"],
        "ports": [6379]
      },
      "install": {
        "darwin": "brew install redis && brew services start redis",
        "linux": "sudo apt-get install -y redis-server && sudo systemctl start redis",
        "win32": "choco install redis"
      },
      "config": {
        "host": { "label": "主机地址", "default": "localhost" },
        "port": { "label": "端口", "type": "number", "default": 6379 },
        "password": { "label": "密码 (可选)", "type": "password", "required": false }
      }
    },
    {
      "id": "openclaw",
      "name": "OpenClaw",
      "version": "latest",
      "required": true,
      "detect": {
        "commands": ["openclaw --version"],
        "npm": "openclaw"
      },
      "install": {
        "all": "npm install -g openclaw"
      },
      "config": {
        "gatewayPort": { "label": "Gateway 端口", "type": "number", "default": 9315 }
      }
    },
    {
      "id": "claude-cli",
      "name": "Claude CLI",
      "version": ">=1.0",
      "required": false,
      "detect": {
        "commands": ["claude --version"]
      },
      "install": {
        "all": "npm install -g @anthropic-ai/claude-code"
      },
      "config": {}
    },
    {
      "id": "nodejs",
      "name": "Node.js",
      "version": ">=20.0",
      "required": true,
      "detect": {
        "commands": ["node --version"]
      },
      "install": {
        "darwin": "brew install node",
        "linux": "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs",
        "win32": "choco install nodejs"
      },
      "config": {}
    }
  ]
}
```

**AI 驱动的安装引擎：**

安装不是简单地执行命令。AI 介入每个环节做智能决策：

```typescript
interface DependencyInstaller {
  // 1. AI 检测：不只跑命令，还让 AI 分析输出判断版本兼容性
  detect(dep: Dependency): Promise<DetectResult>;

  // 2. AI 安装：遇到错误时 AI 分析原因并尝试修复
  install(dep: Dependency): Promise<InstallResult>;

  // 3. AI 链接：已有的依赖，AI 自动找到连接信息
  link(dep: Dependency): Promise<LinkResult>;
}

// 检测流程示例
async function detect(dep: Dependency): Promise<DetectResult> {
  // 执行检测命令
  const outputs = await runDetectCommands(dep.detect.commands);

  // AI 分析结果
  const analysis = await llm.chat([
    { role: 'system', content: '你是依赖检测助手。分析命令输出，判断依赖是否已安装、版本号、是否满足要求。' },
    { role: 'user', content: `
      依赖: ${dep.name} ${dep.version}
      命令输出: ${JSON.stringify(outputs)}
      要求版本: ${dep.version}
      请判断: installed(bool), version(string), compatible(bool), connectionInfo(如果能推断)
    ` }
  ]);

  return parseDetectAnalysis(analysis);
}
```

### 2.5 Screen 3: 依赖配置器

已有依赖检测完成后，弹出配置表单，让用户填写凭证。

```
┌─────────────────────────────────────────┐
│          配置已安装的服务                  │
│                                         │
│  ┌─ MySQL ─────────────────────────────┐│
│  │  主机地址: [localhost          ]     ││
│  │  端口:     [3306              ]     ││
│  │  用户名:   [root              ]     ││
│  │  密码:     [••••••••          ]     ││
│  │  数据库名: [openclaw           ]     ││
│  │                  [测试连接] ✓ 成功   ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─ Redis ─────────────────────────────┐│
│  │  主机地址: [localhost          ]     ││
│  │  端口:     [6379              ]     ││
│  │  密码:     [(可选)             ]     ││
│  │                  [测试连接] ✓ 成功   ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─ OpenClaw ──────────────────────────┐│
│  │  Gateway 端口: [9315           ]     ││
│  └─────────────────────────────────────┘│
│                                         │
│                [完成，进入主界面 →]       │
└─────────────────────────────────────────┘
```

配置表单由 `dependencies.json` 中每个依赖的 `config` 字段**动态生成**，无需为每个依赖硬编码 UI。

### 2.6 主界面

所有依赖就绪后进入主工作界面。

```
┌──────────────────────────────────────────────────────────┐
│  OpenClaw CN                          ⚙ 设置  ─ □ ×     │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  状态面板   │            对话区域                          │
│            │                                             │
│  ● MySQL   │  用户: 帮我写一个钉钉自动回复机器人          │
│    运行中   │                                             │
│  ● Redis   │  AI: 正在分析意图...                         │
│    运行中   │      → 搜索方案中...                         │
│  ● OpenClaw│      → 未找到现有 Skill，正在开发...         │
│    运行中   │      → [实时日志流]                          │
│            │                                             │
│  ────────  │                                             │
│  已装 Skills│                                             │
│            │                                             │
│  📦 web-search │                                         │
│  📦 code-gen   │                                         │
│  📦 dingtalk.. │                                         │
│            │                                             │
│  ────────  │  ┌─────────────────────────────────────┐    │
│  任务队列   │  │ 输入你想做的事...               [发送] │    │
│            │  └─────────────────────────────────────┘    │
│  #1 ✓ 完成 │                                             │
│  #2 ⟳ 进行中│                                             │
│  #3 ○ 等待 │                                             │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│  MySQL ✓  Redis ✓  OpenClaw ✓  Claude CLI ✓  Tasks: 2/3 │
└──────────────────────────────────────────────────────────┘
```

## 3. 核心架构：AI Node

### 3.1 关键发现 — 不造轮子，站在 OpenClaw 肩膀上

分析你本地 `~/.openclaw/` 后发现，OpenClaw 已经提供了完整的基础设施：

| 能力 | OpenClaw 已有 | 我们还需要造吗？ |
|------|--------------|----------------|
| Gateway 网关 | `port 18789`, token 认证 | 不需要 |
| 消息渠道 | 钉钉/飞书/企微 已配好 | 不需要 |
| 设备身份 | Ed25519 密钥对 + deviceId | 不需要 |
| 会话管理 | sessionKey 路由, JSONL 历史 | 不需要 |
| Agent 人格 | workspace/*.md (SOUL/AGENTS/TOOLS) | 不需要 |
| Skills 格式 | skill.json + SKILL.md + scripts/ | **复用格式** |
| 定时任务 | cron/jobs.json | 不需要 |
| 执行审批 | exec-approvals.sock | 不需要 |
| LLM 调用 | github-copilot/gpt-4o | 可复用 |

**我们真正要做的，不是另起一套系统，而是给 OpenClaw 装一个「AI 大脑」。**

### 3.2 AI Node 的定位

普通 OpenClaw Node = 固定能力的执行器（有什么 Skill 做什么事）

**AI Node = 自进化的智能体**（没有 Skill 就现场开发一个）

```
普通 Node:
  用户请求 → 匹配 Skill → [有] 执行 / [无] "抱歉我不会"

AI Node:
  用户请求 → 匹配 Skill → [有] 执行
                         → [无] → 分析意图 → 搜索方案 → 自动开发 Skill → 注册 → 执行
                                                                            ↓
                                                          下次同类请求直接匹配 ✓
```

### 3.3 整体架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Electron Desktop Shell                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Renderer (React UI)                          │  │
│  │   Setup Wizard → AI 选择 → 依赖安装 → 主界面 (对话/状态/Skills)  │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │ IPC                                   │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                      Main Process (Node.js)                      │  │
│  │                                                                  │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ AI Scanner  │  │ Dep Installer│  │    Config Store        │  │  │
│  │  │ + LLM Mgr   │  │   Engine     │  │  (Electron safeStorage)│  │  │
│  │  └──────┬──────┘  └──────────────┘  └────────────────────────┘  │  │
│  │         │                                                        │  │
│  │  ┌──────▼────────────────────────────────────────────────────┐   │  │
│  │  │                                                           │   │  │
│  │  │              ★ AI Node Intelligence Layer ★               │   │  │
│  │  │                    (我们的核心增量)                          │   │  │
│  │  │                                                           │   │  │
│  │  │  ┌───────────┐  ┌──────────────┐  ┌───────────────────┐  │   │  │
│  │  │  │ Scheduler │→ │ Orchestrator │→ │    Discovery      │  │   │  │
│  │  │  │ (多任务    │  │ (意图分析     │  │  (全网搜索方案)    │  │   │  │
│  │  │  │  DAG 编排) │  │  执行决策)    │  │                   │  │   │  │
│  │  │  └───────────┘  └──────┬───────┘  └───────────────────┘  │   │  │
│  │  │                        │                                  │   │  │
│  │  │          ┌─────────────┼─────────────┐                    │   │  │
│  │  │          │             │             │                    │   │  │
│  │  │    ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐            │   │  │
│  │  │    │ Registry+ │ │ Router  │ │   Factory   │            │   │  │
│  │  │    │(增强匹配)  │ │(路径决策)│ │(自动开发    │            │   │  │
│  │  │    │           │ │         │ │ OpenClaw 格式│            │   │  │
│  │  │    │ 读取:      │ │         │ │ 的 Skill)   │            │   │  │
│  │  │    │ ~/.openclaw│ │         │ │             │            │   │  │
│  │  │    │ /skills/   │ │         │ │ 输出:        │            │   │  │
│  │  │    └───────────┘ └─────────┘ │ skill.json   │            │   │  │
│  │  │                               │ SKILL.md     │            │   │  │
│  │  │                               │ scripts/     │            │   │  │
│  │  │                               └─────────────┘            │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │         │                                                        │  │
│  │         │ WebSocket / HTTP                                       │  │
│  │         ▼                                                        │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │            OpenClaw Gateway (已有, port 18789)            │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  │   │  │
│  │  │  │ Sessions │ │ Channels│ │  Skills  │ │    Cron     │  │   │  │
│  │  │  │ Manager  │ │ 钉钉    │ │ Loader   │ │   Engine    │  │   │  │
│  │  │  │          │ │ 飞书    │ │          │ │             │  │   │  │
│  │  │  │          │ │ 企微    │ │          │ │             │  │   │  │
│  │  │  └─────────┘ └─────────┘ └──────────┘ └─────────────┘  │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

**核心思想**：OpenClaw 是骨架，AI Node Intelligence Layer 是大脑。我们不替换 OpenClaw，而是在它之上加一层智能。

### 3.4 AI Node 与 OpenClaw 的集成点

#### 集成点 1: Skills — 共用格式，增强匹配

OpenClaw 的 Skill 格式已经很成熟：

```
~/.openclaw/skills/github/
├── skill.json       # 元数据 (name, description, checks, actions)
├── SKILL.md         # 使用说明 (注入到 agent system prompt)
└── scripts/
    ├── check-cli.js   # 前置检查
    ├── check-auth.js  # 认证检查 (dependsOn: cli)
    ├── install-cli.js # 安装动作
    └── login.js       # 登录动作
```

**我们的 Factory 生成的 Skill 必须是这个格式**，这样：
- 生成的 Skill 直接放入 `~/.openclaw/skills/`，OpenClaw 原生加载
- 不需要自己的 Runtime —— OpenClaw 的 Agent 直接执行
- 无缝混合：OpenClaw 原有的 Skills + 我们自动生成的 Skills，体验一致

```typescript
// Factory 生成 Skill 的输出结构 — 完全兼容 OpenClaw 格式
interface GeneratedSkill {
  'skill.json': {
    name: string;
    description: string;
    version: string;
    emoji: string;
    category: string;
    tags: string[];
    checks: Array<{
      id: string;
      script: string;
      label: string;
      dependsOn?: string[];
    }>;
    actions: Record<string, { script: string }>;
  };
  'SKILL.md': string;  // Agent 使用说明 (最关键 — 这是 Agent 的"手册")
  'scripts/': Record<string, string>;  // 检查脚本和动作脚本
}
```

#### 集成点 2: Gateway — 我们是一个增强型 Node

我们的 Electron 应用作为一个 Node 连接到 OpenClaw Gateway：

```typescript
class AINode {
  // 连接到已有的 OpenClaw Gateway
  async connect() {
    const config = readOpenClawConfig();  // ~/.openclaw/openclaw.json
    const auth = readDeviceAuth();        // ~/.openclaw/identity/device-auth.json

    this.ws = new WebSocket(`ws://127.0.0.1:${config.gateway.port}`);
    this.ws.send(JSON.stringify({
      type: 'auth',
      token: auth.tokens.operator.token,
    }));
  }

  // 拦截消息流 — 在 OpenClaw Agent 处理之前/之后增强
  async onMessage(msg: IncomingMessage) {
    // 1. 先走 AI Node Intelligence Layer
    const intent = await this.orchestrator.analyze(msg);

    // 2. 检查是否需要新 Skill
    const matched = await this.registry.match(intent);

    if (!matched) {
      // 3. 搜索方案 + 自动开发
      const solutions = await this.discovery.search(intent);
      const skill = await this.factory.generate(intent, solutions);

      // 4. 写入 ~/.openclaw/skills/ — OpenClaw 原生加载
      await this.installSkill(skill);
    }

    // 5. 让 OpenClaw Agent 正常处理 (现在它有新 Skill 了)
  }
}
```

#### 集成点 3: Workspace — 增强 Agent 人格

OpenClaw 的 Agent 人格由 `~/.openclaw/workspace/` 下的 md 文件定义。我们可以动态注入增强指令：

```
~/.openclaw/workspace/
├── AGENTS.md        # OpenClaw 原有的行为规则
├── SOUL.md          # 原有的人格
├── TOOLS.md         # 原有的工具说明
├── IDENTITY.md      # 原有的身份
├── USER.md          # 原有的用户信息
├── HEARTBEAT.md     # 原有的心跳任务
└── AI-NODE.md       # ★ 我们注入的增强指令 ★
```

`AI-NODE.md` 的内容告诉 Agent：
- 当遇到不会做的事时，不要说"我不会"，而是触发 AI Node 的 Discovery + Factory 流程
- 如何使用自动开发的新 Skills
- 多任务处理策略

#### 集成点 4: Sessions — 复用会话机制

不需要自己管理会话。OpenClaw 的 Session 机制已经处理了：
- 按 `sessionKey` 路由（`agent:main:openai-user:dingtalk-connector:用户ID`）
- 消息历史持久化（JSONL 格式）
- Token 用量统计
- 对话压缩（compaction）

我们的 Scheduler 只需要利用 OpenClaw 的 `sessions_spawn` 工具来创建并行子任务。

#### 集成点 5: Channels — 零配置接入

钉钉、飞书、企微已经在 `~/.openclaw/openclaw.json` 中配好了。消息自动流入 Gateway → 路由到 Agent。我们不碰这一层。

### 3.5 我们真正要写的代码 — AI Node Intelligence Layer

```
只有这一层是新的:

┌─────────────────────────────────────────────────────┐
│            AI Node Intelligence Layer                │
│                                                     │
│  ┌──────────┐                                       │
│  │Scheduler │ 多任务拆解 + DAG 编排                   │
│  │          │ (利用 OpenClaw sessions_spawn)          │
│  └────┬─────┘                                       │
│       ▼                                             │
│  ┌──────────┐                                       │
│  │Orchestr. │ 意图分析 → 决定执行路径                  │
│  │          │ (调用已选的 LLM Provider)               │
│  └────┬─────┘                                       │
│       ├──────────┬──────────────┐                   │
│       ▼          ▼              ▼                   │
│  ┌─────────┐ ┌────────┐ ┌───────────┐              │
│  │Registry+│ │Discov. │ │  Factory  │              │
│  │         │ │        │ │           │              │
│  │读 ~/.   │ │全网搜索 │ │生成标准    │              │
│  │openclaw/│ │方案参考 │ │OpenClaw   │              │
│  │skills/  │ │        │ │Skill 格式  │              │
│  └─────────┘ └────────┘ └─────┬─────┘              │
│                                │                    │
│                                ▼                    │
│                         写入 ~/.openclaw/skills/     │
│                         OpenClaw 原生加载执行         │
└─────────────────────────────────────────────────────┘
```

## 4. Factory — 最核心的创新点

Factory 是整个 AI Node 最关键的模块：它让系统"学会"新能力。

### 4.1 生成流程

```
意图分析结果 + Discovery 搜索的方案
       │
       ▼
┌──────────────────────────────────────────────┐
│  Step 1: LLM 生成 skill.json                 │
│  → name, description, tags, checks, actions  │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│  Step 2: LLM 生成 SKILL.md                   │
│  → Agent 执行手册 (最关键！)                   │
│  → 告诉 Agent 什么时候用、怎么用、参数格式      │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│  Step 3: LLM 生成 scripts/                   │
│  → check-*.js (前置检查脚本)                   │
│  → action 脚本 (安装依赖等)                    │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│  Step 4: 验证                                 │
│  → 检查 skill.json schema 合法性              │
│  → 沙箱运行 check 脚本确认不报错               │
│  → AI 审查 SKILL.md 是否清晰可执行             │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│  Step 5: 安装到 ~/.openclaw/skills/<name>/    │
│  → OpenClaw 下次会话自动加载                   │
│  → 或通过 Gateway API 热重载                   │
└──────────────────────────────────────────────┘
```

### 4.2 生成示例

用户说："帮我监控某个网站，挂了就发钉钉通知"

Factory 生成：

**skill.json:**
```json
{
  "name": "site-monitor",
  "description": "监控指定网站的可用性，当检测到宕机时通过钉钉发送告警通知",
  "version": "1.0.0",
  "emoji": "satellite",
  "category": "monitoring",
  "tags": ["monitor", "website", "alert", "dingtalk"],
  "checks": [
    {
      "id": "curl",
      "script": "scripts/check-curl.js",
      "label": "curl 命令可用"
    }
  ],
  "actions": {}
}
```

**SKILL.md:**
```markdown
# Site Monitor

## 用途
监控网站可用性，宕机时发钉钉通知。

## 使用方式
当用户要求监控某个网站时，使用此技能。

### 执行步骤
1. 用 exec 工具运行 curl 检测目标 URL 的 HTTP 状态码
2. 如果状态码不是 200，通过 message 工具发送告警
3. 用 cron 工具创建定时任务实现持续监控

### 参数
- url: 要监控的网站地址
- interval: 检测间隔 (默认 5 分钟)
- notify_channel: 告警通知渠道 (默认 dingtalk)
```

**scripts/check-curl.js:**
```javascript
const { execSync } = require('child_process');
try {
  execSync('curl --version', { stdio: 'pipe' });
  process.exit(0);
} catch {
  console.error('curl is not installed');
  process.exit(1);
}
```

这个 Skill 安装到 `~/.openclaw/skills/site-monitor/` 后，OpenClaw Agent 在下一次会话中自动加载 SKILL.md 到 system prompt，就"学会了"网站监控能力。

## 5. Registry+ — 增强型 Skill 匹配

不只是简单的 name/tag 匹配，而是 **AI 语义匹配**。

```typescript
class EnhancedRegistry {
  // 数据源: 直接读 ~/.openclaw/skills/ 目录
  private skillsDir = path.join(os.homedir(), '.openclaw', 'skills');

  async match(intent: Intent): Promise<MatchedSkill | null> {
    // 1. 扫描所有已安装的 skill.json
    const allSkills = await this.scanSkills();

    // 2. 快速过滤: tags 交集
    const candidates = allSkills.filter(s =>
      s.tags.some(t => intent.keywords.includes(t))
    );

    // 3. 如果快速匹配有结果，直接返回
    if (candidates.length === 1) return candidates[0];

    // 4. 如果有多个候选或零匹配，用 LLM 语义判断
    const analysis = await this.llm.chat([{
      role: 'user',
      content: `
        用户意图: ${JSON.stringify(intent)}
        可用 Skills: ${JSON.stringify(allSkills.map(s => ({
          name: s.name, description: s.description, tags: s.tags
        })))}
        哪个 Skill 最匹配？如果都不匹配返回 null。
      `
    }]);

    return parseMatchResult(analysis);
  }
}
```

## 6. 完整消息流 — AI Node 如何增强 OpenClaw

```
用户通过钉钉发消息: "帮我每天早上 9 点汇总 GitHub 上的 PR"
     │
     ▼
OpenClaw Gateway (port 18789)
     │ 路由到 Agent session
     ▼
┌─ AI Node Intelligence Layer (拦截) ──────────────────┐
│                                                      │
│  Orchestrator 分析意图:                                │
│  {                                                   │
│    intent: "automated_reporting",                    │
│    domain: "github",                                 │
│    schedule: "daily_9am",                            │
│    action: "summarize_pull_requests"                 │
│  }                                                   │
│                                                      │
│  Registry+ 匹配:                                     │
│    → 已有 skill: "github" (PR/Issue 操作)  ✓          │
│    → 已有 skill: "openclaw" (cron 任务)    ✓          │
│    → 缺少: "PR 汇总" 的具体能力                       │
│                                                      │
│  决策: 不需要全新 Skill，但需要增强 SKILL.md            │
│  → 在 github 的 SKILL.md 中追加 "PR 汇总" 章节        │
│  → 创建 cron job: 每天 9:00 触发                      │
│                                                      │
└──────────────────────────────────────────────────────┘
     │
     ▼
OpenClaw Agent 执行:
  1. 读取增强后的 github SKILL.md
  2. 用 gh CLI 拉取 PR 列表
  3. LLM 生成汇总
  4. 通过 message 工具发回钉钉
  5. 用 cron 工具注册定时任务
```

## 7. 技术选型

| 模块 | 技术 | 理由 |
|------|------|------|
| **桌面壳** | Electron + React | 全栈 TS，与 OpenClaw Node.js 生态一致 |
| **UI 框架** | React + Tailwind + shadcn/ui | 快速构建 Setup Wizard 和主界面 |
| **AI Scanner** | 读 ~/.openclaw/ + ~/.claude/ | 零配置发现本地 AI 资源 |
| **Gateway 通信** | WebSocket (复用 OpenClaw) | 直接接入已有 Gateway |
| **Scheduler** | 内存 DAG + OpenClaw sessions_spawn | 轻量，不额外依赖 Redis |
| **Orchestrator** | LLM 驱动 (用户选择的供应商) | 意图分析核心 |
| **Discovery** | Tavily / web_search 工具 | 全网搜索方案 |
| **Registry+** | 读 ~/.openclaw/skills/ + LLM 语义匹配 | 增强 OpenClaw 原有匹配 |
| **Factory** | LLM 生成 → 写入 ~/.openclaw/skills/ | 产出 OpenClaw 原生格式 |
| **Config** | Electron safeStorage | 加密存储凭证 |

**注意变化**: 不再需要独立的 Redis/BullMQ/SQLite —— Scheduler 用内存 DAG 即可（利用 OpenClaw 的 sessions_spawn 做并行），Registry 直接读文件系统。架构大幅简化。

## 8. 项目目录结构

```
openclaw-cn/
├── docs/
│   └── ARCHITECTURE.md
├── desktop/                            # Electron 桌面应用
│   ├── main/                           # 主进程
│   │   ├── index.ts                    # 入口
│   │   ├── ipc.ts                      # IPC handler 注册
│   │   ├── llm/                        # LLM Provider Manager
│   │   │   ├── scanner.ts              # 本地 AI 资源扫描器
│   │   │   ├── providers.ts            # 预设供应商注册表
│   │   │   ├── adapters/
│   │   │   │   ├── claude-cli.ts       # Claude CLI 适配器
│   │   │   │   ├── openclaw-bridge.ts  # OpenClaw Gateway 桥接
│   │   │   │   └── openai-compat.ts    # OpenAI 兼容适配器
│   │   │   └── manager.ts             # 统一管理
│   │   ├── installer/                  # 依赖安装引擎
│   │   │   ├── detector.ts
│   │   │   ├── installer.ts
│   │   │   └── linker.ts
│   │   ├── config/
│   │   │   └── store.ts               # 加密存储
│   │   └── node/                       # ★ AI Node 核心
│   │       ├── ai-node.ts             # AI Node 主类 (连接 Gateway)
│   │       ├── scheduler.ts           # 多任务 DAG 编排
│   │       ├── orchestrator.ts        # 意图分析 + 路径决策
│   │       ├── discovery.ts           # 全网方案搜索
│   │       ├── registry.ts            # 增强型 Skill 匹配
│   │       └── factory.ts             # Skill 自动生成
│   ├── renderer/                       # 渲染进程 (React)
│   │   ├── pages/
│   │   │   ├── Welcome.tsx
│   │   │   ├── LLMSetup.tsx           # AI 供应商选择 (扫描优先)
│   │   │   ├── DependencyInstall.tsx   # 一键安装
│   │   │   ├── DependencyConfig.tsx    # 凭证配置
│   │   │   └── Main.tsx               # 主界面
│   │   ├── components/
│   │   └── App.tsx
│   ├── dependencies.json               # 依赖清单
│   └── package.json
├── skills/                             # 项目内置的增强 Skills
│   └── (安装时复制到 ~/.openclaw/skills/)
├── workspace-patches/                  # Agent 人格增强补丁
│   └── AI-NODE.md                     # 注入到 ~/.openclaw/workspace/
├── .env
└── .gitignore
```

对比之前的架构，去掉了 `packages/` 目录下的 7 个独立包。全部收拢到 `desktop/main/node/` 下，因为：
- 不需要独立的 `runtime` —— OpenClaw Agent 就是 Runtime
- 不需要独立的 `core` 类型包 —— 复用 OpenClaw 的 Skill 格式
- 不需要独立的 `gateway` —— 已有的 OpenClaw Gateway
- 所有智能逻辑集中在 `node/` 目录下的 5 个文件里

## 9. 开发路线

### Phase 0 — 桌面应用基座

- Electron 脚手架 (React + Tailwind + shadcn/ui)
- AI 资源扫描器 (读 ~/.openclaw/ + ~/.claude/ + 环境变量)
- 一键依赖安装引擎
- 配置存储

**目标**: 双击打开 → 扫描/选择 AI → 一键装依赖 → 填配置 → 进入主界面

### Phase 1 — AI Node 核心

- `ai-node.ts`: 连接 OpenClaw Gateway
- `orchestrator.ts`: 意图分析
- `registry.ts`: 读 ~/.openclaw/skills/ + 语义匹配
- `factory.ts`: 生成 OpenClaw 格式的 Skill → 写入 ~/.openclaw/skills/
- `AI-NODE.md`: Agent 人格增强补丁

**目标**: 用户在钉钉说一句话 → AI Node 判断缺 Skill → 自动开发并安装 → Agent 用新 Skill 执行

### Phase 2 — 多任务 + 搜索

- `scheduler.ts`: DAG 编排 + sessions_spawn
- `discovery.ts`: 全网方案搜索
- UI: 任务状态面板、Skills 管理面板

### Phase 3 — 进化闭环

- Skill 使用反馈 → 自动优化 SKILL.md
- Skill 版本管理
- 相似 Skill 合并/重构

### Phase 4 — 生态

- Skills 分享市场
- 多 Node 协作
- Skill 模板库
