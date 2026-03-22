/**
 * Importing npm packages
 */
import { AppShell } from '@mantine/core';
import { type ReactNode } from 'react';

import { type Alphabet } from '../Logo';
/**
 * Importing user defined packages
 */
import styles from './AppLayout.module.css';
import { ContentFooter } from './ContentFooter';
import { useLayoutState } from './hooks/use-layout-state';
import { type FooterConfig, type NavItem, type NotificationsConfig, type UserInfo } from './layout.types';
import { SideNavbar } from './SideNavbar';
import { TopNavbar } from './TopNavbar';

/**
 * Defining types
 */

interface AppLayoutProps {
  children: ReactNode;
  productName: Alphabet[];
  appName: string;
  navItems: NavItem[];
  user?: UserInfo;
  notifications?: NotificationsConfig;
  footer?: FooterConfig;
  showThemeToggle?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * Declaring the constants
 */
const HEADER_HEIGHT = 56;
const NAVBAR_WIDTH_EXPANDED = 260;
const NAVBAR_WIDTH_COLLAPSED = 72;

export function AppLayout({ children, appName, productName, navItems, user, notifications, footer, showThemeToggle = true, defaultCollapsed = false }: AppLayoutProps) {
  const { collapsed, toggleCollapsed, mobileOpened, toggleMobile, closeMobile } = useLayoutState({ defaultCollapsed });

  return (
    <AppShell
      layout='alt'
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: collapsed ? NAVBAR_WIDTH_COLLAPSED : NAVBAR_WIDTH_EXPANDED,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding='md'
      transitionDuration={200}
    >
      <AppShell.Header>
        <TopNavbar user={user} notifications={notifications} showThemeToggle={showThemeToggle} mobileOpened={mobileOpened} onToggleMobile={toggleMobile} />
      </AppShell.Header>

      <AppShell.Navbar>
        <SideNavbar items={navItems} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onNavigate={closeMobile} productName={productName} onCloseMobile={closeMobile} />
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <div className={styles.mainContent}>{children}</div>
        <ContentFooter appName={appName} footer={footer} />
      </AppShell.Main>
    </AppShell>
  );
}
