import { useState, useMemo, useCallback, useEffect } from 'react';
import { Typography, Card, Input, Tag, Tabs, Row, Col, Badge, Tooltip, Button, Modal, message, Space, Form, Spin } from 'antd';
import { RocketOutlined, SearchOutlined, CheckCircleFilled, AppstoreOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, SettingOutlined, ExclamationCircleOutlined, LoadingOutlined, CloseCircleOutlined, DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { BUILTIN_SKILLS } from '../../../src/skill-marketplace/builtin-catalog';
import { SKILL_CATEGORIES } from '../../../src/skill-marketplace/types';
import type { SkillPackage, SkillCategory } from '../../../src/skill-marketplace/types';
import type { SkillStatus, SkillStatusInfo, SkillConfigValues } from '../../../src/skill-marketplace/skill-metadata';

const { Title, Text, Paragraph } = Typography;

// 本地存储 key
const INSTALLED_SKILLS_KEY = 'openclaw_installed_skills';

// 获取已安装的技能（默认未安装，只记录已安装的）
function getInstalledSkills(): Set<string> {
  try {
    const stored = localStorage.getItem(INSTALLED_SKILLS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// 保存已安装的技能
function saveInstalledSkills(skills: Set<string>) {
  localStorage.setItem(INSTALLED_SKILLS_KEY, JSON.stringify([...skills]));
}

// 状态标签配置
const STATUS_CONFIG: Record<SkillStatus, { color: string; icon: React.ReactNode; text: string }> = {
  ready: { color: 'success', icon: <CheckCircleFilled />, text: '已就绪' },
  needs_config: { color: 'warning', icon: <SettingOutlined />, text: '需配置' },
  needs_install: { color: 'default', icon: <DownloadOutlined />, text: '需安装依赖' },
  installing: { color: 'processing', icon: <LoadingOutlined />, text: '安装中' },
  configuring: { color: 'processing', icon: <LoadingOutlined />, text: '配置中' },
  error: { color: 'error', icon: <CloseCircleOutlined />, text: '错误' },
  disabled: { color: 'default', icon: <ExclamationCircleOutlined />, text: '已禁用' },
  unsupported: { color: 'default', icon: <QuestionCircleOutlined />, text: '不支持' },
};

// 配置字段类型
type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
};

// 分类图标映射
const categoryIcons: Record<SkillCategory, string> = {
  channel: '💬',
  provider: '🤖',
  tool: '🔧',
  memory: '🧠',
  automation: '⚡',
  analytics: '📊',
  security: '🔒',
  integration: '🔗',
  utility: '🛠️',
};

// 技能卡片组件
interface SkillCardProps {
  skill: SkillPackage;
  installed: boolean;
  statusInfo?: SkillStatusInfo;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onConfigure: (id: string) => void;
}

function SkillCard({ skill, installed, statusInfo, onInstall, onUninstall, onConfigure }: SkillCardProps) {
  const [loading, setLoading] = useState(false);

  // 未安装时不检测状态
  const status = installed ? (statusInfo?.status || 'ready') : 'disabled';
  const statusConfig = STATUS_CONFIG[status];

  const handleInstall = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    onInstall(skill.id);
    setLoading(false);
  };

  const handleUninstall = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    onUninstall(skill.id);
    setLoading(false);
  };

  // 根据状态决定按钮显示
  const renderActionButton = () => {
    // 未安装
    if (!installed) {
      return (
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          loading={loading}
          onClick={handleInstall}
          style={{ fontSize: 12 }}
        >
          安装
        </Button>
      );
    }

    // 已安装 - 需要配置
    if (status === 'needs_config') {
      return (
        <Button
          size="small"
          type="primary"
          icon={<SettingOutlined />}
          onClick={() => onConfigure(skill.id)}
          style={{ fontSize: 12 }}
        >
          配置
        </Button>
      );
    }

    // 已安装 - 需要安装依赖
    if (status === 'needs_install') {
      return (
        <Tooltip title={`缺少依赖: ${statusInfo?.missingBins?.join(', ') || '未知'}`}>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => onConfigure(skill.id)}
            style={{ fontSize: 12 }}
          >
            安装依赖
          </Button>
        </Tooltip>
      );
    }

    // 已安装 - 就绪
    return (
      <Button
        size="small"
        type="text"
        icon={<CheckCircleFilled style={{ color: '#52c41a' }} />}
        loading={loading}
        onClick={handleUninstall}
        style={{ fontSize: 12, color: '#52c41a' }}
      >
        已就绪
      </Button>
    );
  };

  return (
    <Card
      hoverable
      size="small"
      style={{ borderRadius: 8, height: '100%' }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{skill.icon || '📦'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text strong style={{ fontSize: 14 }}>{skill.name}</Text>
            {skill.verified && (
              <Tooltip title="官方认证">
                <CheckCircleFilled style={{ color: '#1890ff', fontSize: 12 }} />
              </Tooltip>
            )}
            {skill.featured && (
              <Badge count="推荐" style={{ backgroundColor: '#52c41a', fontSize: 10 }} />
            )}
          </div>
          {/* 状态标签 - 只在已安装且状态不是 ready 时显示 */}
          {installed && status !== 'ready' && (
            <Tag
              color={statusConfig.color}
              icon={statusConfig.icon}
              style={{ fontSize: 10, marginBottom: 6 }}
            >
              {statusConfig.text}
            </Tag>
          )}
          <Paragraph
            type="secondary"
            style={{ fontSize: 12, marginBottom: 8 }}
            ellipsis={{ rows: 2 }}
          >
            {skill.description}
          </Paragraph>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
              {skill.tags.slice(0, 2).map((tag) => (
                <Tag key={tag} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  {tag}
                </Tag>
              ))}
            </div>
            {renderActionButton()}
          </div>
        </div>
      </div>
    </Card>
  );
}

// 排除的分类（渠道和模型提供商有单独菜单）
const EXCLUDED_CATEGORIES = ['channel', 'provider'];

export default function Marketplace() {
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(() => getInstalledSkills());
  const [mySkillsOpen, setMySkillsOpen] = useState(false);

  // 状态管理
  const [skillStatuses, setSkillStatuses] = useState<Record<string, SkillStatusInfo>>({});
  const [statusLoading, setStatusLoading] = useState(false);

  // 配置弹窗状态
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configSkillId, setConfigSkillId] = useState<string | null>(null);
  const [configFields, setConfigFields] = useState<ConfigField[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [form] = Form.useForm();

  // 获取当前配置的技能信息
  const configSkill = useMemo(() => {
    if (!configSkillId) return null;
    return BUILTIN_SKILLS.find((s) => s.id === configSkillId) || null;
  }, [configSkillId]);

  // 过滤出工具类技能（排除渠道和模型提供商）
  const toolSkills = useMemo(() => {
    return BUILTIN_SKILLS.filter((s) => !EXCLUDED_CATEGORIES.includes(s.category));
  }, []);

// 模拟技能状态（Web 模式）
  // 基于技能名称模拟哪些需要配置/安装
  const getMockStatus = useCallback((skill: SkillPackage): SkillStatusInfo => {
    const id = skill.id;
    // 需要 API Key 的技能
    const needsApiKey = [
      '@openclaw/notion', '@openclaw/linear', '@openclaw/github',
      '@openclaw/sentry', '@openclaw/todoist', '@openclaw/youtube-transcript',
    ];
    // 需要安装 CLI 的技能
    const needsCli = [
      '@openclaw/1password', '@openclaw/apple-notes', '@openclaw/apple-reminders',
      '@openclaw/bear-notes', '@openclaw/blucli', '@openclaw/canvas',
      '@openclaw/eightctl', '@openclaw/gifgrep', '@openclaw/himalaya',
    ];
    
    if (needsApiKey.includes(id)) {
      return {
        status: 'needs_config',
        missingEnv: [id.replace('@openclaw/', '').toUpperCase() + '_API_KEY'],
        message: '需要配置 API Key',
      };
    }
    if (needsCli.includes(id)) {
      return {
        status: 'needs_install',
        missingBins: [id.replace('@openclaw/', '')],
        message: '需要安装 CLI 工具',
      };
    }
    return { status: 'ready' };
  }, []);

  // 加载技能状态
  const loadStatuses = useCallback(async () => {
    setStatusLoading(true);
    
    // 检查 electronAPI 是否可用
    if (typeof window !== 'undefined' && window.electronAPI?.skill) {
      try {
        // 传入所有工具技能的 ID
        const skillIds = toolSkills.map((s) => s.id);
        const statuses = await window.electronAPI.skill.getAllStatuses(skillIds);
        setSkillStatuses(statuses);
      } catch (error) {
        console.error('加载技能状态失败:', error);
      }
    } else {
      // Web 模式: 使用 mock 状态
      const mockStatuses: Record<string, SkillStatusInfo> = {};
      for (const skill of toolSkills) {
        mockStatuses[skill.id] = getMockStatus(skill);
      }
      setSkillStatuses(mockStatuses);
    }
    
    setStatusLoading(false);
  }, [toolSkills, getMockStatus]);

  // 组件加载时获取状态
  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // 安装技能（加入已安装列表）
  const handleInstall = useCallback(async (id: string) => {
    setInstalledSkills((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveInstalledSkills(next);
      return next;
    });

    if (window.electronAPI?.skill) {
      try {
        await window.electronAPI.skill.install(id);
        await loadStatuses();
      } catch (error) {
        console.error('安装失败:', error);
      }
    }
    message.success('安装成功');
  }, [loadStatuses]);

  // 卸载技能（从已安装列表移除）
  const handleUninstall = useCallback(async (id: string) => {
    setInstalledSkills((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveInstalledSkills(next);
      return next;
    });

    if (window.electronAPI?.skill) {
      try {
        await window.electronAPI.skill.uninstall(id);
      } catch (error) {
        console.error('卸载失败:', error);
      }
    }
    message.success('已卸载');
  }, []);

  // 打开配置弹窗
  const handleConfigure = useCallback(async (id: string) => {
    setConfigSkillId(id);
    setConfigModalOpen(true);

    // 加载配置字段
    if (window.electronAPI?.skill) {
      try {
        const fields = await window.electronAPI.skill.getConfigFields(id);
        setConfigFields(fields);

        // 加载已有配置
        const savedConfig = await window.electronAPI.skill.getConfig(id);
        if (savedConfig?.values) {
          form.setFieldsValue(savedConfig.values);
        }
      } catch (error) {
        console.error('加载配置字段失败:', error);
        // 使用默认字段
        const statusInfo = skillStatuses[id];
        if (statusInfo?.missingEnv) {
          setConfigFields(statusInfo.missingEnv.map((env) => ({
            key: env,
            label: env.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            type: env.toLowerCase().includes('key') || env.toLowerCase().includes('secret') ? 'password' : 'text',
            required: true,
            placeholder: `输入 ${env}`,
          })));
        }
      }
    } else {
      // 非 Electron 环境，使用 mock 数据
      const statusInfo = skillStatuses[id];
      if (statusInfo?.missingEnv) {
        setConfigFields(statusInfo.missingEnv.map((env) => ({
          key: env,
          label: env.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: env.toLowerCase().includes('key') || env.toLowerCase().includes('secret') ? 'password' : 'text',
          required: true,
          placeholder: `输入 ${env}`,
        })));
      }
    }
  }, [form, skillStatuses]);

  // 保存配置
  const handleSaveConfig = useCallback(async () => {
    if (!configSkillId) return;

    try {
      const values = await form.validateFields();
      setConfigSaving(true);

      if (window.electronAPI?.skill) {
        await window.electronAPI.skill.saveConfig(configSkillId, values as SkillConfigValues);
        await loadStatuses();
      }

      message.success('配置已保存');
      setConfigModalOpen(false);
      form.resetFields();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        // 表单验证错误
        return;
      }
      console.error('保存配置失败:', error);
      message.error('保存失败');
    } finally {
      setConfigSaving(false);
    }
  }, [configSkillId, form, loadStatuses]);

  // 已安装的技能列表
  const installedSkillList = useMemo(() => {
    return toolSkills.filter((s) => installedSkills.has(s.id));
  }, [toolSkills, installedSkills]);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    let skills = toolSkills;

    // 按分类过滤
    if (activeCategory !== 'all') {
      skills = skills.filter((s) => s.category === activeCategory);
    }

    // 按搜索词过滤
    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return skills;
  }, [searchText, activeCategory, toolSkills]);

  // 按分类统计数量
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: toolSkills.length };
    for (const cat of SKILL_CATEGORIES) {
      if (!EXCLUDED_CATEGORIES.includes(cat.id)) {
        counts[cat.id] = toolSkills.filter((s) => s.category === cat.id).length;
      }
    }
    return counts;
  }, [toolSkills]);

  // Tab 项
  const tabItems = [
    { key: 'all', label: `全部 (${categoryCounts.all})` },
    ...SKILL_CATEGORIES
      .filter((c) => !EXCLUDED_CATEGORIES.includes(c.id) && categoryCounts[c.id] > 0)
      .map((cat) => ({
        key: cat.id,
        label: `${categoryIcons[cat.id]} ${cat.label} (${categoryCounts[cat.id]})`,
      })),
  ];

  return (
    <div style={{ padding: 28 }} className="animate-fade-in">
      {/* 页头 */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4, fontWeight: 700 }}>
            <RocketOutlined style={{ marginRight: 8 }} />
            技能市场
          </Title>
          <Text type="secondary">
            发现并启用技能来扩展 AI 助手能力
          </Text>
        </div>
        <Button
          icon={<AppstoreOutlined />}
          onClick={() => setMySkillsOpen(true)}
        >
          我的技能 ({installedSkillList.length})
        </Button>
      </div>

      {/* 搜索框 */}
      <Input
        placeholder="搜索技能..."
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 320 }}
        allowClear
      />

      {/* 分类 Tab */}
      <Tabs
        activeKey={activeCategory}
        onChange={setActiveCategory}
        items={tabItems}
        size="small"
        style={{ marginBottom: 16 }}
      />

      {/* 技能列表 */}
      {statusLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在加载技能状态...</Text>
          </div>
        </div>
      ) : filteredSkills.length > 0 ? (
        <Row gutter={[16, 16]}>
          {filteredSkills.map((skill) => (
            <Col key={skill.id} xs={24} sm={12} md={8} lg={6}>
              <SkillCard
                skill={skill}
                installed={installedSkills.has(skill.id)}
                statusInfo={skillStatuses[skill.id]}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onConfigure={handleConfigure}
              />
            </Col>
          ))}
        </Row>
      ) : (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">未找到匹配的技能</Text>
        </Card>
      )}

      {/* 我的技能弹窗 */}
      <Modal
        title={
          <Space>
            <AppstoreOutlined />
            我的技能
          </Space>
        }
        open={mySkillsOpen}
        onCancel={() => setMySkillsOpen(false)}
        footer={null}
        width={600}
      >
        {installedSkillList.length > 0 ? (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {installedSkillList.map((skill) => {
              const statusInfo = skillStatuses[skill.id];
              const status = statusInfo?.status || 'ready';
              return (
                <Card
                  key={skill.id}
                  size="small"
                  style={{ marginBottom: 12 }}
                  styles={{ body: { padding: 12 } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 24 }}>{skill.icon || '📦'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong>{skill.name}</Text>
                        {status !== 'ready' && (
                          <Tag
                            color={STATUS_CONFIG[status].color}
                            style={{ fontSize: 10 }}
                          >
                            {STATUS_CONFIG[status].text}
                          </Tag>
                        )}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {skill.description}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleUninstall(skill.id)}
                    >
                      卸载
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">暂无已安装的技能</Text>
            <br />
            <Button
              type="link"
              onClick={() => setMySkillsOpen(false)}
              style={{ marginTop: 8 }}
            >
              去技能市场看看
            </Button>
          </div>
        )}
      </Modal>

      {/* 配置弹窗 */}
      <Modal
        title={
          <Space>
            <SettingOutlined />
            配置 {configSkill?.name || '技能'}
          </Space>
        }
        open={configModalOpen}
        onCancel={() => {
          setConfigModalOpen(false);
          form.resetFields();
          setConfigFields([]);
        }}
        onOk={handleSaveConfig}
        confirmLoading={configSaving}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        {configFields.length > 0 ? (
          <Form
            form={form}
            layout="vertical"
            style={{ marginTop: 16 }}
          >
            {configFields.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={field.label}
                rules={field.required ? [{ required: true, message: `请输入 ${field.label}` }] : []}
              >
                <Input
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={field.placeholder}
                />
              </Form.Item>
            ))}
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                配置将保存到 ~/.openclaw/skills/ 目录
              </Text>
            </div>
          </Form>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">此技能无需配置</Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
