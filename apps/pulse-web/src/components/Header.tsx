/**
 * Importing npm packages
 */
import { useState } from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';

/**
 *  Importing user defined modules
 */

/**
 * Declaring types
 */

type MenuItem = Required<MenuProps>['items'][number];

export interface HeaderProps {
  children: React.ReactNode;
}

/**
 * Declaring constants
 */
const items: Array<MenuItem> = [
  {
    key: 'dashboard',
    label: 'Dashboard',
  },
  {
    key: 'templates',
    label: 'Templates',
  },
  {
    key: 'notifications',
    label: 'Notifications',
  },
  {
    key: 'settings',
    label: 'Settings',
  },
];

export default function Header(props: HeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="light" collapsible collapsed={collapsed} onCollapse={value => setCollapsed(value)}>
        <div className="h-[60px] p-4 flex-center">
          <img src="/logo.png" alt="Shadow Pulse" />
        </div>
        <Menu defaultSelectedKeys={['1']} mode="inline" items={items} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ height: 60 }}></Layout.Header>
        <Layout.Content style={{ margin: '0 16px' }}>{props.children}</Layout.Content>
        <Layout.Footer style={{ textAlign: 'center' }}>Shadow Pulse © {currentYear} Created by Shadow Lord</Layout.Footer>
      </Layout>
    </Layout>
  );
}
