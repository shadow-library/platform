/**
 * Importing npm packages
 */
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { Avatar, Button, DropdownMenu, Shell, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { ArrowLeftIcon, GridIcon, LayersIcon, LinkIcon, LogOutIcon, ShieldCheckIcon, UserIcon, UsersIcon, WebhookIcon } from '@/components/icons';
import { NavMenuButton, ThemeToggle } from '@/components/si';
import { useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';
import { PAGE_WIDTH } from '@/lib/layout';

import styles from './console-shell.module.css';

/**
 * Defining types
 */
interface NavGroup {
  label: string;
  items: { to: string; label: string; icon: ReactNode }[];
}

/**
 * Declaring the constants
 */
const NAV: NavGroup[] = [
  { label: 'Directory', items: [{ to: '/console/users', label: 'Users', icon: <UsersIcon size={18} /> }] },
  {
    label: 'Applications',
    items: [
      { to: '/console/applications', label: 'Applications', icon: <GridIcon size={18} /> },
      { to: '/console/saml', label: 'SAML providers', icon: <LinkIcon size={18} /> },
    ],
  },
  {
    label: 'Access',
    items: [
      { to: '/console/roles', label: 'Roles & permissions', icon: <ShieldCheckIcon size={18} /> },
      { to: '/console/webhooks', label: 'Webhooks', icon: <WebhookIcon size={18} /> },
    ],
  },
];

/** The operator console chrome — a distinct, warning-accented shell for privileged platform administration. */
export function ConsoleShell({ children }: { children: ReactNode }): React.JSX.Element {
  const me = useMeQuery();
  const navigate = useNavigate();
  const signout = useSignoutMutation();
  const { pathname } = useLocation();

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' });
  }, [me.isError, navigate]);

  if (me.isLoading || !me.data)
    return (
      <div className={styles.gate}>
        <Spinner size="lg" label="Loading console" />
      </div>
    );

  const user = me.data;

  const sidebar = (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <svg width={24} height={24} viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="7" y="7" width="17" height="17" rx="5" fill="var(--sh-accent-soft)" />
          <rect x="3" y="3" width="17" height="17" rx="5" fill="var(--sh-accent)" />
          <circle cx="11.5" cy="10.2" r="2.5" fill="var(--sh-on-accent)" />
          <path d="M10.4 11.8 12.6 11.8 13.4 16 9.6 16 Z" fill="var(--sh-on-accent)" />
        </svg>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Shadow Identity</span>
          <span className={styles.brandTag}>Operator console</span>
        </div>
      </div>
      <nav className={styles.nav} aria-label="Console">
        {NAV.map(group => (
          <div key={group.label}>
            <div className={styles.navLabel}>{group.label}</div>
            {group.items.map(item => (
              <Link key={item.to} to={item.to} className="si-nav" activeProps={{ 'data-active': 'true' }}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );

  const topbar = (
    <header className={styles.header}>
      <NavMenuButton />
      <div className={styles.crumb}>{pathname.replace('/console/', 'Console / ').replace('/console', 'Operator console').replace(/\//g, ' / ')}</div>
      <div className={styles.headerRight}>
        <span className={styles.privileged}>
          <LayersIcon size={12} />
          Privileged access
        </span>
        {/* The console is a detour out of the portal, so leaving it is a first-class action rather than a menu entry.
            On a phone the bar has no room for it and the account menu's own "Back to your account" carries the exit. */}
        <span className={styles.backAction}>
          <Button variant="ghost" size="sm" prefix={<ArrowLeftIcon size={15} />} onClick={() => navigate({ to: '/account' })}>
            Back to dashboard
          </Button>
        </span>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={styles.headerAvatar} aria-label="Account menu">
              <Avatar name={displayName(user)} size="sm" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} className={styles.userMenu}>
            <DropdownMenu.Label>{user.email ?? displayName(user)}</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={<UserIcon size={16} />} onSelect={() => navigate({ to: '/account' })}>
              Back to your account
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={<LogOutIcon size={16} />} destructive onSelect={() => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) })}>
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </header>
  );

  // Same shell, same column as the portal — only the chrome differs, so the console can't drift.
  return (
    <Shell sidebar={sidebar} topbar={topbar} contentWidth={PAGE_WIDTH}>
      {children}
    </Shell>
  );
}
