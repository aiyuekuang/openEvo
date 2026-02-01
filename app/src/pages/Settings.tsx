import { useState, useEffect } from 'react';
import { 
  Form, 
  Input, 
  Select, 
  Button, 
  message, 
  Spin,
  Modal,
  Drawer,
  Typography,
} from 'antd';
import { 
  KeyOutlined, 
  MessageOutlined, 
  PlusOutlined,
  DingtalkOutlined,
  GithubOutlined,
  ApiOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '../stores/app';
import { getGatewayClient } from '../api/gateway';

const { Text } = Typography;
const { Password } = Input;

// 模型 Provider 定义
interface ModelDef {
  key: string;
  label: string;
  color: string;
  configKey: string;
  icon?: React.ReactNode;
  apiKeyUrl?: string; // API Key 获取页面
  group: 'domestic' | 'international'; // 分组
}

// 国产模型
const DOMESTIC_MODELS: ModelDef[] = [
  { key: 'deepseek', label: 'DeepSeek', color: '#10b981', configKey: 'deepseek', icon: <ApiOutlined />, apiKeyUrl: 'https://platform.deepseek.com/api-keys', group: 'domestic' },
  { key: 'moonshot', label: 'Moonshot (Kimi)', color: '#1677ff', configKey: 'moonshot', icon: <ApiOutlined />, apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys', group: 'domestic' },
  { key: 'qwen', label: '通义千问', color: '#ff6a00', configKey: 'qwen', icon: <ApiOutlined />, apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey', group: 'domestic' },
  { key: 'zhipu', label: '智谱 GLM', color: '#0ea5e9', configKey: 'zhipu', icon: <ApiOutlined />, apiKeyUrl: 'https://bigmodel.cn/usercenter/apikeys', group: 'domestic' },
];

// 国际模型
const INTERNATIONAL_MODELS: ModelDef[] = [
  { key: 'anthropic', label: 'Anthropic (Claude)', color: '#d97757', configKey: 'anthropic', icon: <ApiOutlined />, apiKeyUrl: 'https://console.anthropic.com/settings/api-keys', group: 'international' },
  { key: 'openai', label: 'OpenAI (GPT)', color: '#10a37f', configKey: 'openai', icon: <ApiOutlined />, apiKeyUrl: 'https://platform.openai.com/api-keys', group: 'international' },
  { key: 'gemini', label: 'Google Gemini', color: '#4285f4', configKey: 'google', icon: <ApiOutlined />, apiKeyUrl: 'https://aistudio.google.com/app/apikey', group: 'international' },
  { key: 'github-copilot', label: 'GitHub Copilot', color: '#24292e', configKey: 'github-copilot:github', icon: <GithubOutlined />, group: 'international' },
  { key: 'openrouter', label: 'OpenRouter', color: '#6366f1', configKey: 'openrouter', icon: <ApiOutlined />, apiKeyUrl: 'https://openrouter.ai/keys', group: 'international' },
];

const MODEL_DEFS: ModelDef[] = [...DOMESTIC_MODELS, ...INTERNATIONAL_MODELS];

// 模型配置数据 (auth.profiles)
interface ModelConfig {
  provider?: string;
  mode?: string;
  apiKey?: string;
  [key: string]: unknown;
}

// 渠道定义
interface ChannelDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  fields: { name: string; label: string; required: boolean; secret?: boolean; placeholder?: string; tooltip?: string }[];
  /** 教程锚点 ID */
  docsAnchor?: string;
  /** 教程描述 */
  docsLabel?: string;
}

// 教程文档锚点 ID
const DOCS_ANCHORS: Record<string, string> = {
  dingtalk: '1-钉钉接入',
  wecom: '3-企业微信接入',
  feishu: '2-飞书接入',
};

const CHANNEL_DEFS: ChannelDef[] = [
  {
    key: 'dingtalk-connector',
    label: '钉钉',
    icon: <DingtalkOutlined />,
    color: '#1677ff',
    docsAnchor: 'dingtalk',
    docsLabel: '钉钉应用配置教程',
    fields: [
      { name: 'clientId', label: 'Client ID', required: true, placeholder: 'dingxxxxxxxxx', tooltip: '钉钉开放平台应用的 Client ID' },
      { name: 'clientSecret', label: 'Client Secret', required: true, secret: true, tooltip: '钉钉开放平台应用的 Client Secret' },
    ],
  },
  {
    key: 'wecom',
    label: '企业微信',
    icon: <MessageOutlined />,
    color: '#07c160',
    docsAnchor: 'wecom',
    docsLabel: '企业微信应用配置教程',
    fields: [
      { name: 'corpId', label: '企业 ID', required: true, placeholder: 'ww12345678', tooltip: '在企业微信管理后台 - 我的企业 中查看' },
      { name: 'agentId', label: '应用 AgentId', required: true, placeholder: '1000002', tooltip: '在应用管理 - 自建应用详情页查看' },
      { name: 'secret', label: '应用 Secret', required: true, secret: true, tooltip: '在应用管理 - 自建应用详情页查看' },
      { name: 'token', label: '回调 Token', required: false, tooltip: '接收消息回调时的验证 Token' },
      { name: 'encodingAesKey', label: '回调 EncodingAESKey', required: false, secret: true, tooltip: '接收消息回调时的加解密密钥' },
    ],
  },
  {
    key: 'feishu',
    label: '飞书',
    icon: <MessageOutlined />,
    color: '#3370ff',
    docsAnchor: 'feishu',
    docsLabel: '飞书应用配置教程',
    fields: [
      { name: 'appId', label: '应用 App ID', required: true, placeholder: 'cli_xxxxxx', tooltip: '在飞书开放平台 - 应用详情页查看' },
      { name: 'appSecret', label: '应用 App Secret', required: true, secret: true },
      { name: 'verificationToken', label: 'Verification Token', required: false, tooltip: '事件订阅的验证 Token' },
      { name: 'encryptKey', label: 'Encrypt Key', required: false, secret: true, tooltip: '事件订阅的加密密钥' },
    ],
  },
];

// 渠道配置数据
interface ChannelConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

interface ConfigFormValues {
  // 网关
  gatewayPort?: number;
  gatewayToken?: string;
  // 界面
  assistantName?: string;
  assistantAvatar?: string;
}

export default function Settings() {
  const [form] = Form.useForm<ConfigFormValues>();
  const [channelForm] = Form.useForm();
  const [modelForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channelConfigs, setChannelConfigs] = useState<Record<string, ChannelConfig>>({});
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [editingChannel, setEditingChannel] = useState<ChannelDef | null>(null);
  const [editingModel, setEditingModel] = useState<ModelDef | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  // 教程抽屉状态
  const [docsDrawerVisible, setDocsDrawerVisible] = useState(false);
  const [docsContent, setDocsContent] = useState('');
  const [docsLoading, setDocsLoading] = useState(false);
  const { gatewayPort, gatewayToken } = useAppStore();

  // 加载教程文档
  const loadDocsContent = async (anchor?: string) => {
    setDocsLoading(true);
    try {
      const response = await fetch('/docs/channels-cn-setup.md');
      if (response.ok) {
        let content = await response.text();
        // 如果有锚点，截取对应章节
        if (anchor && DOCS_ANCHORS[anchor]) {
          const anchorId = DOCS_ANCHORS[anchor];
          const regex = new RegExp(`## ${anchorId.replace(/[-]/g, '[-]?')}[\\s\\S]*?(?=## \\d|---\n\n## |$)`);
          const match = content.match(regex);
          if (match) {
            content = match[0];
          }
        }
        setDocsContent(content);
      }
    } catch (error) {
      console.error('Failed to load docs:', error);
      setDocsContent('文档加载失败');
    } finally {
      setDocsLoading(false);
    }
  };

  // 打开教程抽屉
  const openDocsDrawer = (anchor?: string) => {
    setDocsDrawerVisible(true);
    loadDocsContent(anchor);
  };

  // 加载当前配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const client = getGatewayClient(gatewayPort, gatewayToken || undefined);
      await client.connect();
      const result = await client.getConfig() as { parsed?: Record<string, unknown> };
      const config = result.parsed || result;
      
      // 解析配置到表单
      const formValues: ConfigFormValues = {
        gatewayPort: (config.gateway as Record<string, unknown>)?.port as number || gatewayPort,
        gatewayToken: ((config.gateway as Record<string, unknown>)?.auth as Record<string, unknown>)?.token as string || '',
        assistantName: ((config.ui as Record<string, unknown>)?.assistant as Record<string, unknown>)?.name as string || '',
        assistantAvatar: ((config.ui as Record<string, unknown>)?.assistant as Record<string, unknown>)?.avatar as string || '',
      };

      // 解析渠道配置
      const channels = config.channels as Record<string, ChannelConfig> || {};
      setChannelConfigs(channels);

      // 解析模型配置 (auth.profiles)
      const authProfiles = ((config.auth as Record<string, unknown>)?.profiles as Record<string, ModelConfig>) || {};
      setModelConfigs(authProfiles);

      console.log('[Settings] loaded channels:', channels, 'models:', authProfiles);
      form.setFieldsValue(formValues);
    } catch (error) {
      console.error('Failed to load config:', error);
      message.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const client = getGatewayClient(gatewayPort, gatewayToken || undefined);
      await client.connect();

      // 构建配置对象
      const configPatch: Record<string, unknown> = {};

      // 网关配置
      if (values.gatewayPort || values.gatewayToken) {
        configPatch.gateway = {
          port: values.gatewayPort,
          auth: values.gatewayToken ? { token: values.gatewayToken } : undefined,
        };
      }

      // 界面配置
      if (values.assistantName || values.assistantAvatar) {
        configPatch.ui = {
          assistant: {
            name: values.assistantName,
            avatar: values.assistantAvatar,
          },
        };
      }

      // 保存配置
      await client.request('config.patch', { patch: configPatch });
      message.success('配置已保存');
    } catch (error) {
      console.error('Failed to save config:', error);
      message.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  // 判断渠道是否已配置
  const isChannelConfigured = (channelKey: string): boolean => {
    const config = channelConfigs[channelKey];
    if (!config) return false;
    const def = CHANNEL_DEFS.find(d => d.key === channelKey);
    if (!def) return false;
    // 检查是否有任意必填字段有值
    return def.fields.some(f => f.required && config[f.name]);
  };

  // 获取渠道配置摘要
  const getChannelSummary = (channelKey: string): string => {
    const config = channelConfigs[channelKey];
    if (!config) return '';
    const def = CHANNEL_DEFS.find(d => d.key === channelKey);
    if (!def) return '';
    const firstField = def.fields[0];
    const value = config[firstField.name] as string;
    return value ? `${firstField.label}: ${value}` : '';
  };

  // 打开编辑弹窗
  const openChannelModal = (def: ChannelDef) => {
    setEditingChannel(def);
    const config = channelConfigs[def.key] || {};
    channelForm.setFieldsValue(config);
    setModalVisible(true);
  };

  // 保存渠道配置
  const handleSaveChannel = async () => {
    if (!editingChannel) return;
    try {
      const values = await channelForm.validateFields();
      setSavingChannel(true);

      const client = getGatewayClient(gatewayPort, gatewayToken || undefined);
      await client.connect();

      const channelConfig = {
        ...values,
        enabled: true,
      };

      await client.request('config.patch', { 
        patch: { 
          channels: { 
            [editingChannel.key]: channelConfig 
          } 
        } 
      });

      // 更新本地状态
      setChannelConfigs(prev => ({
        ...prev,
        [editingChannel.key]: channelConfig,
      }));

      message.success(`${editingChannel.label} 配置已保存`);
      setModalVisible(false);
      channelForm.resetFields();
    } catch (error) {
      console.error('Failed to save channel config:', error);
      message.error('保存渠道配置失败');
    } finally {
      setSavingChannel(false);
    }
  };

  // 判断模型是否已配置
  const isModelConfigured = (def: ModelDef): boolean => {
    const config = modelConfigs[def.configKey];
    return !!(config?.provider || config?.apiKey);
  };

  // 打开模型编辑弹窗
  const openModelModal = (def: ModelDef) => {
    setEditingModel(def);
    const config = modelConfigs[def.configKey] || {};
    modelForm.setFieldsValue(config);
    setModelModalVisible(true);
  };

  // 保存模型配置
  const handleSaveModel = async () => {
    if (!editingModel) return;
    try {
      const values = await modelForm.validateFields();
      setSavingModel(true);

      const client = getGatewayClient(gatewayPort, gatewayToken || undefined);
      await client.connect();

      const modelConfig = { ...values };

      await client.request('config.patch', { 
        patch: { 
          auth: { 
            profiles: {
              [editingModel.configKey]: modelConfig 
            }
          } 
        } 
      });

      // 更新本地状态
      setModelConfigs(prev => ({
        ...prev,
        [editingModel.configKey]: modelConfig,
      }));

      message.success(`${editingModel.label} 配置已保存`);
      setModelModalVisible(false);
      modelForm.resetFields();
    } catch (error) {
      console.error('Failed to save model config:', error);
      message.error('保存模型配置失败');
    } finally {
      setSavingModel(false);
    }
  };

  // 支付宝风格列表项
  const renderListItem = (
    icon: React.ReactNode,
    title: string,
    desc: string,
    onClick: () => void
  ) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #f5f5f5',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        fontSize: 18,
        color: '#333',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, color: '#333', fontWeight: 400 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ color: '#ccc', fontSize: 12 }}>›</span>
    </div>
  );

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  const configuredModels = MODEL_DEFS.filter(def => isModelConfigured(def));
  const unconfiguredModels = MODEL_DEFS.filter(def => !isModelConfigured(def));
  const configuredChannels = CHANNEL_DEFS.filter(def => isChannelConfigured(def.key));
  const unconfiguredChannels = CHANNEL_DEFS.filter(def => !isChannelConfigured(def.key));

  // 按分组筛选未配置的模型
  const unconfiguredDomestic = DOMESTIC_MODELS.filter(def => !isModelConfigured(def));
  const unconfiguredInternational = INTERNATIONAL_MODELS.filter(def => !isModelConfigured(def));
  const configuredDomestic = DOMESTIC_MODELS.filter(def => isModelConfigured(def));
  const configuredInternational = INTERNATIONAL_MODELS.filter(def => isModelConfigured(def));

  return (
    <div style={{ height: '100%', background: '#f5f5f5', overflow: 'auto' }}>
      {/* 模型配置 */}
      <div style={{ background: '#fff', marginBottom: 12 }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#999' }}>模型配置</span>
          {unconfiguredModels.length > 0 && (
            <Select
              placeholder="新增模型"
              size="small"
              style={{ width: 150 }}
              value={undefined}
              suffixIcon={<PlusOutlined style={{ fontSize: 10 }} />}
              onChange={(value) => {
                const def = MODEL_DEFS.find(d => d.key === value);
                if (def) openModelModal(def);
              }}
              options={[
                {
                  label: '🇨🇳 国产模型',
                  options: unconfiguredDomestic.map(def => ({ value: def.key, label: def.label })),
                },
                {
                  label: '🌍 国际模型',
                  options: unconfiguredInternational.map(def => ({ value: def.key, label: def.label })),
                },
              ].filter(group => group.options.length > 0)}
            />
          )}
        </div>
        <div style={{ padding: '0 16px' }}>
          {configuredModels.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>
              点击右上角新增模型
            </div>
          ) : (
            <>
              {/* 已配置的国产模型 */}
              {configuredDomestic.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: '#999', padding: '12px 0 4px' }}>🇨🇳 国产</div>
                  {configuredDomestic.map(def => (
                    <div key={def.key}>
                      {renderListItem(
                        def.icon || <KeyOutlined />,
                        def.label,
                        '已配置',
                        () => openModelModal(def)
                      )}
                    </div>
                  ))}
                </>
              )}
              {/* 已配置的国际模型 */}
              {configuredInternational.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: '#999', padding: '12px 0 4px' }}>🌍 国际</div>
                  {configuredInternational.map(def => (
                    <div key={def.key}>
                      {renderListItem(
                        def.icon || <KeyOutlined />,
                        def.label,
                        '已配置',
                        () => openModelModal(def)
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 渠道配置 */}
      <div style={{ background: '#fff', marginBottom: 12 }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#999' }}>消息渠道</span>
          {unconfiguredChannels.length > 0 && (
            <Select
              placeholder="新增"
              size="small"
              style={{ width: 100 }}
              value={undefined}
              suffixIcon={<PlusOutlined style={{ fontSize: 10 }} />}
              onChange={(value) => {
                const def = CHANNEL_DEFS.find(d => d.key === value);
                if (def) openChannelModal(def);
              }}
              options={unconfiguredChannels.map(def => ({ value: def.key, label: def.label }))}
            />
          )}
        </div>
        <div style={{ padding: '0 16px' }}>
          {configuredChannels.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>
              暂无已配置的渠道
            </div>
          ) : (
            configuredChannels.map(def => (
              <div key={def.key}>
                {renderListItem(
                  def.icon,
                  def.label,
                  getChannelSummary(def.key) || '已配置',
                  () => openChannelModal(def)
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 网关配置 */}
      <div style={{ background: '#fff', marginBottom: 12 }}>
        <div style={{ padding: '12px 16px' }}>
          <span style={{ fontSize: 13, color: '#999' }}>网关配置</span>
        </div>
        <Form form={form} layout="vertical" style={{ padding: '0 16px 16px' }}>
          <Form.Item name="gatewayPort" label="端口" style={{ marginBottom: 12 }}>
            <Input placeholder="18789" style={{ height: 40 }} />
          </Form.Item>
          <Form.Item name="gatewayToken" label="Token" style={{ marginBottom: 0 }}>
            <Password placeholder="认证 Token" style={{ height: 40 }} />
          </Form.Item>
        </Form>
      </div>

      {/* 界面配置 */}
      <div style={{ background: '#fff', marginBottom: 12 }}>
        <div style={{ padding: '12px 16px' }}>
          <span style={{ fontSize: 13, color: '#999' }}>界面配置</span>
        </div>
        <Form form={form} layout="vertical" style={{ padding: '0 16px 16px' }}>
          <Form.Item name="assistantName" label="助手名称" style={{ marginBottom: 12 }}>
            <Input placeholder="AI 助手" style={{ height: 40 }} />
          </Form.Item>
          <Form.Item name="assistantAvatar" label="头像 URL" style={{ marginBottom: 0 }}>
            <Input placeholder="https://..." style={{ height: 40 }} />
          </Form.Item>
        </Form>
      </div>

      {/* 保存按钮 */}
      <div style={{ padding: '16px' }}>
        <Button type="primary" block onClick={handleSave} loading={saving} style={{ height: 44 }}>
          保存配置
        </Button>
      </div>

      {/* 模型配置弹窗 */}
      <Modal
        title={editingModel?.label}
        open={modelModalVisible}
        onCancel={() => { setModelModalVisible(false); modelForm.resetFields(); }}
        onOk={handleSaveModel}
        confirmLoading={savingModel}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={modelForm} layout="vertical" style={{ marginTop: 16 }}>
          {editingModel?.apiKeyUrl && (
            <div style={{ marginBottom: 16 }}>
              <Button 
                type="link" 
                icon={<LinkOutlined />}
                onClick={() => window.open(editingModel.apiKeyUrl, '_blank')}
                style={{ padding: 0 }}
              >
                获取 API Key →
              </Button>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                点击跳转到 {editingModel.label} 控制台获取 API Key
              </Text>
              {editingModel.group === 'international' && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8, color: '#faad14' }}>
                  💡 提示：国际模型 API Key 也可以在闲鱼上搜索购买，更便宜哦~
                </Text>
              )}
            </div>
          )}
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Password placeholder="粘贴 API Key" style={{ height: 40 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 渠道配置弹窗 */}
      <Modal
        title={editingChannel?.label}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); channelForm.resetFields(); }}
        onOk={handleSaveChannel}
        confirmLoading={savingChannel}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={channelForm} layout="vertical" style={{ marginTop: 16 }}>
          {editingChannel?.docsAnchor && (
            <div style={{ marginBottom: 16 }}>
              <Button 
                type="link" 
                icon={<LinkOutlined />}
                onClick={() => openDocsDrawer(editingChannel.docsAnchor)}
                style={{ padding: 0 }}
              >
                {editingChannel.docsLabel || '查看配置教程'} →
              </Button>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                查看完整的 {editingChannel.label} 应用创建与配置步骤
              </Text>
            </div>
          )}
          {editingChannel?.fields.map(field => (
            <Form.Item
              key={field.name}
              name={field.name}
              label={field.label}
              tooltip={field.tooltip}
              rules={field.required ? [{ required: true, message: `请输入${field.label}` }] : undefined}
            >
              {field.secret ? (
                <Password placeholder={field.placeholder} style={{ height: 40 }} />
              ) : (
                <Input placeholder={field.placeholder} style={{ height: 40 }} />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>

      {/* 教程抽屉 */}
      <Drawer
        title="配置教程"
        placement="right"
        width={480}
        open={docsDrawerVisible}
        onClose={() => setDocsDrawerVisible(false)}
      >
        {docsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载中..." />
          </div>
        ) : (
          <div style={{ lineHeight: 1.8 }}>
            <ReactMarkdown
              components={{
                h2: ({ children }) => (
                  <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p style={{ marginBottom: 12, color: '#333' }}>{children}</p>
                ),
                ol: ({ children }) => (
                  <ol style={{ marginBottom: 12, paddingLeft: 20 }}>{children}</ol>
                ),
                ul: ({ children }) => (
                  <ul style={{ marginBottom: 12, paddingLeft: 20 }}>{children}</ul>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: 6 }}>{children}</li>
                ),
                code: ({ className, children }) => {
                  const isBlock = className?.includes('language-');
                  if (isBlock) {
                    return (
                      <pre style={{ 
                        background: '#f6f8fa', 
                        padding: 12, 
                        borderRadius: 6, 
                        overflow: 'auto',
                        marginBottom: 12,
                        fontSize: 12,
                      }}>
                        <code>{children}</code>
                      </pre>
                    );
                  }
                  return (
                    <code style={{ 
                      background: '#f6f8fa', 
                      padding: '2px 6px', 
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#d63384',
                    }}>{children}</code>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote style={{ 
                    borderLeft: '3px solid #1677ff', 
                    margin: '12px 0',
                    padding: '8px 12px',
                    background: '#f6f8fa',
                    borderRadius: '0 4px 4px 0',
                    color: '#666',
                    fontSize: 13,
                  }}>{children}</blockquote>
                ),
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff' }}>{children}</a>
                ),
                strong: ({ children }) => (
                  <strong style={{ fontWeight: 600 }}>{children}</strong>
                ),
              }}
            >
              {docsContent}
            </ReactMarkdown>
          </div>
        )}
      </Drawer>
    </div>
  );
}
