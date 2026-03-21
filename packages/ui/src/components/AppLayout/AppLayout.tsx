/**
 * Importing npm packages
 */
import { AppShell } from '@mantine/core';
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { ContentFooter } from './ContentFooter';
import { SideNavbar } from './SideNavbar';
import { TopNavbar } from './TopNavbar';
import { useLayoutState } from './hooks';
import { FooterConfig, NavItem, NotificationsConfig, UserInfo } from './layout.types';
import styles from './AppLayout.module.css';

/**
 * Defining types
 */

interface AppLayoutProps {
  children: ReactNode;
  appName: string;
  appIcon: LucideIcon | ReactNode;
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

export function AppLayout({ children, appName, appIcon, navItems, user, notifications, footer, showThemeToggle = true, defaultCollapsed = false }: AppLayoutProps) {
  const { collapsed, toggleCollapsed, mobileOpened, toggleMobile, closeMobile } = useLayoutState({ defaultCollapsed });

  return (
    <AppShell
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
        <TopNavbar
          appName={appName}
          appIcon={appIcon}
          user={user}
          notifications={notifications}
          showThemeToggle={showThemeToggle}
          mobileOpened={mobileOpened}
          onToggleMobile={toggleMobile}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <SideNavbar items={navItems} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onNavigate={closeMobile} />
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <div className={styles.mainContent}>{children}</div>
        <ContentFooter appName={appName} footer={footer} />
      </AppShell.Main>
    </AppShell>
  );
}
