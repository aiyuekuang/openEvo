/**
 * 中文语言包
 * Chinese (Simplified) Language Pack
 */

export const zhCN = {
  // Brand
  brand: {
    title: "OPENCLAW CN",
    subtitle: "控制台",
  },

  // Navigation
  nav: {
    overview: "概览",
    channels: "渠道",
    instances: "实例",
    sessions: "会话",
    cron: "定时任务",
    skills: "技能",
    nodes: "节点",
    chat: "对话",
    config: "配置",
    debug: "调试",
    logs: "日志",
    resources: "资源",
    docs: "文档",
  },

  // Navigation groups
  navGroups: {
    core: "核心",
    messaging: "消息",
    management: "管理",
    developer: "开发者",
  },

  // Overview
  overview: {
    gatewayAccess: "Gateway 连接",
    gatewayAccessDesc: "控制台连接地址和认证方式",
    websocketUrl: "WebSocket 地址",
    gatewayToken: "Gateway Token",
    password: "密码 (不保存)",
    defaultSessionKey: "默认会话 Key",
    connect: "连接",
    refresh: "刷新",
    connectHint: "点击「连接」应用连接配置",
    snapshot: "快照",
    snapshotDesc: "最新的 Gateway 握手信息",
    status: "状态",
    connected: "已连接",
    disconnected: "未连接",
    uptime: "运行时长",
    tickInterval: "心跳间隔",
    lastChannelsRefresh: "最后渠道刷新",
    instances: "实例",
    instancesDesc: "最近 5 分钟的存活信标",
    sessions: "会话",
    sessionsDesc: "Gateway 记录的会话数",
    cron: "定时任务",
    enabled: "已启用",
    disabled: "已禁用",
    nextWake: "下次唤醒",
    notes: "提示",
    notesDesc: "远程控制配置提醒",
  },

  // Sessions
  sessions: {
    title: "会话",
    subtitle: "活跃会话和会话级配置",
    activeWithin: "活跃时间 (分钟)",
    limit: "数量限制",
    includeGlobal: "包含全局",
    includeUnknown: "包含未知",
    key: "Key",
    label: "标签",
    kind: "类型",
    updated: "更新时间",
    tokens: "Token 数",
    thinking: "思考",
    verbose: "详细",
    reasoning: "推理",
    actions: "操作",
    delete: "删除",
    noSessions: "暂无会话",
    inherit: "继承",
  },

  // Channels
  channels: {
    title: "渠道",
    subtitle: "消息渠道配置和状态",
    channelHealth: "渠道健康",
    channelHealthDesc: "Gateway 上报的渠道状态快照",
    configured: "已配置",
    running: "运行中",
    connected: "已连接",
    lastInbound: "最后收信",
    yes: "是",
    no: "否",
    // Chinese channels
    wecom: "企业微信",
    wecomDesc: "连接企业微信应用",
    dingtalk: "钉钉",
    dingtalkDesc: "连接钉钉机器人",
    feishu: "飞书",
    feishuDesc: "连接飞书应用",
  },

  // Chat
  chat: {
    title: "对话",
    subtitle: "与 AI 助手对话",
    newSession: "新会话",
    send: "发送",
    sending: "发送中...",
    focusMode: "专注模式",
    showThinking: "显示思考",
    placeholder: "输入消息...",
  },

  // Config
  config: {
    title: "配置",
    subtitle: "Gateway 配置管理",
    reload: "重新加载",
    save: "保存",
    apply: "应用",
    update: "更新",
  },

  // Common
  common: {
    loading: "加载中...",
    error: "错误",
    success: "成功",
    cancel: "取消",
    confirm: "确认",
    save: "保存",
    edit: "编辑",
    delete: "删除",
    refresh: "刷新",
    search: "搜索",
    filter: "筛选",
    noData: "暂无数据",
    na: "N/A",
    ok: "正常",
    offline: "离线",
    health: "健康",
  },

  // Time
  time: {
    justNow: "刚刚",
    minutesAgo: "{n} 分钟前",
    hoursAgo: "{n} 小时前",
    daysAgo: "{n} 天前",
  },
};

export type I18nKey = keyof typeof zhCN;
export default zhCN;
