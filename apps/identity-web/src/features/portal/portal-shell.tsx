/**
 * Importing npm packages
 */
import { Avatar, DropdownMenu, IconButton, Spinner, useTheme } from '@shadow-library/ui';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';

/**
 * Importing user defined packages
 */
import { BellIcon, BuildingIcon, ChevronDownIcon, GridIcon, LogOutIcon, MailIcon, MonitorIcon, MoonIcon, PlugIcon, ShieldCheckIcon, SunIcon, UserIcon } from '@/components/icons';
import { type MeResponse, useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './portal-shell.module.css';

/**
 * Defining types
 */
interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

/**
 * Declaring the constants
 */
const ACCOUNT_NAV: NavItem[] = [
  { to: '/account', label: 'Overview', icon: <GridIcon size={18} />, exact: true },
  { to: '/account/security', label: 'Security', icon: <ShieldCheckIcon size={18} /> },
  { to: '/account/sessions', label: 'Sessions & devices', icon: <MonitorIcon size={18} /> },
  { to: '/account/contacts', label: 'Emails & phones', icon: <MailIcon size={18} /> },
  { to: '/account/profile', label: 'Profile', icon: <UserIcon size={18} /> },
  { to: '/applications', label: 'My applications', icon: <GridIcon size={18} /> },
  { to: '/account/connected', label: 'Connected apps', icon: <PlugIcon size={18} /> },
];

const ORG_NAV: NavItem[] = [{ to: '/organizations', label: 'My organizations', icon: <BuildingIcon size={18} /> }];

/** The account/portal brand glyph. */
function BrandGlyph(): React.JSX.Element {
  return (
    <svg width={24} height={24} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="17" height="17" rx="5" fill="var(--sh-accent-soft)" />
      <rect x="3" y="3" width="17" height="17" rx="5" fill="var(--sh-accent)" />
      <circle cx="11.5" cy="10.2" r="2.5" fill="var(--sh-on-accent)" />
      <path d="M10.4 11.8 12.6 11.8 13.4 16 9.6 16 Z" fill="var(--sh-on-accent)" />
    </svg>
  );
}

function UserMenu({ me, children }: { me: MeResponse; children: ReactNode }): React.JSX.Element {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const signout = useSignoutMutation();
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" sideOffset={6} className={styles.userMenu}>
        <DropdownMenu.Label>{me.email ?? displayName(me)}</DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />} onSelect={toggleTheme}>
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={<LogOutIcon size={16} />} destructive onSelect={() => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) })}>
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/**
 * The account-portal chrome: a fixed nav rail (account + organizations), a slim top bar carrying the
 * session-assurance badge and the user menu, and a scrolling content region. Handles the auth gate —
 * an unauthenticated visitor is bounced to the hosted sign-in.
 */
export function PortalShell({ children }: { children: ReactNode }): React.JSX.Element {
  const me = useMeQuery();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' });
  }, [me.isError, navigate]);

  if (me.isLoading || !me.data)
    return (
      <div className={styles.gate}>
        <Spinner size="lg" label="Loading your account" />
      </div>
    );

  const user = me.data;
  const elevated = user.aal === 'AAL2' || user.elevated;
  const activeLabel = [...ACCOUNT_NAV, ...ORG_NAV].find(item => (item.exact ? pathname === item.to : pathname.startsWith(item.to)))?.label ?? 'Account';

  const renderNav = (item: NavItem): React.JSX.Element => (
    <Link key={item.to} to={item.to} className="si-nav" activeOptions={{ exact: item.exact }} activeProps={{ 'data-active': 'true' }}>
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <BrandGlyph />
          <span className={styles.brandName}>
            Shadow <span className={styles.brandSub}>Identity</span>
          </span>
        </div>
        <nav className={styles.nav} aria-label="Account">
          <div className={styles.navLabel}>Account</div>
          {ACCOUNT_NAV.map(renderNav)}
          <div className={styles.navLabel}>Organizations</div>
          {ORG_NAV.map(renderNav)}
        </nav>
        <UserMenu me={user}>
          <button type="button" className={styles.userRow}>
            <Avatar name={displayName(user)} size="sm" />
            <span className={styles.userInfo}>
              <span className={styles.userName}>{displayName(user)}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </span>
            <ChevronDownIcon size={16} />
          </button>
        </UserMenu>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.crumb}>Account / {activeLabel}</div>
          <div className={styles.headerRight}>
            <span className={styles.aalBadge} data-elevated={elevated || undefined}>
              <ShieldCheckIcon size={12} />
              {elevated ? 'AAL2 · MFA' : 'AAL1'}
            </span>
            <IconButton variant="ghost" size="sm" aria-label="Notifications" icon={<BellIcon size={18} />} />
            <UserMenu me={user}>
              <button type="button" className={styles.headerAvatar} aria-label="Account menu">
                <Avatar name={displayName(user)} size="sm" />
              </button>
            </UserMenu>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
