/**
 * Importing npm packages
 */
import { AppShell } from '@mantine/core';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import styles from './AppLayout.module.css';
import { ContentFooter } from './ContentFooter';
import { useLayoutState } from './hooks/use-layout-state';
import { type NavItems, type NotificationsConfig, type UserInfo } from './layout.types';
import { SideNavbar } from './SideNavbar';
import { TopNavbar } from './TopNavbar';

/**
 * Defining types
 */

interface AppLayoutProps {
  appName: string;
  children: ReactNode;
  navItems: NavItems;
  headerContent?: ReactNode;
  user?: UserInfo;
  notifications?: NotificationsConfig;
  footer?: ReactNode;
  showThemeToggle?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * Declaring the constants
 */

export function AppLayout({ children, appName, navItems, headerContent, user, notifications, footer, showThemeToggle, defaultCollapsed }: AppLayoutProps) {
  const { collapsed, toggleCollapsed, mobileOpened, toggleMobile, closeMobile } = useLayoutState({ defaultCollapsed });

  return (
    <AppShell layout='alt' header={{ height: 56 }} navbar={{ width: collapsed ? 56 : 260, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }} padding='md'>
      <AppShell.Header>
        <TopNavbar
          navItems={navItems}
          headerContent={headerContent}
          user={user}
          notifications={notifications}
          showThemeToggle={showThemeToggle}
          mobileOpened={mobileOpened}
          onToggleMobile={toggleMobile}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <SideNavbar items={navItems} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onNavigate={closeMobile} appName={appName} onCloseMobile={closeMobile} />
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <div className={styles.mainContent}>{children}</div>
        {footer && <ContentFooter content={footer} />}
      </AppShell.Main>
    </AppShell>
  );
}
