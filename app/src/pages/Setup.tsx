import { useState } from 'react';
import { Card, Steps, Button, Form, Input, Space, Typography, message, Row, Col } from 'antd';
import { 
  RobotOutlined, 
  MessageOutlined, 
  RocketOutlined,
  CheckCircleOutlined,
  DingdingOutlined,
} from '@ant-design/icons';
import { useAppStore, ModelProvider, ChannelType } from '../stores/app';
import { getGatewayClient } from '../api/gateway';

const { Title, Text, Paragraph } = Typography;

const MODEL_PROVIDERS: { value: ModelProvider; label: string; icon: string; fields: string[] }[] = [
  { 
    value: 'openai', 
    label: 'OpenAI (GPT-4)', 
    icon: '🤖',
    fields: ['apiKey', 'baseUrl']
  },
  { 
    value: 'anthropic', 
    label: 'Anthropic (Claude)', 
    icon: '🧠',
    fields: ['apiKey']
  },
  { 
    value: 'deepseek', 
    label: 'DeepSeek', 
    icon: '🔍',
    fields: ['apiKey']
  },
  { 
    value: 'qwen', 
    label: '通义千问', 
    icon: '☁️',
    fields: ['apiKey']
  },
  { 
    value: 'zhipu', 
    label: '智谱 GLM', 
    icon: '💡',
    fields: ['apiKey']
  },
];

const CHANNELS: { value: ChannelType; label: string; icon: React.ReactNode; fields: { name: string; label: string; placeholder: string }[] }[] = [
  { 
    value: 'dingtalk', 
    label: '钉钉',
    icon: <DingdingOutlined style={{ fontSize: 24 }} />,
    fields: [
      { name: 'clientId', label: 'App Key', placeholder: '输入钉钉应用的 App Key' },
      { name: 'clientSecret', label: 'App Secret', placeholder: '输入钉钉应用的 App Secret' },
    ]
  },
  { 
    value: 'feishu', 
    label: '飞书',
    icon: <span style={{ fontSize: 24 }}>🪶</span>,
    fields: [
      { name: 'appId', label: 'App ID', placeholder: '输入飞书应用的 App ID' },
      { name: 'appSecret', label: 'App Secret', placeholder: '输入飞书应用的 App Secret' },
    ]
  },
  { 
    value: 'wecom', 
    label: '企业微信',
    icon: <span style={{ fontSize: 24 }}>💼</span>,
    fields: [
      { name: 'corpId', label: '企业 ID', placeholder: '输入企业微信的 Corp ID' },
      { name: 'agentId', label: '应用 ID', placeholder: '输入应用的 Agent ID' },
      { name: 'secret', label: '应用 Secret', placeholder: '输入应用的 Secret' },
    ]
  },
];

export default function Setup() {
  const [current, setCurrent] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [modelForm] = Form.useForm();
  const [channelForm] = Form.useForm();
  
  const { setModelConfig, setChannelConfig, completeSetup } = useAppStore();

  const steps = [
    { title: '选择模型', icon: <RobotOutlined /> },
    { title: '选择渠道', icon: <MessageOutlined /> },
    { title: '完成', icon: <RocketOutlined /> },
  ];

  const handleModelNext = async () => {
    if (!selectedProvider) {
      message.warning('请选择一个 AI 模型提供商');
      return;
    }
    
    try {
      const values = await modelForm.validateFields();
      setModelConfig({
        provider: selectedProvider,
        apiKey: values.apiKey,
        baseUrl: values.baseUrl,
      });
      setCurrent(1);
    } catch {
      // 表单验证失败
    }
  };

  const handleChannelNext = async () => {
    if (!selectedChannel) {
      message.warning('请选择一个消息渠道');
      return;
    }

    try {
      const values = await channelForm.validateFields();
      setChannelConfig({
        type: selectedChannel,
        enabled: true,
        config: values,
      });
      setCurrent(2);
    } catch {
      // 表单验证失败
    }
  };

  const [saving, setSaving] = useState(false);
  const gatewayPort = useAppStore((state) => state.gatewayPort);

  const handleComplete = async () => {
    const modelConfig = useAppStore.getState().modelConfig;
    const channelConfig = useAppStore.getState().channelConfig;
    
    if (!modelConfig || !channelConfig) {
      message.error('配置不完整');
      return;
    }

    setSaving(true);
    
    try {
      const client = getGatewayClient(gatewayPort);
      await client.connect();
      
      // 构建配置补丁
      const configPatch: Record<string, unknown> = {
        // 模型配置
        providers: {
          [modelConfig.provider]: {
            apiKey: modelConfig.apiKey,
            ...(modelConfig.baseUrl ? { baseUrl: modelConfig.baseUrl } : {}),
          },
        },
        // 渠道配置
        channels: {
          [channelConfig.type]: {
            enabled: true,
            ...channelConfig.config,
          },
        },
        // 插件启用
        plugins: {
          entries: {
            [channelConfig.type]: {
              enabled: true,
            },
          },
        },
      };

      // 写入配置文件
      await client.patchConfig(configPatch);
      
      completeSetup();
      message.success('配置已保存！');
    } catch (error) {
      console.error('Save config error:', error);
      message.error('保存配置失败，请确保 Gateway 已启动');
    } finally {
      setSaving(false);
    }
  };

  const selectedProviderInfo = MODEL_PROVIDERS.find(p => p.value === selectedProvider);
  const selectedChannelInfo = CHANNELS.find(c => c.value === selectedChannel);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #e05252 0%, #c94545 50%, #a83838 100%)',
      padding: '40px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 装饰性背景元素 */}
      <div style={{
        position: 'absolute',
        top: '-20%',
        right: '-10%',
        width: '40%',
        height: '60%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-30%',
        left: '-15%',
        width: '50%',
        height: '70%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />
      
      <Card 
        style={{ 
          width: '100%', 
          maxWidth: 800,
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          border: 'none',
          position: 'relative',
          zIndex: 1,
        }}
        className="animate-scale-in"
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #e05252 0%, #c94545 100%)',
            marginBottom: 16,
            boxShadow: '0 8px 24px rgba(224, 82, 82, 0.3)',
          }}>
            <RobotOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={2} style={{ marginBottom: 8, fontWeight: 700 }}>
            OpenClaw CN
          </Title>
          <Text type="secondary" style={{ fontSize: 15 }}>中国商用个人 AI 助手 · 快速配置向导</Text>
        </div>

        <Steps 
          current={current} 
          items={steps}
          style={{ marginBottom: 32 }}
        />

        {/* Step 1: 选择模型 */}
        {current === 0 && (
          <div>
            <Title level={4}>选择 AI 模型服务</Title>
            <Paragraph type="secondary">
              选择您要使用的大模型服务提供商，需要提供对应的 API Key
            </Paragraph>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              {MODEL_PROVIDERS.map((provider, index) => (
                <Col span={8} key={provider.value}>
                  <Card
                    hoverable
                    className="animate-fade-in"
                    style={{
                      textAlign: 'center',
                      borderColor: selectedProvider === provider.value ? '#e05252' : 'var(--border)',
                      borderWidth: 2,
                      background: selectedProvider === provider.value ? 'rgba(224, 82, 82, 0.06)' : undefined,
                      transition: 'all 0.2s ease',
                      animationDelay: `${index * 50}ms`,
                    }}
                    onClick={() => setSelectedProvider(provider.value)}
                  >
                    <div style={{ 
                      fontSize: 36, 
                      marginBottom: 12,
                      transform: selectedProvider === provider.value ? 'scale(1.1)' : 'scale(1)',
                      transition: 'transform 0.2s ease',
                    }}>{provider.icon}</div>
                    <Text strong style={{ 
                      color: selectedProvider === provider.value ? '#e05252' : undefined,
                      fontSize: 14,
                    }}>{provider.label}</Text>
                    {selectedProvider === provider.value && (
                      <CheckCircleOutlined style={{ color: '#e05252', marginLeft: 8 }} />
                    )}
                  </Card>
                </Col>
              ))}
            </Row>

            {selectedProvider && (
              <Form form={modelForm} layout="vertical">
                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[{ required: true, message: '请输入 API Key' }]}
                >
                  <Input.Password placeholder={`输入 ${selectedProviderInfo?.label} 的 API Key`} />
                </Form.Item>
                
                {selectedProviderInfo?.fields.includes('baseUrl') && (
                  <Form.Item
                    name="baseUrl"
                    label="API Base URL (可选)"
                  >
                    <Input placeholder="自定义 API 地址，留空使用默认" />
                  </Form.Item>
                )}
              </Form>
            )}

            <div style={{ textAlign: 'right', marginTop: 24 }}>
              <Button type="primary" size="large" onClick={handleModelNext}>
                下一步
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: 选择渠道 */}
        {current === 1 && (
          <div>
            <Title level={4}>选择消息渠道</Title>
            <Paragraph type="secondary">
              选择您要接入的消息平台，AI 助手将通过该渠道与用户交流
            </Paragraph>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              {CHANNELS.map((channel) => (
                <Col span={8} key={channel.value}>
                  <Card
                    hoverable
                    style={{
                      textAlign: 'center',
                      borderColor: selectedChannel === channel.value ? '#1890ff' : undefined,
                      borderWidth: selectedChannel === channel.value ? 2 : 1,
                      background: selectedChannel === channel.value ? '#e6f7ff' : undefined,
                    }}
                    onClick={() => setSelectedChannel(channel.value)}
                  >
                    <div style={{ marginBottom: 8 }}>{channel.icon}</div>
                    <Text strong>{channel.label}</Text>
                    {selectedChannel === channel.value && (
                      <CheckCircleOutlined style={{ color: '#1890ff', marginLeft: 8 }} />
                    )}
                  </Card>
                </Col>
              ))}
            </Row>

            {selectedChannel && selectedChannelInfo && (
              <Form form={channelForm} layout="vertical">
                {selectedChannelInfo.fields.map((field) => (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    rules={[{ required: true, message: `请输入 ${field.label}` }]}
                  >
                    <Input.Password placeholder={field.placeholder} />
                  </Form.Item>
                ))}
              </Form>
            )}

            <div style={{ textAlign: 'right', marginTop: 24 }}>
              <Space>
                <Button size="large" onClick={() => setCurrent(0)}>
                  上一步
                </Button>
                <Button type="primary" size="large" onClick={handleChannelNext}>
                  下一步
                </Button>
              </Space>
            </div>
          </div>
        )}

        {/* Step 3: 完成 */}
        {current === 2 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
            <Title level={3}>配置完成！</Title>
            <Paragraph type="secondary" style={{ marginBottom: 32 }}>
              您已完成基本配置，点击下方按钮启动 AI 助手服务
            </Paragraph>

            <Card style={{ textAlign: 'left', marginBottom: 24, background: '#fafafa' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">AI 模型:</Text>
                  <br />
                  <Text strong>
                    {MODEL_PROVIDERS.find(p => p.value === useAppStore.getState().modelConfig?.provider)?.label}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">消息渠道:</Text>
                  <br />
                  <Text strong>
                    {CHANNELS.find(c => c.value === useAppStore.getState().channelConfig?.type)?.label}
                  </Text>
                </Col>
              </Row>
            </Card>

            <Space>
              <Button size="large" onClick={() => setCurrent(1)} disabled={saving}>
                返回修改
              </Button>
              <Button type="primary" size="large" icon={<RocketOutlined />} onClick={handleComplete} loading={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
}
