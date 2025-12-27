/**
 * Importing npm packages
 */
import { useState } from 'react';
import { Layout, Menu, type MenuProps } from 'antd';

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
const items: MenuItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
  },
];

export default function Header(props: HeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider collapsible collapsed={collapsed} onCollapse={value => setCollapsed(value)}>
        <div className="demo-logo-vertical" />
        <Menu theme="dark" defaultSelectedKeys={['1']} mode="inline" items={items} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ padding: 0 }}></Layout.Header>
        <Layout.Content style={{ margin: '0 16px' }}>{props.children}</Layout.Content>
        <Layout.Footer style={{ textAlign: 'center' }}>Shadow Pulse © {currentYear} Created by Shadow Lord</Layout.Footer>
      </Layout>
    </Layout>
  );
}
