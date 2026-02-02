import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Typography, Card, Input, Tag, Tabs, Badge, Tooltip, Button, Modal, message, Space, Form, Spin, Switch, Divider, Alert, Progress, Skeleton, Dropdown, Drawer, Segmented, Popover } from 'antd';
import { RocketOutlined, SearchOutlined, CheckCircleFilled, AppstoreOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, SettingOutlined, ExclamationCircleOutlined, LoadingOutlined, CloseCircleOutlined, DownloadOutlined, QuestionCircleOutlined, InfoCircleOutlined, DownOutlined, WarningOutlined, KeyOutlined, CopyOutlined, MessageOutlined, RobotOutlined, ToolOutlined, BulbOutlined, ThunderboltOutlined, BarChartOutlined, SafetyOutlined, ApiOutlined, AppstoreAddOutlined, MoreOutlined, PauseCircleOutlined, FireOutlined, RightOutlined } from '@ant-design/icons';
import { BUILTIN_SKILLS, CORE_BUILTIN_FEATURES, type CoreBuiltinFeature } from '../../../src/skill-marketplace/builtin-catalog';
import { SKILL_CATEGORIES } from '../../../src/skill-marketplace/types';
import type { SkillPackage, SkillCategory } from '../../../src/skill-marketplace/types';
import type { SkillStatus, SkillStatusInfo, SkillConfigValues } from '../../../src/skill-marketplace/skill-metadata';

const { Title, Text, Paragraph } = Typography;

// 骨架屏卡片组件
function SkillCardSkeleton() {
  return (
    <Card size="small" style={{ borderRadius: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Skeleton.Avatar active size={32} shape="square" style={{ borderRadius: 6 }} />
        <div style={{ flex: 1 }}>
          <Skeleton.Input active size="small" style={{ width: 120, height: 16 }} />
        </div>
        <Skeleton.Button active size="small" style={{ width: 60 }} />
      </div>
      <Skeleton active paragraph={{ rows: 2, width: ['100%', '80%'] }} title={false} />
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <Skeleton.Button active size="small" style={{ width: 50, height: 22 }} />
        <Skeleton.Button active size="small" style={{ width: 50, height: 22 }} />
      </div>
    </Card>
  );
}

// 安全打开外部链接
const openUrl = (url: string) => {
  try {
    // 优先使用 Electron 的 openExternal
    if (typeof window !== 'undefined' && 
        window.electronAPI && 
        typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url);
    } else {
      // 回退到 window.open
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    // 最后的回退
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

// 状态标签配置（完整的 12 状态支持）
const STATUS_CONFIG: Record<SkillStatus, { color: string; icon: React.ReactNode; text: string }> = {
  not_installed: { color: 'default', icon: <PlusOutlined />, text: '未安装' },
  installing: { color: 'processing', icon: <LoadingOutlined />, text: '安装中' },
  needs_deps: { color: 'warning', icon: <DownloadOutlined />, text: '需安装依赖' },
  installing_deps: { color: 'processing', icon: <LoadingOutlined />, text: '安装依赖中' },
  needs_auth: { color: 'warning', icon: <KeyOutlined />, text: '需登录' },
  needs_config: { color: 'warning', icon: <SettingOutlined />, text: '需配置' },
  configuring: { color: 'processing', icon: <LoadingOutlined />, text: '配置中' },
  ready: { color: 'success', icon: <CheckCircleFilled />, text: '已就绪' },
  active: { color: 'success', icon: <CheckCircleFilled style={{ color: '#52c41a' }} />, text: '运行中' },
  disabled: { color: 'default', icon: <ExclamationCircleOutlined />, text: '已禁用' },
  error: { color: 'error', icon: <CloseCircleOutlined />, text: '错误' },
  unsupported: { color: 'default', icon: <QuestionCircleOutlined />, text: '不支持' },
};

// 配置字段类型
type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  helpUrl?: string;
};

// 分类图标映射 - 使用 Ant Design Icons
const categoryIcons: Record<SkillCategory, React.ReactNode> = {
  channel: <MessageOutlined />,
  provider: <RobotOutlined />,
  tool: <ToolOutlined />,
  memory: <BulbOutlined />,
  automation: <ThunderboltOutlined />,
  analytics: <BarChartOutlined />,
  security: <SafetyOutlined />,
  integration: <ApiOutlined />,
  utility: <AppstoreAddOutlined />,
};

// 核心内置工具卡片组件
function CoreFeatureCard({ feature }: { feature: CoreBuiltinFeature }) {
  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        background: 'linear-gradient(135deg, #f6ffed 0%, #ffffff 100%)',
        border: '1px solid #b7eb8f',
      }}
      styles={{ body: { padding: 12 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ 
          fontSize: 24, 
          width: 36, 
          height: 36, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#f6ffed',
          borderRadius: 8,
        }}>
          {feature.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text strong style={{ fontSize: 13 }}>{feature.name}</Text>
            <Tag color="green" style={{ fontSize: 10, margin: 0 }}>
              <CheckCircleFilled /> 内置
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
            {feature.description}
          </Text>
          {feature.toolNames && feature.toolNames.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {feature.toolNames.slice(0, 3).map((name) => (
                <Tag key={name} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  {name}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// 技能卡片组件
interface SkillCardProps {
  skill: SkillPackage;
  installed: boolean;
  statusInfo?: SkillStatusInfo;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onConfigure: (id: string) => void;
  onShowDetail: (skill: SkillPackage) => void;
  justInstalled?: boolean;
}

function SkillCard({ skill, installed, statusInfo, onInstall, onUninstall, onConfigure, onShowDetail, justInstalled }: SkillCardProps) {
  const [loading, setLoading] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 未安装时使用 not_installed 状态
  const status = installed ? (statusInfo?.status || 'ready') : 'not_installed';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.error;

  // 从 capabilities 提取能力描述
  const getCapabilityDescription = () => {
    const caps = skill.capabilities || [];
    const parts: string[] = [];
    for (const cap of caps) {
      if (cap.type === 'tool') {
        parts.push(`提供工具: ${cap.names.join(', ')}`);
      } else if (cap.type === 'channel') {
        parts.push(`渠道: ${cap.id}`);
      } else if (cap.type === 'provider') {
        parts.push(`模型: ${cap.id}`);
      } else if (cap.type === 'hook') {
        parts.push(`事件钩子: ${cap.events.join(', ')}`);
      } else if (cap.type === 'command') {
        parts.push(`命令: ${cap.names.join(', ')}`);
      }
    }
    return parts;
  };

  // 从 tags 提取使用场景
  const getUseCases = () => {
    const scenarios = skill.tags.filter(t => 
      !['tool', 'channel', 'provider', 'memory', 'automation'].includes(t.toLowerCase())
    ).slice(0, 4);
    return scenarios;
  };

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

    // 平台不支持
    if (status === 'unsupported') {
      return (
        <Tooltip title={statusInfo?.message || '当前系统不支持该技能'}>
          <Button
            size="small"
            type="text"
            icon={<WarningOutlined style={{ color: '#faad14' }} />}
            disabled
            style={{ fontSize: 12, color: '#999', cursor: 'not-allowed' }}
          >
            不支持
          </Button>
        </Tooltip>
      );
    }

    // 卸载菜单项（复用）
    const uninstallMenuItem = {
      key: 'uninstall',
      label: '卸载',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: `确认卸载 ${skill.name}？`,
          content: '卸载后技能配置将被删除',
          okText: '卸载',
          okType: 'danger',
          cancelText: '取消',
          onOk: handleUninstall,
        });
      },
    };

    // 已安装 - 需要配置
    if (status === 'needs_config') {
      return (
        <Space size={4}>
          <Button
            size="small"
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => onConfigure(skill.id)}
            style={{ fontSize: 12 }}
          >
            配置
          </Button>
          <Dropdown
            menu={{ items: [uninstallMenuItem] }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
              style={{ padding: '0 4px', minWidth: 24, height: 22 }}
            />
          </Dropdown>
        </Space>
      );
    }

    // 已安装 - 需要安装依赖
    if (status === 'needs_deps') {
      return (
        <Space size={4}>
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
          <Dropdown
            menu={{ items: [uninstallMenuItem] }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
              style={{ padding: '0 4px', minWidth: 24, height: 22 }}
            />
          </Dropdown>
        </Space>
      );
    }

    // 已安装 - 需要登录认证
    if (status === 'needs_auth') {
      return (
        <Space size={4}>
          <Tooltip title={statusInfo?.auth?.message || statusInfo?.message || '需要登录'}>
            <Button
              size="small"
              icon={<KeyOutlined />}
              onClick={() => onConfigure(skill.id)}
              style={{ fontSize: 12 }}
            >
              登录
            </Button>
          </Tooltip>
          <Dropdown
            menu={{ items: [uninstallMenuItem] }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
              style={{ padding: '0 4px', minWidth: 24, height: 22 }}
            />
          </Dropdown>
        </Space>
      );
    }

    // 正在安装依赖
    if (status === 'installing_deps') {
      return (
        <Button
          size="small"
          type="text"
          icon={<LoadingOutlined />}
          disabled
          style={{ fontSize: 12, color: '#1890ff' }}
        >
          安装依赖中
        </Button>
      );
    }

    // 运行中 或 已就绪 - 使用状态标签 + 下拉菜单
    const isActive = status === 'active';
    // 检查 checksInfo.results 中是否有 input 字段
    const hasInputFields = statusInfo?.checksInfo?.results?.some(
      (r: { input?: { key: string } }) => r.input
    );
    const menuItems = [
      // 只有有 input 字段的技能才显示配置选项
      ...(hasInputFields ? [
        {
          key: 'config',
          label: '配置',
          icon: <SettingOutlined />,
          onClick: () => onConfigure(skill.id),
        },
      ] : []),
      uninstallMenuItem,
    ];

    return (
      <Space size={4}>
        <Tag
          color={isActive ? 'success' : 'processing'}
          icon={<CheckCircleFilled />}
          style={{ margin: 0, cursor: 'default' }}
        >
          {isActive ? '运行中' : '已就绪'}
        </Tag>
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
            style={{ padding: '0 4px', minWidth: 24, height: 22 }}
          />
        </Dropdown>
      </Space>
    );
  };

  const capabilityDesc = getCapabilityDescription();
  const useCases = getUseCases();

  // 悬停预览内容
  const hoverPreviewContent = (
    <div style={{ width: 280, padding: 4 }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 28 }}>{skill.icon || '📦'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text strong style={{ fontSize: 15 }}>{skill.name}</Text>
            {skill.verified && <CheckCircleFilled style={{ color: '#1890ff', fontSize: 12 }} />}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>v{skill.version}</Text>
        </div>
      </div>

      {/* 完整描述 */}
      <Paragraph
        type="secondary"
        style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}
        ellipsis={{ rows: 3 }}
      >
        {skill.description}
      </Paragraph>

      {/* 能力预览 */}
      {capabilityDesc.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
            功能特性
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {capabilityDesc.slice(0, 3).map((desc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--primary, #1890ff)',
                  flexShrink: 0,
                }} />
                <Text style={{ fontSize: 12 }}>{desc}</Text>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 标签 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
        {skill.tags.slice(0, 5).map((tag) => (
          <Tag key={tag} style={{ fontSize: 11, margin: 0, padding: '1px 6px' }}>{tag}</Tag>
        ))}
      </div>

      {/* 快速操作 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!installed ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            loading={loading}
            onClick={(e) => {
              e.stopPropagation();
              setHoverOpen(false);
              handleInstall();
            }}
            style={{ flex: 1 }}
          >
            安装
          </Button>
        ) : (
          <Tag
            color="success"
            icon={<CheckCircleFilled />}
            style={{ margin: 0, flex: 1, textAlign: 'center', padding: '4px 0' }}
          >
            已安装
          </Tag>
        )}
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setHoverOpen(false);
            onShowDetail(skill);
          }}
        >
          详情 <RightOutlined style={{ fontSize: 10 }} />
        </Button>
      </div>
    </div>
  );

  // 悬停延迟处理
  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverOpen(true);
    }, 500); // 500ms 延迟
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoverOpen(false);
  };

  return (
    <Popover
      content={hoverPreviewContent}
      placement="right"
      open={hoverOpen}
      arrow={false}
      overlayStyle={{ maxWidth: 320 }}
      overlayInnerStyle={{
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        border: '1px solid var(--border, #f0f0f0)',
      }}
    >
      <Card
        hoverable
        size="small"
        className={justInstalled ? 'skill-card-success' : ''}
        style={{ borderRadius: 10, height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
        styles={{ body: { padding: 14, display: 'flex', flexDirection: 'column', flex: 1 } }}
        onClick={() => onShowDetail(skill)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      {/* 头部：图标 + 标题 + 状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          fontSize: 24,
          lineHeight: 1,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'var(--bg-muted, #f5f5f5)',
          borderRadius: 8,
        }}>
          {skill.icon || '📦'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 14, lineHeight: 1.2 }}>{skill.name}</Text>
            {skill.verified && (
              <Tooltip title="官方认证">
                <CheckCircleFilled style={{ color: '#1890ff', fontSize: 11 }} />
              </Tooltip>
            )}
          </div>
        </div>
        {/* 右侧状态/操作按钮 */}
        <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {renderActionButton()}
        </div>
      </div>

      {/* 状态标签 - 只在已安装且状态需要关注时显示 */}
      {installed && status !== 'ready' && status !== 'active' && (
        <Tag
          color={statusConfig.color}
          icon={statusConfig.icon}
          style={{ fontSize: 11, marginBottom: 8, alignSelf: 'flex-start' }}
        >
          {statusConfig.text}
        </Tag>
      )}

      {/* 描述 */}
      <Paragraph
        type="secondary"
        style={{ fontSize: 12, marginBottom: 10, flex: 1, lineHeight: 1.6 }}
        ellipsis={{ rows: 2 }}
      >
        {skill.description}
      </Paragraph>

      {/* 底部：标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
        {skill.tags.slice(0, 3).map((tag) => (
          <Tag key={tag} style={{ fontSize: 11, margin: 0, padding: '2px 6px', borderRadius: 4 }}>
            {tag}
          </Tag>
        ))}
      </div>
    </Card>
    </Popover>
  );
}

// 我的技能分组列表组件
interface MySkillsGroupedListProps {
  skills: SkillPackage[];
  skillStatuses: Record<string, SkillStatusInfo>;
  onConfigure: (id: string) => void;
  onUninstall: (id: string) => void;
}

function MySkillsGroupedList({ skills, skillStatuses, onConfigure, onUninstall }: MySkillsGroupedListProps) {
  // 按状态分组
  const grouped = useMemo(() => {
    const running: SkillPackage[] = [];
    const needsAction: SkillPackage[] = [];
    const unavailable: SkillPackage[] = [];

    for (const skill of skills) {
      const status = skillStatuses[skill.id]?.status || 'ready';
      if (status === 'ready' || status === 'active') {
        running.push(skill);
      } else if (status === 'needs_config' || status === 'needs_deps' || status === 'needs_auth') {
        needsAction.push(skill);
      } else {
        unavailable.push(skill);
      }
    }
    return { running, needsAction, unavailable };
  }, [skills, skillStatuses]);

  // 渲染单个技能项
  const renderSkillItem = (skill: SkillPackage) => {
    const statusInfo = skillStatuses[skill.id];
    const status = statusInfo?.status || 'ready';
    const isReady = status === 'ready' || status === 'active';
    const needsAttention = status === 'needs_deps' || status === 'needs_config';
    const needsAuth = status === 'needs_auth';
    const isUnsupported = status === 'unsupported';

    const getStatusText = () => {
      if (status === 'active') return '运行中';
      if (status === 'ready') return '已就绪';
      if (status === 'needs_deps') return `缺少: ${statusInfo?.missingBins?.join(', ') || '依赖'}`;
      if (status === 'needs_auth') return statusInfo?.auth?.message || '需要登录';
      if (status === 'needs_config') return `需配置: ${statusInfo?.missingEnv?.slice(0, 2).join(', ') || ''}`;
      if (status === 'unsupported') return statusInfo?.message || '不支持';
      if (status === 'error') return '错误';
      if (status === 'disabled') return '已禁用';
      return '';
    };

    return (
      <div
        key={skill.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-elevated, #fff)',
          borderRadius: 8,
          marginBottom: 8,
          border: '1px solid var(--border, #f0f0f0)',
          transition: 'all 0.2s',
        }}
      >
        {/* 图标 */}
        <div style={{ fontSize: 24, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {skill.icon || '📦'}
        </div>

        {/* 信息 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 14 }}>{skill.name}</Text>
            {skill.verified && <CheckCircleFilled style={{ color: '#1890ff', fontSize: 11 }} />}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{getStatusText()}</Text>
        </div>

        {/* 操作 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* 需要配置/依赖/登录 */}
          {(needsAttention || needsAuth) && !isUnsupported && (
            <>
              <Button
                size="small"
                type="primary"
                icon={needsAuth ? <KeyOutlined /> : (status === 'needs_config' ? <SettingOutlined /> : <DownloadOutlined />)}
                onClick={() => onConfigure(skill.id)}
              >
                {needsAuth ? '登录' : (status === 'needs_config' ? '配置' : '安装')}
              </Button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'uninstall',
                      label: '卸载',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认卸载 ${skill.name}？`,
                          content: '卸载后技能配置将被删除',
                          okText: '卸载',
                          okType: 'danger',
                          cancelText: '取消',
                          onOk: () => onUninstall(skill.id),
                        });
                      },
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            </>
          )}

          {/* 就绪状态 - 只有有 input 字段时才显示配置选项 */}
          {isReady && (() => {
            const hasInputFields = statusInfo?.checksInfo?.results?.some(
              (r: { input?: { key: string } }) => r.input
            );
            return (
              <Dropdown
                menu={{
                  items: [
                    // 只有有 input 字段的技能才显示配置选项
                    ...(hasInputFields ? [
                      {
                        key: 'config',
                        label: '配置',
                        icon: <SettingOutlined />,
                        onClick: () => onConfigure(skill.id),
                      },
                      { type: 'divider' as const },
                    ] : []),
                    {
                      key: 'uninstall',
                      label: '卸载',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: `确认卸载 ${skill.name}？`,
                          content: '卸载后技能配置将被删除',
                          okText: '卸载',
                          okType: 'danger',
                          cancelText: '取消',
                          onOk: () => onUninstall(skill.id),
                        });
                      },
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            );
          })()}

          {/* 不可用状态 - 仅显示卸载 */}
          {(isUnsupported || status === 'error' || status === 'disabled') && (
            <Tooltip title="卸载">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: `确认卸载 ${skill.name}？`,
                    okText: '卸载',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => onUninstall(skill.id),
                  });
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  // 渲染分组
  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    color: string,
    items: SkillPackage[],
    defaultExpanded = true
  ) => {
    if (items.length === 0) return null;

    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color, fontSize: 16 }}>{icon}</span>
          <Text strong style={{ fontSize: 14 }}>{title}</Text>
          <Tag style={{ marginLeft: 4 }}>{items.length}</Tag>
        </div>
        <div>
          {items.map(renderSkillItem)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxHeight: 'calc(80vh - 140px)', overflowY: 'auto', paddingRight: 4 }}>
      {renderGroup('正常运行', <CheckCircleFilled />, 'var(--status-running, #22c55e)', grouped.running)}
      {renderGroup('需要操作', <ExclamationCircleOutlined />, 'var(--status-warning, #faad14)', grouped.needsAction)}
      {renderGroup('不可用', <CloseCircleOutlined />, 'var(--status-disabled, #d9d9d9)', grouped.unavailable, false)}
    </div>
  );
}

// 空状态组件
interface EmptyStateProps {
  searchText: string;
  statusFilter: StatusFilter;
  similarSkills: SkillPackage[];
  hotSearchTerms: string[];
  onClearSearch: () => void;
  onClearFilter: () => void;
  onSelectTerm: (term: string) => void;
  onShowDetail: (skill: SkillPackage) => void;
  onGoToMarket: () => void;
}

function EmptyState({
  searchText,
  statusFilter,
  similarSkills,
  hotSearchTerms,
  onClearSearch,
  onClearFilter,
  onSelectTerm,
  onShowDetail,
}: EmptyStateProps) {
  // 根据不同情况显示不同空状态
  const getEmptyContent = () => {
    // 搜索无结果
    if (searchText) {
      return {
        icon: '🔍',
        title: `未找到 "${searchText}" 相关技能`,
        description: '试试其他关键词，或浏览下方推荐',
        showSimilar: true,
        showHotSearch: true,
        action: (
          <Button type="link" onClick={onClearSearch}>
            清除搜索，查看全部技能
          </Button>
        ),
      };
    }

    // 已安装筛选为空
    if (statusFilter === 'installed') {
      return {
        icon: '📦',
        title: '暂无已安装的技能',
        description: '浏览技能市场，发现适合你的工具',
        showSimilar: false,
        showHotSearch: true,
        action: (
          <Button type="primary" onClick={onClearFilter}>
            浏览全部技能
          </Button>
        ),
      };
    }

    // 需操作筛选为空
    if (statusFilter === 'needs_action') {
      return {
        icon: '✅',
        title: '太棒了！所有技能都已就绪',
        description: '没有需要配置或安装依赖的技能',
        showSimilar: false,
        showHotSearch: false,
        action: (
          <Button type="link" onClick={onClearFilter}>
            返回全部技能
          </Button>
        ),
      };
    }

    // 分类为空
    return {
      icon: '📂',
      title: '该分类下暂无技能',
      description: '试试其他分类，或搜索你想要的功能',
      showSimilar: false,
      showHotSearch: true,
      action: (
        <Button type="link" onClick={onClearFilter}>
          查看全部技能
        </Button>
      ),
    };
  };

  const content = getEmptyContent();

  return (
    <Card
      style={{
        textAlign: 'center',
        padding: 48,
        borderRadius: 12,
        background: 'linear-gradient(180deg, var(--bg-elevated, #fff) 0%, var(--bg-base, #fafafa) 100%)',
      }}
    >
      <div style={{
        fontSize: 56,
        marginBottom: 20,
        opacity: 0.6,
        filter: 'grayscale(30%)',
      }}>
        {content.icon}
      </div>
      <Text style={{ fontSize: 17, fontWeight: 500, display: 'block', marginBottom: 8 }}>
        {content.title}
      </Text>
      <Text type="secondary" style={{ fontSize: 14 }}>
        {content.description}
      </Text>

      {/* 相似推荐 */}
      {content.showSimilar && similarSkills.length > 0 && (
        <div style={{ marginTop: 28, textAlign: 'left' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            你可能在找：
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {similarSkills.map((skill) => (
              <Tag
                key={skill.id}
                style={{
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => {
                  onClearSearch();
                  onShowDetail(skill);
                }}
              >
                <span>{skill.icon}</span>
                <span>{skill.name}</span>
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* 热门搜索建议 */}
      {content.showHotSearch && hotSearchTerms.length > 0 && (
        <div style={{ marginTop: 28, textAlign: 'left' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            热门搜索：
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hotSearchTerms.slice(0, 6).map((term) => (
              <Tag
                key={term}
                color="blue"
                style={{ cursor: 'pointer', margin: 0, padding: '4px 10px' }}
                onClick={() => onSelectTerm(term)}
              >
                {term}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {content.action}
      </div>
    </Card>
  );
}

// 排除的分类（渠道和模型提供商有单独菜单）
const EXCLUDED_CATEGORIES = ['channel', 'provider'];

type StatusFilter = 'all' | 'installed' | 'not_installed' | 'needs_action';

export default function Marketplace() {
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mySkillsOpen, setMySkillsOpen] = useState(false);
  
  // 已安装技能（从文件系统检测）
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());

  // 状态管理
  const [skillStatuses, setSkillStatuses] = useState<Record<string, SkillStatusInfo>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusProgress, setStatusProgress] = useState<{ current: number; total: number; currentSkill?: string } | null>(null);

  // 配置弹窗状态
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configSkillId, setConfigSkillId] = useState<string | null>(null);
  const [configFields, setConfigFields] = useState<ConfigField[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [form] = Form.useForm();
  
  // 安装日志状态
  const [installLogs, setInstallLogs] = useState<Array<{ message: string; type: 'info' | 'error' | 'success'; timestamp: number }>>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false); // 安装失败标记
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  // 技能详情抽屉
  const [detailSkill, setDetailSkill] = useState<SkillPackage | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // 最近安装成功的技能 ID (用于播放动画)
  const [recentlyInstalled, setRecentlyInstalled] = useState<Set<string>>(new Set());

  const handleShowDetail = useCallback((skill: SkillPackage) => {
    setDetailSkill(skill);
    setDetailDrawerOpen(true);
  }, []);

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
        installed: true,
        enabled: false,
        missingEnv: [id.replace('@openclaw/', '').toUpperCase() + '_API_KEY'],
        message: '需要配置 API Key',
      };
    }
    if (needsCli.includes(id)) {
      return {
        status: 'needs_deps',
        installed: true,
        enabled: false,
        missingBins: [id.replace('@openclaw/', '')],
        message: '需要安装 CLI 工具',
      };
    }
    return { status: 'ready', installed: true, enabled: true };
  }, []);

  // 加载技能状态
  // showLoading: 是否显示骨架屏，默认 true（首次加载），后续刷新传 false
  const loadStatuses = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setStatusLoading(true);
      setStatusProgress({ current: 0, total: toolSkills.length });
    }
    const skillIds = toolSkills.map((s) => s.id);
    
    // 检查 electronAPI 是否可用
    if (typeof window !== 'undefined' && window.electronAPI?.skill) {
      try {
        // 传入所有工具技能的 ID
        const statuses = await window.electronAPI.skill.getAllStatuses(skillIds);
        setSkillStatuses(statuses);
      } catch (error) {
        console.error('加载技能状态失败:', error);
      }
    } else {
      // Web 模式: 使用 mock 状态
      const mockStatuses: Record<string, SkillStatusInfo> = {};
      for (let i = 0; i < toolSkills.length; i++) {
        const skill = toolSkills[i];
        if (showLoading) {
          setStatusProgress({ current: i + 1, total: skillIds.length, currentSkill: skill.name });
        }
        mockStatuses[skill.id] = getMockStatus(skill);
        // 模拟检测延迟
        await new Promise((r) => setTimeout(r, 10));
      }
      setSkillStatuses(mockStatuses);
    }
    
    if (showLoading) {
      setStatusProgress(null);
      setStatusLoading(false);
    }
  }, [toolSkills, getMockStatus]);

  // 组件加载时获取状态和已安装列表
  useEffect(() => {
    loadStatuses();
    loadInstalledSkills();
  }, [loadStatuses]);

  // 从文件系统加载已安装的技能
  const loadInstalledSkills = useCallback(async () => {
    if (window.electronAPI?.skill?.getInstalled) {
      try {
        const installed = await window.electronAPI.skill.getInstalled();
        setInstalledSkills(new Set(installed));
      } catch (error) {
        console.error('加载已安装技能失败:', error);
      }
    }
  }, []);

  // 安装技能
  const handleInstall = useCallback(async (id: string) => {
    const showSuccessAnimation = () => {
      setRecentlyInstalled((prev) => new Set([...prev, id]));
      // 1秒后移除动画类
      setTimeout(() => {
        setRecentlyInstalled((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 1000);
    };

    if (window.electronAPI?.skill) {
      try {
        const success = await window.electronAPI.skill.install(id);
        if (success) {
          // 重新从文件系统加载已安装列表
          await loadInstalledSkills();
          await loadStatuses(false); // 静默刷新，不显示骨架屏
          showSuccessAnimation();
          message.success('安装成功');
        } else {
          message.error('安装失败');
        }
      } catch (error) {
        console.error('安装失败:', error);
        message.error('安装失败');
      }
    } else {
      // Web 模式: 仅更新本地状态
      setInstalledSkills((prev) => new Set([...prev, id]));
      showSuccessAnimation();
      message.success('安装成功');
    }
  }, [loadInstalledSkills, loadStatuses]);

  // 卸载技能
  const handleUninstall = useCallback(async (id: string) => {
    if (window.electronAPI?.skill) {
      try {
        await window.electronAPI.skill.uninstall(id);
        // 重新从文件系统加载已安装列表
        await loadInstalledSkills();
        message.success('已卸载');
      } catch (error) {
        console.error('卸载失败:', error);
        message.error('卸载失败');
      }
    } else {
      // Web 模式: 仅更新本地状态
      setInstalledSkills((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      message.success('已卸载');
    }
  }, [loadInstalledSkills]);

  // 打开配置弹窗
  const handleConfigure = useCallback(async (id: string) => {
    setConfigSkillId(id);
    setConfigModalOpen(true);

    const statusInfo = skillStatuses[id];
    
    // 从 missingEnv 生成配置字段的辅助函数
    const fieldsFromMissingEnv = (missingEnv: string[]) => missingEnv.map((env) => ({
      key: env,
      label: env.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      type: (env.toLowerCase().includes('key') || env.toLowerCase().includes('secret') ? 'password' : 'text') as 'text' | 'password',
      required: true,
      placeholder: `输入 ${env}`,
    }));

    // 加载配置字段 (优先级: statusInfo.configFields > IPC getConfigFields > missingEnv)
    if (window.electronAPI?.skill) {
      try {
        // 优先使用 statusInfo 中的 configFields (来自 skill.json 的 config 字段)
        if (statusInfo?.configFields && statusInfo.configFields.length > 0) {
          setConfigFields(statusInfo.configFields);
        } else {
          // 回退到 IPC 获取
          const fields = await window.electronAPI.skill.getConfigFields(id);
          if (fields && fields.length > 0) {
            setConfigFields(fields);
          } else if (statusInfo?.missingEnv) {
            // 最后回退到 missingEnv
            setConfigFields(fieldsFromMissingEnv(statusInfo.missingEnv));
          }
        }

        // 加载已有配置
        const savedConfig = await window.electronAPI.skill.getConfig(id);
        if (savedConfig?.values) {
          form.setFieldsValue(savedConfig.values);
        }
      } catch (error) {
        console.error('加载配置字段失败:', error);
        // 使用默认字段
        if (statusInfo?.configFields && statusInfo.configFields.length > 0) {
          setConfigFields(statusInfo.configFields);
        } else if (statusInfo?.missingEnv) {
          setConfigFields(fieldsFromMissingEnv(statusInfo.missingEnv));
        }
      }
    } else {
      // 非 Electron 环境，使用 mock 数据
      if (statusInfo?.configFields && statusInfo.configFields.length > 0) {
        setConfigFields(statusInfo.configFields);
      } else if (statusInfo?.missingEnv) {
        setConfigFields(fieldsFromMissingEnv(statusInfo.missingEnv));
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
        await loadStatuses(false); // 静默刷新
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

  // 推荐技能列表 (优先显示官方认证 + 未安装的)
  const recommendedSkills = useMemo(() => {
    return toolSkills
      .filter((s) => s.verified && !installedSkills.has(s.id))
      .slice(0, 6);
  }, [toolSkills, installedSkills]);

  // 热门搜索词
  const hotSearchTerms = useMemo(() => {
    // 从技能标签中提取热门词
    const tagCounts: Record<string, number> = {};
    toolSkills.forEach((s) => {
      s.tags.forEach((tag) => {
        if (!['tool', 'channel', 'provider', 'memory', 'automation'].includes(tag.toLowerCase())) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    });
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [toolSkills]);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    let skills = toolSkills;

    // 按分类过滤
    if (activeCategory !== 'all') {
      skills = skills.filter((s) => s.category === activeCategory);
    }

    // 按状态过滤
    if (statusFilter !== 'all') {
      skills = skills.filter((s) => {
        const isInstalled = installedSkills.has(s.id);
        const status = skillStatuses[s.id]?.status;
        const needsAction = status === 'needs_config' || status === 'needs_deps' || status === 'needs_auth';

        if (statusFilter === 'installed') return isInstalled;
        if (statusFilter === 'not_installed') return !isInstalled;
        if (statusFilter === 'needs_action') return isInstalled && needsAction;
        return true;
      });
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
  }, [searchText, activeCategory, statusFilter, toolSkills, installedSkills, skillStatuses]);

  // 相似推荐 (搜索无结果时)
  const similarSkills = useMemo(() => {
    if (!searchText.trim() || filteredSkills.length > 0) return [];
    const query = searchText.toLowerCase();
    // 模糊匹配：找包含部分关键词的技能
    return toolSkills
      .filter((s) => {
        const name = s.name.toLowerCase();
        const desc = s.description.toLowerCase();
        // 检查是否有部分匹配
        return query.split('').some((char) => name.includes(char)) ||
          query.split(' ').some((word) => word.length > 1 && (name.includes(word) || desc.includes(word)));
      })
      .slice(0, 4);
  }, [searchText, filteredSkills, toolSkills]);

  // 统计各状态数量
  const statusCounts = useMemo(() => {
    let installed = 0;
    let notInstalled = 0;
    let needsAction = 0;

    toolSkills.forEach((s) => {
      const isInstalled = installedSkills.has(s.id);
      const status = skillStatuses[s.id]?.status;

      if (isInstalled) {
        installed++;
        if (status === 'needs_config' || status === 'needs_deps' || status === 'needs_auth') {
          needsAction++;
        }
      } else {
        notInstalled++;
      }
    });

    return { installed, notInstalled, needsAction };
  }, [toolSkills, installedSkills, skillStatuses]);

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
        label: (
          <span>
            {categoryIcons[cat.id]} {cat.label} ({categoryCounts[cat.id]})
          </span>
        ),
      })),
    { 
      key: 'builtin', 
      label: (
        <span style={{ color: '#52c41a' }}>
          <CheckCircleFilled /> 内置功能 ({CORE_BUILTIN_FEATURES.length})
        </span>
      ),
    },
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

      {/* 检测进度提示 */}
      {statusLoading && statusProgress && (
        <Alert
          type="info"
          showIcon
          icon={<LoadingOutlined />}
          message={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>正在检测技能状态...</span>
              <Progress 
                percent={Math.round((statusProgress.current / statusProgress.total) * 100)} 
                size="small" 
                style={{ width: 120, margin: 0 }}
                strokeColor="#1890ff"
              />
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                {statusProgress.current}/{statusProgress.total}
              </span>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 搜索框 - 更突出 */}
      <div style={{ marginBottom: 20 }}>
        <Input
          placeholder="搜索技能、功能或关键词..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ maxWidth: 400, height: 40, borderRadius: 8 }}
          allowClear
          size="large"
        />
        {/* 热门搜索 */}
        {!searchText && hotSearchTerms.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>热门:</Text>
            {hotSearchTerms.map((term) => (
              <Tag
                key={term}
                style={{ cursor: 'pointer', margin: 0, borderRadius: 4 }}
                onClick={() => setSearchText(term)}
              >
                {term}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* 推荐技能区域 */}
      {!searchText && recommendedSkills.length > 0 && !statusLoading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FireOutlined style={{ color: '#ff6b6b', fontSize: 16 }} />
            <Text strong style={{ fontSize: 15 }}>推荐技能</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>— 官方认证，开箱即用</Text>
          </div>
          <div style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
            scrollSnapType: 'x mandatory',
          }}>
            {recommendedSkills.map((skill) => (
              <Card
                key={skill.id}
                size="small"
                hoverable
                style={{
                  minWidth: 200,
                  maxWidth: 200,
                  borderRadius: 10,
                  scrollSnapAlign: 'start',
                  cursor: 'pointer',
                  border: '1px solid var(--border, #f0f0f0)',
                }}
                styles={{ body: { padding: 12 } }}
                onClick={() => handleInstall(skill.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 24 }}>{skill.icon || '📦'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{skill.name}</Text>
                      <CheckCircleFilled style={{ color: '#1890ff', fontSize: 10 }} />
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                      {skill.description.slice(0, 30)}...
                    </Text>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstall(skill.id);
                    }}
                    style={{ flexShrink: 0 }}
                  />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 筛选区域 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        {/* 分类 Tab */}
        <Tabs
          activeKey={activeCategory}
          onChange={setActiveCategory}
          items={tabItems}
          size="small"
          style={{ marginBottom: 0 }}
        />

        {/* 状态筛选 */}
        <Segmented
          size="small"
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          options={[
            { label: '全部', value: 'all' },
            {
              label: (
                <span>
                  已安装 {statusCounts.installed > 0 && <Badge count={statusCounts.installed} size="small" style={{ marginLeft: 4 }} />}
                </span>
              ),
              value: 'installed',
            },
            { label: '未安装', value: 'not_installed' },
            {
              label: (
                <span style={{ color: statusCounts.needsAction > 0 ? '#faad14' : undefined }}>
                  需操作 {statusCounts.needsAction > 0 && <Badge count={statusCounts.needsAction} size="small" style={{ marginLeft: 4, backgroundColor: '#faad14' }} />}
                </span>
              ),
              value: 'needs_action',
              disabled: statusCounts.needsAction === 0,
            },
          ]}
        />
      </div>

      {/* 技能列表 - 使用 CSS Grid 自适应布局 */}
      {activeCategory === 'builtin' ? (
        // 内置工具列表
        <div>
          <Alert
            type="info"
            showIcon
            icon={<CheckCircleFilled style={{ color: '#52c41a' }} />}
            message="这些工具直接内置在源码中，不需要安装，直接可用。渠道和模型提供商请在“全部”分类中查看并配置。"
            style={{ marginBottom: 16 }}
          />
          
          {/* 核心工具 */}
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
            {CORE_BUILTIN_FEATURES.map((feature) => (
              <CoreFeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </div>
      ) : statusLoading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSkills.length > 0 ? (
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              installed={installedSkills.has(skill.id)}
              statusInfo={skillStatuses[skill.id]}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onConfigure={handleConfigure}
              onShowDetail={handleShowDetail}
              justInstalled={recentlyInstalled.has(skill.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          searchText={searchText}
          statusFilter={statusFilter}
          similarSkills={similarSkills}
          hotSearchTerms={hotSearchTerms}
          onClearSearch={() => setSearchText('')}
          onClearFilter={() => setStatusFilter('all')}
          onSelectTerm={setSearchText}
          onShowDetail={handleShowDetail}
          onGoToMarket={() => setMySkillsOpen(false)}
        />
      )}

      {/* 我的技能弹窗 - 分组显示 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppstoreOutlined />
            <span>我的技能</span>
            <Tag color="blue" style={{ marginLeft: 8 }}>{installedSkillList.length} 个已安装</Tag>
          </div>
        }
        open={mySkillsOpen}
        onCancel={() => setMySkillsOpen(false)}
        footer={null}
        width={640}
      >
        {installedSkillList.length > 0 ? (
          <MySkillsGroupedList
            skills={installedSkillList}
            skillStatuses={skillStatuses}
            onConfigure={handleConfigure}
            onUninstall={handleUninstall}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📦</div>
            <Text type="secondary" style={{ fontSize: 14 }}>暂无已安装的技能</Text>
            <br />
            <Button
              type="primary"
              onClick={() => setMySkillsOpen(false)}
              style={{ marginTop: 16 }}
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
        onOk={configFields.length > 0 ? handleSaveConfig : undefined}
        confirmLoading={configSaving}
        okText="保存"
        cancelText="取消"
        footer={configFields.length === 0 ? (
          <Button onClick={() => setConfigModalOpen(false)}>关闭</Button>
        ) : undefined}
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
                label={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{field.label}</span>
                    {field.helpUrl && (
                      <Tooltip title="点击查看如何获取">
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openUrl(field.helpUrl!);
                          }}
                          style={{ color: '#1890ff', fontSize: 12 }}
                        >
                          <QuestionCircleOutlined /> 获取方法
                        </a>
                      </Tooltip>
                    )}
                  </div>
                }
                rules={field.required ? [{ required: true, message: `请输入 ${field.label}` }] : []}
                extra={field.description && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    💡 {field.description}
                  </Text>
                )}
              >
                <Input.Password
                  placeholder={field.placeholder}
                  visibilityToggle
                />
              </Form.Item>
            ))}
            <Divider style={{ margin: '16px 0' }} />
            <div style={{ 
              background: '#f6ffed', 
              border: '1px solid #b7eb8f', 
              borderRadius: 6, 
              padding: 12,
            }}>
              <Text style={{ fontSize: 12, color: '#52c41a' }}>
                <CheckCircleFilled style={{ marginRight: 6 }} />
                配置安全存储在本地 ~/.openclaw/openclaw.json，不会上传到云端
              </Text>
            </div>
          </Form>
        ) : (
          <div style={{ padding: '24px 0' }}>
            {/* 配置驱动检测架构 (checksInfo) */}
            {configSkillId && skillStatuses[configSkillId]?.checksInfo && (
              // 检查是否有带 input 字段的检测项
              skillStatuses[configSkillId].checksInfo!.results?.some((r: { input?: { key: string } }) => r.input) ||
              !skillStatuses[configSkillId].checksInfo!.allPassed
            ) ? (
              (() => {
                const currentStatus = skillStatuses[configSkillId];
                const checksInfo = currentStatus?.checksInfo;
                const auth = currentStatus?.auth;
                const failedResult = checksInfo?.results?.find((r: { passed: boolean; skipped?: boolean }) => !r.passed && !r.skipped);
                const tutorial = auth?.tutorial || failedResult?.result?.tutorial;
                const tutorialSteps = tutorial?.steps || [];
                const tutorialTips = tutorial?.tips || [];
                const helpUrl = auth?.helpUrl || tutorial?.helpUrl;
                const allPassed = checksInfo?.allPassed;

                return (
                  <>
                    {/* 根据状态显示不同的提示信息 */}
                    {!allPassed && (
                      <div style={{ marginBottom: 16, color: '#faad14' }}>
                        <WarningOutlined style={{ marginRight: 8 }} />
                        {currentStatus?.status === 'needs_auth' ? '此技能需要登录认证才能使用' :
                         currentStatus?.status === 'needs_config' ? '此技能需要完成配置才能使用' :
                         '此技能需要安装依赖才能使用'}
                      </div>
                    )}
                    {allPassed && (
                      <div style={{ marginBottom: 16, color: '#52c41a' }}>
                        <CheckCircleFilled style={{ marginRight: 8 }} />
                        技能已就绪，可修改配置
                      </div>
                    )}

                    {/* 显示检测结果列表 + 输入框 */}
                    {checksInfo?.results && checksInfo.results.length > 0 && (
                      <Form form={form} layout="vertical" style={{ marginBottom: 16 }}>
                        {checksInfo.results.map((item: { 
                          id: string; 
                          label: string; 
                          description?: string; 
                          passed: boolean; 
                          skipped?: boolean; 
                          result?: { message?: string; tutorial?: { title?: string; steps?: string[]; tips?: string[]; helpUrl?: string } };
                          input?: { key: string; type: 'text' | 'password' | 'url' | 'number'; placeholder?: string };
                          help?: { description?: string; url?: string };
                        }) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '12px 16px',
                              background: item.passed ? '#f6ffed' : item.skipped ? '#fafafa' : '#fff2f0',
                              border: `1px solid ${item.passed ? '#b7eb8f' : item.skipped ? '#d9d9d9' : '#ffccc7'}`,
                              borderRadius: 6,
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                              <span style={{ marginRight: 8, fontSize: 16 }}>
                                {item.passed ? (
                                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                                ) : item.skipped ? (
                                  <ExclamationCircleOutlined style={{ color: '#999' }} />
                                ) : (
                                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                )}
                              </span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {item.label}
                                  {item.skipped && <Text type="secondary" style={{ fontSize: 12 }}>(依赖未满足，跳过)</Text>}
                                  {item.help?.url && (
                                    <a
                                      href="#"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openUrl(item.help!.url!);
                                      }}
                                      style={{ color: '#1890ff', fontSize: 12 }}
                                    >
                                      <QuestionCircleOutlined /> 获取方法
                                    </a>
                                  )}
                                </div>
                                {item.help?.description && (
                                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{item.help.description}</div>
                                )}
                                {!item.passed && !item.skipped && item.result?.message && (
                                  <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>
                                    {item.result.message}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* 有 input 字段时显示输入框（未通过时必填，已通过时可修改） */}
                            {!item.skipped && item.input && (
                              <Form.Item
                                name={item.input.key}
                                style={{ marginTop: 12, marginBottom: 0 }}
                                rules={!item.passed ? [{ required: true, message: `请输入 ${item.label}` }] : []}
                                extra={item.passed && (
                                  <Text type="secondary" style={{ fontSize: 11 }}>已配置，留空保持不变</Text>
                                )}
                              >
                                {item.input.type === 'password' ? (
                                  <Input.Password
                                    placeholder={item.input.placeholder || `请输入 ${item.label}`}
                                    visibilityToggle
                                  />
                                ) : item.input.type === 'number' ? (
                                  <Input
                                    type="number"
                                    placeholder={item.input.placeholder || `请输入 ${item.label}`}
                                  />
                                ) : (
                                  <Input
                                    placeholder={item.input.placeholder || `请输入 ${item.label}`}
                                  />
                                )}
                              </Form.Item>
                            )}
                          </div>
                        ))}
                      </Form>
                    )}

                    {/* 显示 tutorial 信息 */}
                    {tutorial && (
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message={tutorial.title || '操作指引'}
                        description={
                          <div style={{ marginTop: 8 }}>
                            {tutorialSteps.length > 0 && (
                              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                                {tutorialSteps.map((step: string, i: number) => (
                                  <li key={i} style={{ marginBottom: 4, fontSize: 13 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                            {tutorialTips.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                {tutorialTips.map((tip: string, i: number) => (
                                  <div key={i} style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                                    💡 {tip}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        }
                      />
                    )}

                    {/* 帮助链接 */}
                    {helpUrl && (
                      <div style={{ marginBottom: 16 }}>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openUrl(helpUrl);
                          }}
                          style={{ color: '#1890ff' }}
                        >
                          <QuestionCircleOutlined style={{ marginRight: 4 }} />
                          查看帮助文档
                        </a>
                      </div>
                    )}

                    {/* 一键安装依赖按钮（新架构：通过 check 结果中的 action 字段调用 action 脚本） */}
                    {!allPassed && failedResult?.result?.action && !isInstalling && !installFailed && (
                      <div style={{ marginBottom: 16 }}>
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          loading={configSaving}
                          onClick={async () => {
                            const actionId = failedResult?.result?.action;
                            if (!actionId || !configSkillId) return;
                            
                            setInstallLogs([]);
                            setIsInstalling(true);
                            setInstallFailed(false);
                            setConfigSaving(true);
                            
                            // 添加开始日志
                            setInstallLogs([{ message: `正在执行 action: ${actionId}...`, type: 'info', timestamp: Date.now() }]);
                            
                            try {
                              if (window.electronAPI?.skill?.runAction) {
                                const result = await window.electronAPI.skill.runAction(configSkillId, actionId);
                                if (result.success) {
                                  setInstallLogs(prev => [...prev, { message: result.message || '安装成功！', type: 'success', timestamp: Date.now() }]);
                                  message.success(result.message || '依赖安装成功！');
                                  // 重新检测状态
                                  await loadStatuses(false);
                                  setTimeout(() => {
                                    setIsInstalling(false);
                                    setInstallFailed(false);
                                    setInstallLogs([]);
                                  }, 1500);
                                } else {
                                  setInstallLogs(prev => [...prev, { message: result.message || '安装失败', type: 'error', timestamp: Date.now() }]);
                                  setInstallFailed(true);
                                  setIsInstalling(false);
                                }
                              } else {
                                setInstallLogs(prev => [...prev, { message: 'Electron API 不可用', type: 'error', timestamp: Date.now() }]);
                                setInstallFailed(true);
                                setIsInstalling(false);
                              }
                            } catch (error) {
                              console.error('执行 action 失败:', error);
                              setInstallLogs(prev => [...prev, { message: `执行失败: ${error}`, type: 'error', timestamp: Date.now() }]);
                              setInstallFailed(true);
                              setIsInstalling(false);
                            } finally {
                              setConfigSaving(false);
                            }
                          }}
                        >
                          一键安装 {failedResult?.label || '依赖'}
                        </Button>
                      </div>
                    )}

                    {/* 一键安装依赖按钮（旧架构：使用 installMethods） */}
                    {!allPassed && !failedResult?.result?.action && currentStatus?.installMethods && currentStatus.installMethods.length > 0 && !isInstalling && !installFailed && (
                      <div style={{ marginBottom: 16 }}>
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          loading={configSaving}
                          onClick={async () => {
                            const installMethods = currentStatus?.installMethods;
                            if (!installMethods || installMethods.length === 0) return;
                            
                            setInstallLogs([]);
                            setIsInstalling(true);
                            setInstallFailed(false);
                            setConfigSaving(true);
                            
                            let unsubscribe: (() => void) | undefined;
                            if (window.electronAPI?.skill?.onInstallLog) {
                              unsubscribe = window.electronAPI.skill.onInstallLog((log) => {
                                setInstallLogs(prev => [...prev, log]);
                                setTimeout(() => {
                                  if (logContainerRef.current) {
                                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                                  }
                                }, 50);
                              });
                            }
                            
                            try {
                              if (window.electronAPI?.skill?.installDeps) {
                                const result = await window.electronAPI.skill.installDeps(installMethods);
                                if (result.success) {
                                  message.success('依赖安装成功！');
                                  await loadStatuses(false);
                                  setTimeout(() => {
                                    setConfigModalOpen(false);
                                    setIsInstalling(false);
                                    setInstallFailed(false);
                                    setInstallLogs([]);
                                  }, 1500);
                                } else {
                                  setInstallFailed(true);
                                  setIsInstalling(false);
                                }
                              } else {
                                setInstallFailed(true);
                                setIsInstalling(false);
                              }
                            } catch (error) {
                              console.error('安装依赖失败:', error);
                              setInstallFailed(true);
                              setIsInstalling(false);
                            } finally {
                              setConfigSaving(false);
                              unsubscribe?.();
                            }
                          }}
                        >
                          一键安装依赖
                        </Button>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
                          使用 {currentStatus.installMethods[0].kind} 安装
                        </Text>
                      </div>
                    )}

                    {/* 安装日志终端（checksInfo 架构） */}
                    {(isInstalling || installFailed) && currentStatus?.installMethods && (
                      <>
                        <div
                          ref={logContainerRef}
                          style={{
                            background: '#1e1e1e',
                            color: '#d4d4d4',
                            padding: 12,
                            borderRadius: 8,
                            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                            fontSize: 12,
                            lineHeight: 1.6,
                            maxHeight: 250,
                            overflowY: 'auto',
                            marginBottom: 16,
                          }}
                        >
                          {installLogs.length === 0 ? (
                            <div style={{ color: '#888' }}>正在初始化...</div>
                          ) : (
                            installLogs.map((log, i) => (
                              <div
                                key={i}
                                style={{
                                  color: log.type === 'error' ? '#f14c4c' 
                                       : log.type === 'success' ? '#89d185' 
                                       : log.message.startsWith('$') ? '#569cd6' 
                                       : '#d4d4d4',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {log.message}
                              </div>
                            ))
                          )}
                          {configSaving && (
                            <div style={{ color: '#888', marginTop: 4 }}>
                              <LoadingOutlined style={{ marginRight: 8 }} />
                              正在执行...
                            </div>
                          )}
                        </div>
                        
                        {installFailed && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ 
                              background: '#fff2f0', 
                              border: '1px solid #ffccc7', 
                              borderRadius: 6, 
                              padding: 12,
                              marginBottom: 12,
                            }}>
                              <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
                                <CloseCircleOutlined style={{ marginRight: 6 }} />
                                自动安装失败，请在终端手动执行以下命令：
                              </Text>
                            </div>
                            <div style={{ 
                              background: '#f5f5f5', 
                              padding: 12, 
                              borderRadius: 6,
                              fontFamily: 'Monaco, Menlo, monospace',
                              fontSize: 13,
                            }}>
                              {(() => {
                                const m = currentStatus.installMethods![0];
                                const pkg = m.package || m.formula || m.module || m.id;
                                switch (m.kind) {
                                  case 'uv': return <code>uv tool install {pkg}</code>;
                                  case 'pip': return <code>pip install {pkg}</code>;
                                  case 'brew': return <code>brew install {m.formula || pkg}</code>;
                                  case 'go': return <code>go install {m.module || pkg}</code>;
                                  case 'npm': return <code>npm install -g {pkg}</code>;
                                  default: return <code># 请手动安装 {pkg}</code>;
                                }
                              })()}
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                              <Button 
                                size="small"
                                onClick={() => {
                                  setInstallFailed(false);
                                  setInstallLogs([]);
                                }}
                              >
                                重试
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* 保存配置和重新检测按钮 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {/* 如果有任何带 input 的检测项，显示保存按钮 */}
                      {checksInfo?.results?.some((r: { skipped?: boolean; input?: { key: string } }) => 
                        !r.skipped && r.input
                      ) && (
                        <Button
                          type="primary"
                          onClick={async () => {
                            try {
                              const values = await form.validateFields();
                              setConfigSaving(true);
                              
                              if (window.electronAPI?.skill && configSkillId) {
                                // 过滤空值（已通过的检测项如果留空则不更新）
                                const filteredValues = Object.fromEntries(
                                  Object.entries(values).filter(([, v]) => v !== undefined && v !== '')
                                );
                                if (Object.keys(filteredValues).length > 0) {
                                  await window.electronAPI.skill.saveConfig(configSkillId, filteredValues);
                                  message.success('配置已保存');
                                } else {
                                  message.info('未填写任何配置');
                                }
                                // 重新检测状态 (静默刷新)
                                await loadStatuses(false);
                                // 检查是否全部通过
                                const newStatus = skillStatuses[configSkillId];
                                if (newStatus?.checksInfo?.allPassed || newStatus?.status === 'ready') {
                                  setConfigModalOpen(false);
                                  form.resetFields();
                                }
                              }
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
                          }}
                          loading={configSaving}
                        >
                          保存配置
                        </Button>
                      )}
                      {!allPassed && (
                        <Button
                          icon={<ExclamationCircleOutlined />}
                          onClick={async () => {
                            setConfigSaving(true);
                            await loadStatuses(false); // 静默刷新
                            setConfigSaving(false);
                          }}
                          loading={configSaving}
                        >
                          重新检测
                        </Button>
                      )}
                    </div>
                  </>
                );
              })()
            ) : configSkillId && skillStatuses[configSkillId]?.missingBins?.length ? (
              /* 旧架构 (missingBins) - 向后兼容 */
              <>
                <div style={{ marginBottom: 16, color: '#faad14' }}>
                  <WarningOutlined style={{ marginRight: 8 }} />
                  此技能需要安装以下依赖才能使用：
                </div>
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                  {skillStatuses[configSkillId].missingBins?.map((bin) => (
                    <Tag key={bin} color="orange" style={{ marginBottom: 4, fontSize: 13 }}>
                      {bin}
                    </Tag>
                  ))}
                </div>

                {/* 一键安装按钮 */}
                {!isInstalling && !installFailed && (
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      loading={configSaving}
                      onClick={async () => {
                        const statusInfo = skillStatuses[configSkillId];
                        // 优先使用 installMethods（配置驱动），否则回退到 bins
                        const installMethods = statusInfo?.installMethods;
                        const bins = statusInfo?.missingBins;
                        
                        if ((!installMethods || installMethods.length === 0) && (!bins || bins.length === 0)) {
                          return;
                        }
                        
                        // 清空日志，开始安装
                        setInstallLogs([]);
                        setIsInstalling(true);
                        setInstallFailed(false);
                        setConfigSaving(true);
                        
                        // 注册日志监听
                        let unsubscribe: (() => void) | undefined;
                        if (window.electronAPI?.skill?.onInstallLog) {
                          unsubscribe = window.electronAPI.skill.onInstallLog((log) => {
                            setInstallLogs(prev => [...prev, log]);
                            // 滚动到底部
                            setTimeout(() => {
                              if (logContainerRef.current) {
                                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                              }
                            }, 50);
                          });
                        }
                        
                        try {
                          if (window.electronAPI?.skill?.installDeps) {
                            // 传入 installMethods 或回退到 bins
                            const installArg = (installMethods && installMethods.length > 0) ? installMethods : (bins || []);
                            const result = await window.electronAPI.skill.installDeps(installArg);
                            if (result.success) {
                              message.success('依赖安装成功！');
                              // 重新加载状态 (静默刷新)
                              await loadStatuses(false);
                              // 延迟关闭弹窗，让用户看到成功日志
                              setTimeout(() => {
                                setConfigModalOpen(false);
                                setIsInstalling(false);
                                setInstallFailed(false);
                                setInstallLogs([]);
                              }, 1500);
                            } else {
                              // 安装失败，保留日志
                              setInstallFailed(true);
                              setIsInstalling(false);
                            }
                          } else {
                            // Web 模式：显示手动安装命令
                            setInstallFailed(true);
                            setIsInstalling(false);
                          }
                        } catch (error) {
                          console.error('安装依赖失败:', error);
                          setInstallFailed(true);
                          setIsInstalling(false);
                        } finally {
                          setConfigSaving(false);
                          unsubscribe?.();
                        }
                      }}
                    >
                      一键安装依赖
                    </Button>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
                      {skillStatuses[configSkillId]?.installMethods?.length 
                        ? `使用 ${skillStatuses[configSkillId].installMethods![0].kind} 安装`
                        : '将自动检测并使用系统包管理器'}
                    </Text>
                  </div>
                )}
                
                {/* 安装日志终端 */}
                {(isInstalling || installFailed) && (
                  <>
                    <div
                      ref={logContainerRef}
                      style={{
                        background: '#1e1e1e',
                        color: '#d4d4d4',
                        padding: 12,
                        borderRadius: 8,
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        fontSize: 12,
                        lineHeight: 1.6,
                        maxHeight: 250,
                        overflowY: 'auto',
                        marginTop: 16,
                      }}
                    >
                      {installLogs.length === 0 ? (
                        <div style={{ color: '#888' }}>正在初始化...</div>
                      ) : (
                        installLogs.map((log, i) => (
                          <div
                            key={i}
                            style={{
                              color: log.type === 'error' ? '#f14c4c' 
                                   : log.type === 'success' ? '#89d185' 
                                   : log.message.startsWith('$') ? '#569cd6' 
                                   : '#d4d4d4',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}
                          >
                            {log.message}
                          </div>
                        ))
                      )}
                      {configSaving && (
                        <div style={{ color: '#888', marginTop: 4 }}>
                          <LoadingOutlined style={{ marginRight: 8 }} />
                          正在执行...
                        </div>
                      )}
                    </div>
                    
                    {/* 安装失败后显示手动安装命令 */}
                    {installFailed && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ 
                          background: '#fff2f0', 
                          border: '1px solid #ffccc7', 
                          borderRadius: 6, 
                          padding: 12,
                          marginBottom: 12,
                        }}>
                          <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
                            <CloseCircleOutlined style={{ marginRight: 6 }} />
                            自动安装失败，请在终端手动执行以下命令：
                          </Text>
                        </div>
                        <div style={{ 
                          background: '#f5f5f5', 
                          padding: 12, 
                          borderRadius: 6,
                          fontFamily: 'Monaco, Menlo, monospace',
                          fontSize: 13,
                        }}>
                          {/* 根据 installMethods 显示正确的手动安装命令 */}
                          {(() => {
                            const methods = skillStatuses[configSkillId]?.installMethods;
                            if (methods && methods.length > 0) {
                              const m = methods[0];
                              const pkg = m.package || m.formula || m.module || m.id;
                              switch (m.kind) {
                                case 'uv': return <code>uv tool install {pkg}</code>;
                                case 'pip': return <code>pip install {pkg}</code>;
                                case 'brew': return <code>brew install {m.formula || pkg}</code>;
                                case 'apt': return <code>sudo apt-get install {pkg}</code>;
                                case 'yum': return <code>sudo yum install {pkg}</code>;
                                case 'dnf': return <code>sudo dnf install {pkg}</code>;
                                case 'go': return <code>go install {m.module || pkg}</code>;
                                case 'npm': return <code>npm install -g {pkg}</code>;
                                case 'npx': return <code>npx {pkg}</code>;
                                case 'cargo': return <code>cargo install {pkg}</code>;
                                case 'winget': return <code>winget install {pkg}</code>;
                                case 'choco': return <code>choco install {pkg}</code>;
                                case 'scoop': return <code>scoop install {pkg}</code>;
                                default: return <code># 请手动安装 {pkg}</code>;
                              }
                            }
                            // 回退到旧的 bins 显示
                            const bins = skillStatuses[configSkillId]?.missingBins;
                            return <code># 请手动安装: {bins?.join(', ') || '(未知依赖)'}</code>;
                          })()}
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <Button 
                            size="small"
                            onClick={() => {
                              setInstallFailed(false);
                              setInstallLogs([]);
                            }}
                          >
                            重试
                          </Button>
                          <Button 
                            size="small"
                            type="primary"
                            onClick={() => {
                              setConfigModalOpen(false);
                              setInstallFailed(false);
                              setInstallLogs([]);
                            }}
                          >
                            关闭
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : configSkillId && skillStatuses[configSkillId]?.status === 'needs_auth' ? (
              /* 需要登录认证 */
              <>
                <div style={{ marginBottom: 16, color: '#faad14' }}>
                  <KeyOutlined style={{ marginRight: 8 }} />
                  此技能需要登录认证才能使用
                </div>
                <Alert
                  type="warning"
                  showIcon
                  message={skillStatuses[configSkillId]?.auth?.message || '需要登录'}
                  description={
                    <div style={{ marginTop: 8 }}>
                      <Text>请在终端执行以下命令完成登录：</Text>
                      <div style={{ 
                        background: '#f5f5f5', 
                        padding: 12, 
                        borderRadius: 6,
                        fontFamily: 'Monaco, Menlo, monospace',
                        fontSize: 13,
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <code>{skillStatuses[configSkillId]?.auth?.action || '(未配置登录命令)'}</code>
                        <Tooltip title="复制命令">
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => {
                              navigator.clipboard.writeText(skillStatuses[configSkillId]?.auth?.action || '');
                              message.success('已复制到剪贴板');
                            }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  }
                  style={{ marginBottom: 16 }}
                />
                {skillStatuses[configSkillId]?.auth?.helpUrl && (
                  <div style={{ marginBottom: 16 }}>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        openUrl(skillStatuses[configSkillId]?.auth?.helpUrl!);
                      }}
                      style={{ color: '#1890ff' }}
                    >
                      <QuestionCircleOutlined style={{ marginRight: 4 }} />
                      查看登录帮助文档
                    </a>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="primary"
                    icon={<KeyOutlined />}
                    onClick={async () => {
                      const authAction = skillStatuses[configSkillId]?.auth?.action;
                      if (!authAction) {
                        message.error('未找到登录命令');
                        return;
                      }
                      
                      // 在系统终端中执行登录命令
                      if (window.electronAPI?.skill?.runAuthCommand) {
                        const result = await window.electronAPI.skill.runAuthCommand(authAction);
                        if (result.success) {
                          message.info('已在终端中打开，请完成登录后点击“重新检测”');
                        } else {
                          message.error(result.error || '打开终端失败');
                        }
                      } else {
                        // 非 Electron 环境，复制到剪贴板
                        navigator.clipboard.writeText(authAction);
                        message.success('命令已复制，请在终端中执行');
                      }
                    }}
                  >
                    在终端中登录
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!configSkillId) return;
                      
                      // 直接从 IPC 获取最新状态（避免 React state 异步更新问题）
                      if (window.electronAPI?.skill?.getStatus) {
                        const newStatus = await window.electronAPI.skill.getStatus(configSkillId);
                        
                        if (newStatus?.status === 'ready' || newStatus?.status === 'active') {
                          message.success('登录成功！');
                          setConfigModalOpen(false);
                          // 后台刷新全部状态 (静默刷新)
                          loadStatuses(false);
                        } else {
                          message.info('请先在终端完成登录');
                        }
                      } else {
                        // Web 模式
                        await loadStatuses(false); // 静默刷新
                        setConfigModalOpen(false);
                      }
                    }}
                  >
                    重新检测
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary">此技能无需配置</Text>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 技能详情抽屉 */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>{detailSkill?.icon || '📦'}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text strong style={{ fontSize: 18 }}>{detailSkill?.name}</Text>
                {detailSkill?.verified && <CheckCircleFilled style={{ color: '#1890ff', fontSize: 14 }} />}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>v{detailSkill?.version}</Text>
            </div>
          </div>
        }
        placement="right"
        width={420}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        extra={
          detailSkill && !installedSkills.has(detailSkill.id) ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                handleInstall(detailSkill.id);
                setDetailDrawerOpen(false);
              }}
            >
              安装
            </Button>
          ) : detailSkill && (skillStatuses[detailSkill.id]?.status === 'ready' || skillStatuses[detailSkill.id]?.status === 'active') ? (
            <Tag color="success" icon={<CheckCircleFilled />}>已安装</Tag>
          ) : null
        }
      >
        {detailSkill && (
          <div>
            {/* 描述 */}
            <Paragraph style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              {detailSkill.description}
            </Paragraph>

            {/* 状态提示 */}
            {installedSkills.has(detailSkill.id) && skillStatuses[detailSkill.id] && (
              (() => {
                const status = skillStatuses[detailSkill.id].status;
                if (status === 'needs_config') {
                  return (
                    <Alert
                      type="warning"
                      message="需要配置"
                      description={`缺少配置: ${skillStatuses[detailSkill.id].missingEnv?.join(', ')}`}
                      action={
                        <Button size="small" onClick={() => { setDetailDrawerOpen(false); handleConfigure(detailSkill.id); }}>
                          配置
                        </Button>
                      }
                      style={{ marginBottom: 24 }}
                    />
                  );
                }
                if (status === 'needs_deps') {
                  return (
                    <Alert
                      type="warning"
                      message="需要安装依赖"
                      description={`缺少: ${skillStatuses[detailSkill.id].missingBins?.join(', ')}`}
                      action={
                        <Button size="small" onClick={() => { setDetailDrawerOpen(false); handleConfigure(detailSkill.id); }}>
                          安装
                        </Button>
                      }
                      style={{ marginBottom: 24 }}
                    />
                  );
                }
                if (status === 'needs_auth') {
                  return (
                    <Alert
                      type="warning"
                      message="需要登录"
                      description={skillStatuses[detailSkill.id].auth?.message || '需要登录认证'}
                      action={
                        <Button size="small" onClick={() => { setDetailDrawerOpen(false); handleConfigure(detailSkill.id); }}>
                          登录
                        </Button>
                      }
                      style={{ marginBottom: 24 }}
                    />
                  );
                }
                return null;
              })()
            )}

            {/* 能力描述 */}
            {detailSkill.capabilities && detailSkill.capabilities.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>功能</Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detailSkill.capabilities.map((cap, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--primary, #1890ff)',
                        flexShrink: 0,
                      }} />
                      <Text style={{ fontSize: 13 }}>
                        {cap.type === 'tool' && `提供工具: ${cap.names.join(', ')}`}
                        {cap.type === 'channel' && `消息渠道: ${cap.id}`}
                        {cap.type === 'provider' && `模型提供: ${cap.id}`}
                        {cap.type === 'hook' && `事件钩子: ${cap.events.join(', ')}`}
                        {cap.type === 'command' && `命令: ${cap.names.join(', ')}`}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 标签 */}
            <div style={{ marginBottom: 24 }}>
              <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>标签</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {detailSkill.tags.map((tag) => (
                  <Tag key={tag} color="blue" style={{ margin: 0 }}>{tag}</Tag>
                ))}
              </div>
            </div>

            {/* 详细说明 */}
            {detailSkill.longDescription && (
              <div style={{ marginBottom: 24 }}>
                <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>详细说明</Text>
                <Paragraph
                  type="secondary"
                  style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
                >
                  {detailSkill.longDescription.replace(/^#+\s+.+\n*/gm, '').replace(/###\s+/g, '▸ ').trim()}
                </Paragraph>
              </div>
            )}

            {/* 元信息 */}
            <Divider style={{ margin: '16px 0' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary, #666)' }}>
              <div>版本: <Text code>{detailSkill.version}</Text></div>
              <div>许可: <Text>{detailSkill.license}</Text></div>
              {detailSkill.homepage && (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); openUrl(detailSkill.homepage!); }}
                  style={{ color: 'var(--primary, #1890ff)' }}
                >
                  查看文档 <RightOutlined style={{ fontSize: 10 }} />
                </a>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
