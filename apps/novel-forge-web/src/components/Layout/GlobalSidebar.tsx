/**
 * Importing npm packages
 */
import { AppstoreOutlined, DashboardOutlined, SettingOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/**
 * Declaring constants
 */
const menuItems: MenuProps['items'] = [
  { type: 'group', label: 'Main', children: [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/projects', icon: <AppstoreOutlined />, label: 'Projects' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
  ] },
];

export default function GlobalSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className={styles.sideNavContainer}>
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[location.pathname]}
        onClick={e => navigate({ to: e.key })}
        items={menuItems}
        style={{ backgroundColor: 'transparent', border: 'none', padding: '8px' }}
      />
    </aside>
  );
}
