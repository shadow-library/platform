/**
 * Importing npm packages
 */
import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons';
import { Link } from '@tanstack/react-router';
import { Button, ConfigProvider, Input } from 'antd';
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
 * Declaring constants
 */
const themeLogoStyles: React.CSSProperties = { fontSize: '18px', color: darkTheme.token.colorText };

export default function TopNavbar() {
  const { theme: currentTheme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

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
          <Input placeholder="Search novels, chapters, characters..." prefix={<SearchOutlined />} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        {/* Right Section - Theme Toggle */}
        <div className={styles.rightSection}>
          <Button
            type="text"
            icon={currentTheme === 'dark' ? <SunOutlined style={themeLogoStyles} /> : <MoonOutlined style={themeLogoStyles} />}
            onClick={toggleTheme}
            className={styles.themeToggle}
            aria-label="Toggle theme"
          />
        </div>
      </header>
    </ConfigProvider>
  );
}
