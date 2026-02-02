import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Tag, Space, Typography, message, Spin } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  MessageOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/app';
import { getGatewayClient } from '../api/gateway';

const { Title, Text } = Typography;

const MODEL_LABELS: Record<string, string> = {
  openai: 'OpenAI (GPT-4)',
  anthropic: 'Anthropic (Claude)',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  zhipu: '智谱 GLM',
};

const CHANNEL_LABELS: Record<string, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
  wecom: '企业微信',
};

export default function Dashboard() {
  const { 
    modelConfig, 
    channelConfig, 
    gatewayStatus, 
    gatewayPort,
    setGatewayStatus,
    resetSetup,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [channelStatus, setChannelStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  // 通过 HTTP 探测 Gateway 是否运行（浏览器环境 fallback）
  // Gateway 没有专用的 /health HTTP 端点，但会返回 Control UI 页面
  // 任何响应都说明 Gateway 在运行
  const probeGatewayHealth = async (): Promise<boolean> => {
    try {
      const res = await fetch(`http://127.0.0.1:${gatewayPort}/`, {
        method: 'HEAD',
        mode: 'no-cors', // 跨域请求，不需要响应内容
        signal: AbortSignal.timeout(2000),
      });
      // no-cors 模式下，res.type 为 'opaque'，但如果没报错就说明连接成功
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // 启动时自动检查状态
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      // 优先使用 Electron API，否则 fallback 到 HTTP 健康检查
      let status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';
      
      if (window.electronAPI?.gateway) {
        status = await window.electronAPI.gateway.status() || 'stopped';
      } else {
        // 浏览器环境：通过 HTTP 健康检查
        const isRunning = await probeGatewayHealth();
        status = isRunning ? 'running' : 'stopped';
      }
      
      setGatewayStatus(status);
      
      if (status === 'running') {
        // 尝试获取渠道状态
        try {
          const client = getGatewayClient(gatewayPort);
          await client.connect();
          const channels = await client.getChannelsStatus() as { channels?: Record<string, { connected?: boolean }> };
          const channelKey = channelConfig?.type;
          if (channelKey && channels?.channels?.[channelKey]?.connected) {
            setChannelStatus('connected');
          } else {
            setChannelStatus('disconnected');
          }
        } catch {
          setChannelStatus('unknown');
        }
      }
    } catch {
      setGatewayStatus('stopped');
    }
  };

  const handleStart = async () => {
    // 浏览器环境不支持启动服务，提示用户手动启动
    if (!window.electronAPI?.gateway) {
      message.info('请在终端运行: pnpm dev 或 node openclaw.mjs gateway');
      // 等待几秒后再检查状态
      setTimeout(checkStatus, 2000);
      return;
    }
    
    setLoading(true);
    try {
      setGatewayStatus('starting');
      const success = await window.electronAPI.gateway.start();
      if (success) {
        setGatewayStatus('running');
        message.success('服务启动成功');
        // 等待一下再检查渠道状态
        setTimeout(checkStatus, 3000);
      } else {
        setGatewayStatus('error');
        message.error('服务启动失败');
      }
    } catch (error) {
      setGatewayStatus('error');
      message.error('启动失败: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    // 浏览器环境不支持停止服务
    if (!window.electronAPI?.gateway) {
      message.info('请在终端手动停止 Gateway 进程');
      return;
    }
    
    setLoading(true);
    try {
      await window.electronAPI.gateway.stop();
      setGatewayStatus('stopped');
      setChannelStatus('disconnected');
      message.success('服务已停止');
    } catch (error) {
      message.error('停止失败: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    handleStop();
    resetSetup();
  };

  const getStatusTag = () => {
    switch (gatewayStatus) {
      case 'running':
        return <Tag icon={<CheckCircleOutlined />} color="success">运行中</Tag>;
      case 'starting':
        return <Tag icon={<Spin size="small" />} color="processing">启动中</Tag>;
      case 'error':
        return <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>;
      default:
        return <Tag color="default">已停止</Tag>;
    }
  };

  const getChannelStatusTag = () => {
    if (gatewayStatus !== 'running') {
      return <Tag color="default">未连接</Tag>;
    }
    switch (channelStatus) {
      case 'connected':
        return <Tag icon={<CheckCircleOutlined />} color="success">已连接</Tag>;
      case 'disconnected':
        return <Tag icon={<CloseCircleOutlined />} color="warning">未连接</Tag>;
      default:
        return <Tag color="default">检查中...</Tag>;
    }
  };

  return (
    <div style={{ padding: 28 }} className="animate-fade-in">
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4, fontWeight: 700 }}>控制台</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>管理您的 AI 助手服务状态</Text>
        </div>
        <Space size={12}>
          <Button icon={<ReloadOutlined />} onClick={checkStatus} style={{ borderRadius: 8 }}>
            刷新状态
          </Button>
          <Button icon={<SettingOutlined />} onClick={handleReset} style={{ borderRadius: 8 }}>
            重新配置
          </Button>
        </Space>
      </div>

      {/* 服务状态卡片 */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 16,
          background: gatewayStatus === 'running'
            ? 'linear-gradient(135deg, var(--status-running-bg) 0%, rgba(34, 197, 94, 0.02) 100%)'
            : 'white',
          borderColor: gatewayStatus === 'running' ? 'var(--status-running)' : undefined,
          borderWidth: gatewayStatus === 'running' ? 1 : undefined,
        }}
      >
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <Space size={32}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>服务状态</Text>
                <div style={{ marginTop: 10 }}>{getStatusTag()}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>监听端口</Text>
                <div style={{ marginTop: 10 }}>
                  <Text strong style={{ 
                    fontSize: 16, 
                    fontFamily: 'monospace',
                    background: 'var(--bg-muted)',
                    padding: '4px 10px',
                    borderRadius: 6,
                  }}>{gatewayPort}</Text>
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            {gatewayStatus === 'running' ? (
              <Button 
                type="primary" 
                danger 
                size="large"
                icon={<PauseCircleOutlined />}
                loading={loading}
                onClick={handleStop}
                style={{ 
                  borderRadius: 10, 
                  height: 44,
                  paddingInline: 24,
                  fontWeight: 500,
                }}
              >
                停止服务
              </Button>
            ) : (
              <Button 
                type="primary" 
                size="large"
                icon={<PlayCircleOutlined />}
                loading={loading || gatewayStatus === 'starting'}
                onClick={handleStart}
                style={{ 
                  borderRadius: 10, 
                  height: 44,
                  paddingInline: 24,
                  fontWeight: 500,
                }}
              >
                启动服务
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      {/* 配置信息 */}
      <Row gutter={20}>
        <Col span={12}>
          <Card
            style={{
              borderRadius: 14,
              border: '1px solid rgba(224, 82, 82, 0.15)',
              background: 'linear-gradient(135deg, rgba(224, 82, 82, 0.04) 0%, white 100%)',
            }}
            hoverable
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <RobotOutlined style={{ fontSize: 24, color: 'white' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>AI 模型</Text>
                <div style={{ marginTop: 6 }}>
                  <Text strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                    {modelConfig?.provider ? MODEL_LABELS[modelConfig.provider] : '未配置'}
                  </Text>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>API Key: </Text>
                  <Text code style={{ 
                    background: 'rgba(0, 0, 0, 0.04)', 
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 13,
                  }}>••••••••{modelConfig?.apiKey?.slice(-4) || '****'}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            style={{
              borderRadius: 14,
              border: '1px solid rgba(20, 184, 166, 0.15)',
              background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.04) 0%, white 100%)',
            }}
            hoverable
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--secondary) 0%, #0d9488 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <MessageOutlined style={{ fontSize: 24, color: 'white' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>消息渠道</Text>
                  {getChannelStatusTag()}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Text strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                    {channelConfig?.type ? CHANNEL_LABELS[channelConfig.type] : '未配置'}
                  </Text>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {channelConfig?.type === 'dingtalk' && 'App Key: '}
                    {channelConfig?.type === 'feishu' && 'App ID: '}
                    {channelConfig?.type === 'wecom' && 'Corp ID: '}
                  </Text>
                  <Text code style={{ 
                    background: 'rgba(0, 0, 0, 0.04)', 
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 13,
                  }}>
                    ••••••••{Object.values(channelConfig?.config || {})[0]?.slice(-4) || '****'}
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 快速操作提示 */}
      {gatewayStatus === 'running' && channelStatus === 'connected' && (
        <Card
          style={{
            marginTop: 24,
            background: 'linear-gradient(135deg, var(--status-running-bg) 0%, rgba(34, 197, 94, 0.04) 100%)',
            borderColor: 'var(--status-running)',
            borderRadius: 14,
          }}
          className="animate-fade-in"
        >
          <Space align="start">
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--status-running-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CheckCircleOutlined style={{ color: 'var(--status-running)', fontSize: 22 }} />
            </div>
            <div>
              <Text strong style={{ color: 'var(--status-running)', fontSize: 15 }}>服务运行正常</Text>
              <br />
              <Text style={{ color: '#64748b', fontSize: 14, marginTop: 4, display: 'block' }}>
                您现在可以通过 <Text strong>{CHANNEL_LABELS[channelConfig?.type || '']}</Text> 与 AI 助手对话了
              </Text>
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
}
