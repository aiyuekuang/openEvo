import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu } from 'antd';
import {
  DashboardOutlined,
  SettingOutlined,
  RobotOutlined,
} from '@ant-design/icons';

const { Sider, Content } = AntLayout;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '控制台',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="light" 
        width={220}
        style={{
          borderRight: '1px solid var(--border)',
          background: '#fff',
        }}
      >
        <div style={{ 
          height: 72, 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          gap: 12,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #e05252 0%, #c94545 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(224, 82, 82, 0.25)',
          }}>
            <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2 }}>OpenClaw CN</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>控制台</div>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ 
            borderRight: 0,
            padding: '12px 8px',
          }}
        />
      </Sider>
      <AntLayout>
        <Content style={{ background: 'var(--bg-base)' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
