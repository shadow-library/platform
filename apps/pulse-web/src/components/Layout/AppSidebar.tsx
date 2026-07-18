/**
 * Importing npm packages
 */
import { useLocation, useNavigate } from '@tanstack/react-router';
import { type MouseEvent, type ReactElement } from 'react';
import { Sidebar, useTheme } from '@shadow-library/ui';

/**
 * Importing user defined components
 */
import { DashboardIcon, LogIcon, MoonIcon, PulseMark, RoutingIcon, SenderIcon, SendIcon, SunIcon, TemplateIcon } from '@/features/shared';

import styles from './Layout.module.css';

type NavTarget = '/' | '/templates' | '/senders' | '/routing' | '/send' | '/logs';

export default function AppSidebar(): ReactElement {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const go =
    (to: NavTarget) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      navigate({ to });
    };
  const startsWith = (prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);

  return (
    <Sidebar workspace={<PulseMark />} footer={<ThemeToggle />}>
      <Sidebar.Section label="Overview">
        <Sidebar.Item icon={<DashboardIcon />} href="/" active={pathname === '/'} onClick={go('/')}>
          Dashboard
        </Sidebar.Item>
      </Sidebar.Section>
      <Sidebar.Section label="Templates">
        <Sidebar.Item icon={<TemplateIcon />} href="/templates" active={startsWith('/templates')} onClick={go('/templates')}>
          Template Groups
        </Sidebar.Item>
      </Sidebar.Section>
      <Sidebar.Section label="Senders">
        <Sidebar.Item icon={<SenderIcon />} href="/senders" active={startsWith('/senders')} onClick={go('/senders')}>
          Sender Profiles
        </Sidebar.Item>
      </Sidebar.Section>
      <Sidebar.Section label="Routing">
        <Sidebar.Item icon={<RoutingIcon />} href="/routing" active={startsWith('/routing')} onClick={go('/routing')}>
          Routing Rules
        </Sidebar.Item>
      </Sidebar.Section>
      <Sidebar.Section label="Messaging">
        <Sidebar.Item icon={<SendIcon />} href="/send" active={pathname === '/send'} onClick={go('/send')}>
          Send Notification
        </Sidebar.Item>
        <Sidebar.Item icon={<LogIcon />} href="/logs" active={pathname === '/logs'} onClick={go('/logs')}>
          Message Log
        </Sidebar.Item>
      </Sidebar.Section>
    </Sidebar>
  );
}

function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-label="Toggle color theme">
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
