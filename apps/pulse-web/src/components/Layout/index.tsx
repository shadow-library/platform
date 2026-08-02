/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type PropsWithChildren, type ReactElement } from 'react';
import { Button, IconButton, useTheme } from '@shadow-library/ui';
import { AppShell, type NavConfig } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';

/**
 * Importing user defined components
 */
import { DashboardIcon, LayoutIcon, LogIcon, MoonIcon, PartialIcon, PulseMark, RoutingIcon, SenderIcon, SendIcon, SunIcon, TemplateIcon } from '@/features/shared';
import { logout, meQuery } from '@/lib/apis';

import styles from './Layout.module.css';
import OrgSwitcher from './OrgSwitcher';

/**
 * Declaring the constants
 */

/** The reading column every screen sits in; the shell centres it and supplies the gutters. */
const PAGE_WIDTH = 1200;

const NAV: NavConfig = {
  variant: 'sections',
  sections: [
    { label: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: <DashboardIcon />, exact: true }] },
    { label: 'Templates', items: [{ to: '/templates', label: 'Templates', icon: <TemplateIcon /> }] },
    {
      label: 'Design system',
      items: [
        { to: '/design/layouts', label: 'Layouts', icon: <LayoutIcon /> },
        { to: '/design/partials', label: 'Partials', icon: <PartialIcon /> },
      ],
    },
    { label: 'Senders', items: [{ to: '/senders', label: 'Sender Profiles', icon: <SenderIcon /> }] },
    { label: 'Routing', items: [{ to: '/routing', label: 'Routing Rules', icon: <RoutingIcon /> }] },
    {
      label: 'Messaging',
      items: [
        { to: '/send', label: 'Send Notification', icon: <SendIcon />, exact: true },
        { to: '/logs', label: 'Message Log', icon: <LogIcon />, exact: true },
      ],
    },
  ],
};

function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton variant="ghost" size="sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} icon={dark ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
  );
}

/**
 * The operations chrome. `AppShell` places the rail, pins it, gutters and centres the content, and below
 * md swaps the rail for its nav drawer — the app had no layout at all under a desktop viewport before.
 */
export default function Layout({ children }: PropsWithChildren): ReactElement {
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const stage = import.meta.env.DEV ? 'dev' : 'production';

  /**
   * Ends the app session server-side, then hands the browser on. Where the deployment configures
   * RP-initiated logout, the reply carries identity's end-session URL — a full-page navigation to another
   * origin that must *replace* the local `/login` bounce, not follow it: routing to `/login` would leave
   * the central identity session live and sign the operator straight back in. The session cookie is
   * cleared regardless of the request outcome, so a failed call still signs out locally.
   */
  const handleSignOut = async (): Promise<void> => {
    try {
      const { redirectTo } = await logout();
      if (redirectTo) return window.location.assign(redirectTo);
    } catch {
      /* the cookie is gone either way, so fall through to the local bounce */
    }
    await navigate({ to: '/login', search: { returnTo: '/' } });
  };

  return (
    <AppShell
      brand={{ icon: <PulseMark />, name: 'Pulse', tagline: 'Operations', to: '/' }}
      nav={NAV}
      account={{ name: userDisplayName(me.data), email: me.data?.email, onSignOut: () => void handleSignOut() }}
      breadcrumb="Multi-channel notification service"
      status={
        <div className={styles.envPill} title="Environment stage (set via env variable)">
          <span className={styles.envDot} />
          <span className={styles.envLabel}>env</span>
          <span className={styles.envValue}>{stage}</span>
        </div>
      }
      actions={
        <>
          <OrgSwitcher />
          {/* A phone bar has no room for it, and the drawer's Messaging section reaches the same screen. */}
          <span className={styles.sendAction}>
            <Button variant="primary" size="sm" onClick={() => navigate({ to: '/send' })}>
              Send notification
            </Button>
          </span>
        </>
      }
      utility={<ThemeToggle />}
      contentWidth={PAGE_WIDTH}
    >
      {children}
    </AppShell>
  );
}
