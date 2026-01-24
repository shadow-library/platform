/**
 * Importing npm packages
 */
import { LogoutOutlined, MoonOutlined, SearchOutlined, SettingOutlined, SunOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from '@tanstack/react-router';
import type { MenuProps } from 'antd';
import { Avatar, Button, ConfigProvider, Dropdown, Input, Typography } from 'antd';
import { useState } from 'react';

/**
 * Importing user defined components
 */
import { darkTheme } from '@/constants';
import { useTheme } from '../AppProvider';
import Logo from '../Logo';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/**
 * Importing user defined modules
 */

/**
 * Declaring constants
 */
const { Text } = Typography;
const themeLogoStyles: React.CSSProperties = { fontSize: '18px', color: darkTheme.token.colorText };

export default function TopNavbar() {
  const { theme: currentTheme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'header',
      type: 'group',
      label: (
        <div className="px-1 py-2">
          <Text strong>John Doe</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            john.doe@example.com
          </Text>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      danger: true,
    },
  ];

  return (
    <ConfigProvider theme={darkTheme}>
      <header className={styles.topNavContainer}>
        {/* Left Section - Logo */}
        <div className={styles.logoSection}>
          <Link to="/">
            <Logo theme="dark" width={180} letterSpacing={12} />
          </Link>
        </div>

        {/* Center Section - Global Search */}
        <div className={styles.searchContainer}>
          <Input placeholder="Search notifications, templates, logs..." prefix={<SearchOutlined />} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        {/* Right Section - Alerts, User Menu, Theme */}
        <div className={styles.rightSection}>
          {/* Theme Toggle */}
          <Button
            type="text"
            icon={currentTheme === 'dark' ? <SunOutlined style={themeLogoStyles} /> : <MoonOutlined style={themeLogoStyles} />}
            onClick={toggleTheme}
            className={styles.themeToggle}
            aria-label="Toggle theme"
          />

          {/* User Menu */}
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text">
              <Avatar size={32} style={{ backgroundColor: darkTheme.token.colorPrimary }}>
                JD
              </Avatar>
              <Text className="hidden sm:block ml-2">John Doe</Text>
            </Button>
          </Dropdown>
        </div>
      </header>
    </ConfigProvider>
  );
}
