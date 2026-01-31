import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAppStore } from './stores/app';
import { getGatewayClient } from './api/gateway';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Layout from './components/Layout';

// 从 URL 获取 token 参数
function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function App() {
  const isConfigured = useAppStore((state) => state.isConfigured);
  const isLoading = useAppStore((state) => state.isLoading);
  const loadFromConfig = useAppStore((state) => state.loadFromConfig);
  const setLoading = useAppStore((state) => state.setLoading);
  const gatewayPort = useAppStore((state) => state.gatewayPort);
  const gatewayToken = useAppStore((state) => state.gatewayToken);
  const setGatewayToken = useAppStore((state) => state.setGatewayToken);

  // 优先使用 URL token，其次使用存储的 token
  const effectiveToken = useMemo(() => {
    const urlToken = getTokenFromUrl();
    return urlToken || gatewayToken;
  }, [gatewayToken]);

  useEffect(() => {
    // 如果 URL 中有 token，保存到 store
    const urlToken = getTokenFromUrl();
    if (urlToken && urlToken !== gatewayToken) {
      setGatewayToken(urlToken);
    }
  }, [gatewayToken, setGatewayToken]);

  useEffect(() => {
    // 尝试从 Gateway 获取配置
    const loadConfig = async () => {
      try {
        const client = getGatewayClient(gatewayPort, effectiveToken || undefined);
        await client.connect();
        const config = await client.getConfig();
        loadFromConfig(config as Record<string, unknown>);
      } catch {
        // Gateway 未运行或连接失败，使用本地存储的状态
        setLoading(false);
      }
    };

    loadConfig();
  }, [gatewayPort, effectiveToken, loadFromConfig, setLoading]);

  // 加载中显示 loading
  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f5f5f5'
      }}>
        <Spin size="large" tip="加载配置中..." />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {!isConfigured ? (
          <Route path="*" element={<Setup />} />
        ) : (
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
