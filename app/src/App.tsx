import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAppStore } from './stores/app';
import { getGatewayClient } from './api/gateway';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Marketplace from './pages/Marketplace';
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
  const setGatewayToken = useAppStore((state) => state.setGatewayToken);
  
  const initDone = useRef(false);

  // 初始化：获取 token 并连接 Gateway
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      // 获取 token
      let token: string | null = getTokenFromUrl();
      
      if (!token && window.electronAPI?.gateway?.getToken) {
        try {
          token = await window.electronAPI.gateway.getToken();
        } catch {
          // ignore
        }
      }

      if (token) {
        setGatewayToken(token);
      }

      // 检查 Gateway 是否已启动
      let gatewayRunning = false;
      if (window.electronAPI?.gateway?.status) {
        try {
          const status = await window.electronAPI.gateway.status();
          gatewayRunning = status === 'running';
        } catch {
          // ignore
        }
      }

      // 只有 Gateway 运行中才尝试连接
      if (gatewayRunning) {
        try {
          const client = getGatewayClient(gatewayPort, token || undefined);
          await client.connect();
          const config = await client.getConfig();
          loadFromConfig(config as Record<string, unknown>);
        } catch {
          setLoading(false);
        }
      } else {
        // Gateway 未启动，直接结束加载
        setLoading(false);
      }
    };

    init();
  }, [gatewayPort, loadFromConfig, setLoading, setGatewayToken]);

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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {!isConfigured ? (
          <Route path="*" element={<Setup />} />
        ) : (
        <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
