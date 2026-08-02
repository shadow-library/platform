/**
 * Importing npm packages
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Avatar, BottomNavigation, Button, IconButton, Kbd, Shell, Sidebar, Tooltip, TopNavigation, useMediaQuery, useTheme } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import {
  BookIcon,
  BookmarkIcon,
  CompassIcon,
  DownloadIcon,
  ExternalIcon,
  HistoryIcon,
  HomeIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsSlidersIcon,
  SunIcon,
  TagIcon,
} from '@/components/icons';
import { SearchOverlay } from '@/features/search';
import { loginUrl, meQuery, notificationsQueryOptions, purgeOnLogout, sessionQueryOptions, signOut } from '@/lib/apis';

import styles from './app-shell.module.css';

/**
 * Defining types
 */
export interface AppShellProps {
  children?: React.ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.JSX.Element;
}

type NavigateFn = ReturnType<typeof useNavigate>;

/**
 * Declaring the constants
 *
 * The app scaffold from the mockups: persistent sidebar (a primary section plus a divider-separated
 * secondary section) + a top bar whose inline field is now a button that opens the full-screen search
 * overlay. Below md the `Shell` swaps the sidebar for a hamburger drawer automatically — reusing this
 * same `Sidebar`, so the drawer carries both nav groups and the footer for free — and phones also get a
 * `BottomNavigation`. Reading is public; the account slot shows Sign in until a session exists.
 */

/** Glyphs the shared icon set doesn't ship — kept local so `icons.tsx` stays the design's canonical set. */
function glyph(paths: React.ReactNode): (props: { size?: number }) => React.JSX.Element {
  return function Glyph({ size = 18 }: { size?: number }): React.JSX.Element {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths}
      </svg>
    );
  };
}

const BellIcon = glyph(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
);
const PencilIcon = glyph(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
);
const HelpIcon = glyph(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </>,
);

/** The same external writing studio the home PromoSection links to (`NOVEL_FORGE_URL` in `home-screen.tsx`). */
const NOVEL_FORGE_URL = 'https://forge.shadow.app';

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: <HomeIcon size={16} /> },
  { to: '/browse', label: 'Browse', icon: <CompassIcon size={16} /> },
  { to: '/genres', label: 'Genres', icon: <TagIcon size={16} /> },
  { to: '/library', label: 'Library', icon: <BookmarkIcon size={16} /> },
  { to: '/downloads', label: 'Offline', icon: <DownloadIcon size={16} /> },
];

const SECONDARY_NAV: NavItem[] = [
  { to: '/history', label: 'History', icon: <HistoryIcon size={16} /> },
  { to: '/notifications', label: 'Notifications', icon: <BellIcon size={16} /> },
  { to: '/settings', label: 'Settings', icon: <SettingsSlidersIcon size={16} /> },
  { to: '/help', label: 'Help', icon: <HelpIcon size={16} /> },
];

function isActive(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function Brand(): React.JSX.Element {
  return (
    <Link to="/" className={styles.logo} aria-label="Shadow Webnovel home">
      <span className={styles.logoMark}>
        <BookIcon size={18} />
      </span>
      <span className={styles.logoText}>
        <span className={styles.logoName}>Shadow</span>
        <span className={styles.logoSub}>Webnovel</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const session = useQuery(sessionQueryOptions());
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [searchOpen, setSearchOpen] = useState(false);

  const user = session.data ?? undefined;
  // The name lives on its own query, not the session: the session gates routes, and a profile that
  // could not be fetched must never read as "signed out".
  const me = useQuery({ ...meQuery, enabled: Boolean(user) });
  const notifications = useQuery(notificationsQueryOptions(user?.userId));
  const hasUnread = (notifications.data ?? []).some(notification => !notification.read);
  const activeNav = MAIN_NAV.filter(item => isActive(location.pathname, item.to)).at(-1);

  // A global "/" opens search from anywhere — but stay out of the way while the reader is typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const sidebar = (
    <Sidebar aria-label="Primary" workspace={<Brand />} footer={<SidebarFooter userId={user?.userId} name={me.data?.name} email={me.data?.email} pathname={location.pathname} />}>
      <Sidebar.Section>
        <NavItems items={MAIN_NAV} pathname={location.pathname} navigate={navigate} />
      </Sidebar.Section>
      <div className={styles.navDivider} role="separator" />
      <Sidebar.Section>
        <NavItems items={SECONDARY_NAV} pathname={location.pathname} navigate={navigate} />
      </Sidebar.Section>
    </Sidebar>
  );

  const topbar = (
    <TopNavigation
      aria-label="Top"
      utility={
        <TopUtility
          theme={theme}
          onToggleTheme={toggleTheme}
          hasUnread={hasUnread}
          onNotifications={() => void navigate({ to: '/notifications' })}
          userId={user?.userId}
          userName={me.data?.name}
          pathname={location.pathname}
        />
      }
    >
      <button type="button" className={styles.searchEntry} onClick={() => setSearchOpen(true)} aria-label="Search novels, authors, genres">
        <SearchIcon size={16} />
        <span className={styles.searchEntryText}>Search novels, authors…</span>
        <Kbd className={styles.searchKbd} aria-hidden>
          /
        </Kbd>
      </button>
    </TopNavigation>
  );

  // A reading app draws its own measure per screen — a full-bleed novel hero, a 1280px browse grid, a
  // 760px help page — so the shell supplies the chrome and the drawer but hands the region over whole.
  return (
    <Shell sidebar={sidebar} topbar={topbar} contentWidth="fluid" contentPadding="none" className={styles.shellRoot}>
      <div className={`${styles.content} ${isPhone ? styles.contentWithBottomNav : ''}`}>{children}</div>
      {isPhone && (
        <BottomNavigation value={activeNav?.to ?? '/'} onValueChange={to => void navigate({ to })}>
          {MAIN_NAV.map(item => (
            <BottomNavigation.Item key={item.to} value={item.to} icon={item.icon} label={item.label} />
          ))}
        </BottomNavigation>
      )}
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </Shell>
  );
}

/** SPA nav from the sidebar/drawer: `navigate` (not `<a href>`) so clicks don't reload — the Shell drawer still auto-closes. */
function NavItems(props: { items: NavItem[]; pathname: string; navigate: NavigateFn }): React.JSX.Element {
  return (
    <>
      {props.items.map(item => (
        <Sidebar.Item
          key={item.to}
          icon={item.icon}
          active={isActive(props.pathname, item.to)}
          label={item.label}
          role="link"
          tabIndex={0}
          onClick={() => void props.navigate({ to: item.to })}
          onKeyDown={event => event.key === 'Enter' && void props.navigate({ to: item.to })}
        >
          {item.label}
        </Sidebar.Item>
      ))}
    </>
  );
}

function TopUtility(props: {
  theme: string;
  onToggleTheme: () => void;
  hasUnread: boolean;
  onNotifications: () => void;
  userId?: string;
  userName?: string;
  pathname: string;
}): React.JSX.Element {
  return (
    <div className={styles.utility}>
      <span className={styles.bell}>
        <Tooltip content="Notifications">
          <IconButton variant="ghost" aria-label="Notifications" icon={<BellIcon size={18} />} onClick={props.onNotifications} />
        </Tooltip>
        {props.hasUnread && <span className={styles.bellDot} aria-hidden />}
      </span>
      <span className={styles.desktopOnly}>
        <Tooltip content="Toggle theme">
          <IconButton variant="ghost" aria-label="Toggle theme" icon={props.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={props.onToggleTheme} />
        </Tooltip>
      </span>
      {props.userId ? (
        <Avatar name={props.userName ?? 'Reader'} size="sm" />
      ) : (
        <Button variant="primary" size="sm" asChild>
          <a href={loginUrl(props.pathname)}>Sign in</a>
        </Button>
      )}
    </div>
  );
}

function SidebarFooter(props: { userId?: string; name?: string; email?: string; pathname: string }): React.JSX.Element {
  return (
    <div className={styles.footer}>
      {/* Novel Forge is a separate service, so this is a real external link, not SPA nav. */}
      <a className={styles.writeNovel} href={NOVEL_FORGE_URL} target="_blank" rel="noreferrer">
        <PencilIcon size={15} />
        <span className={styles.writeNovelLabel}>Write a novel</span>
        <ExternalIcon size={13} />
      </a>
      <AccountSlot userId={props.userId} name={props.name} email={props.email} pathname={props.pathname} />
    </div>
  );
}

function AccountSlot(props: { userId?: string; name?: string; email?: string; pathname: string }): React.JSX.Element {
  const queryClient = useQueryClient();

  // Signed-in state hinges on the identity subject, not a display name: the SDK's session gives `sub` but
  // no profile, so `name`/`email` only appear under fixtures and cannot gate the account slot.
  if (!props.userId) {
    return (
      <div className={styles.account}>
        <Avatar name="Guest" size="sm" />
        <div>
          <div className={styles.accountName}>Guest</div>
          <Link to="/login" className={styles.accountSub}>
            Sign in to sync
          </Link>
        </div>
      </div>
    );
  }

  const displayName = props.name ?? 'Reader';

  // End the server session, then purge this account's on-device caches so the next person on the device
  // never inherits the previous user's cached library or reading history, and finally reset the app.
  const onSignOut = async (): Promise<void> => {
    const redirectTo = await signOut();
    await purgeOnLogout(queryClient, props.userId);
    // On-device traces are purged first either way; where RP-initiated logout is configured the reader is
    // then handed to identity to end the central session, rather than dropped back on the catalog still
    // signed in there.
    window.location.href = redirectTo ?? '/';
  };

  return (
    <div className={styles.account}>
      <Avatar name={displayName} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.accountName}>{displayName}</div>
        <div className={styles.accountSub}>{props.email ?? 'Signed in'}</div>
      </div>
      <Tooltip content="Sign out">
        <IconButton variant="ghost" size="sm" aria-label="Sign out" icon={<LogOutIcon size={16} />} onClick={() => void onSignOut()} />
      </Tooltip>
    </div>
  );
}
