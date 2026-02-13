/**
 * Importing npm packages
 */
import { useNavigate, useLocation } from '@tanstack/react-router';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  MessageOutlined,
  SettingOutlined,
  LockOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  ApiOutlined,
  SendOutlined,
  FileTextOutlined,
  GlobalOutlined,
  SlidersOutlined,
  ThunderboltOutlined,
  UserOutlined,
  SafetyOutlined,
  LineChartOutlined,
  UnorderedListOutlined,
  AppstoreAddOutlined,
  AuditOutlined,
  ToolOutlined,
  InboxOutlined,
} from '@ant-design/icons';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/**
 * Declaring types
 */
type MenuItem = Required<MenuProps>['items'][number];

/**
 * Declaring constants
 */
const parentKeys = new Set(['messaging', 'configuration', 'access-control', 'monitoring', 'system']);
const menuItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: 'messaging',
    icon: <MessageOutlined />,
    label: 'Messaging',
    children: [
      { key: '/messaging/providers', icon: <ApiOutlined />, label: 'Providers' },
      { key: '/messaging/senders', icon: <SendOutlined />, label: 'Senders' },
      { key: '/messaging/templates', icon: <FileTextOutlined />, label: 'Templates' },
    ],
  },
  {
    key: 'configuration',
    icon: <SettingOutlined />,
    label: 'Configuration',
    children: [
      { key: '/configuration/services', icon: <GlobalOutlined />, label: 'Services' },
      { key: '/configuration/default-settings', icon: <SlidersOutlined />, label: 'Default Settings' },
      { key: '/configuration/routing-rules', icon: <ThunderboltOutlined />, label: 'Routing Rules' },
    ],
  },
  {
    key: 'access-control',
    icon: <LockOutlined />,
    label: 'Access Control',
    children: [
      { key: '/access-control/users', icon: <UserOutlined />, label: 'Users' },
      { key: '/access-control/roles-permissions', icon: <SafetyOutlined />, label: 'Roles & Permissions' },
    ],
  },
  {
    key: 'monitoring',
    icon: <BarChartOutlined />,
    label: 'Monitoring',
    children: [
      { key: '/monitoring/metrics', icon: <LineChartOutlined />, label: 'Metrics' },
      { key: '/monitoring/delivery-logs', icon: <UnorderedListOutlined />, label: 'Delivery Logs' },
      { key: '/monitoring/dev-inbox', icon: <InboxOutlined />, label: 'Dev Inbox' },
    ],
  },
  {
    key: 'system',
    icon: <CloudServerOutlined />,
    label: 'System',
    children: [
      { key: '/system/integrations', icon: <AppstoreAddOutlined />, label: 'Integrations' },
      { key: '/system/audit-logs', icon: <AuditOutlined />, label: 'Audit Logs' },
      { key: '/system/settings', icon: <ToolOutlined />, label: 'Settings' },
    ],
  },
] satisfies MenuItem[];

const initialOpenKeys: string[] = [];
for (const parentKey of parentKeys) {
  const menuItem = menuItems.find(item => item.key === parentKey);
  if (menuItem?.children) {
    const hasActiveChild = menuItem.children.some(child => child.key === window.location.pathname);
    if (hasActiveChild) initialOpenKeys.push(parentKey);
  }
}

export default function SideNavbar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className={styles.sideNavContainer}>
      <Menu
        mode="inline"
        theme="dark"
        defaultSelectedKeys={[location.pathname]}
        defaultOpenKeys={initialOpenKeys}
        onClick={e => !parentKeys.has(e.key) && navigate({ to: e.key })}
        items={menuItems}
        style={{ backgroundColor: 'transparent', border: 'none', padding: '8px' }}
      />
    </aside>
  );
}
