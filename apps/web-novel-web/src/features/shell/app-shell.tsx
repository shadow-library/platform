/**
 * Importing npm packages
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Avatar, BottomNavigation, Button, IconButton, Input, Shell, Sidebar, Tooltip, TopNavigation, useMediaQuery, useTheme } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { BookIcon, BookmarkIcon, CompassIcon, DownloadIcon, HomeIcon, LogOutIcon, MoonIcon, SearchIcon, SunIcon, TagIcon } from '@/components/icons';
import { loginUrl, purgeOnLogout, sessionQueryOptions, signOut } from '@/lib/apis';

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

/**
 * Declaring the constants
 *
 * The app scaffold from the mockups: persistent sidebar + top search bar on desktop, automatic
 * sidebar→drawer swap below md (built into `Shell`), and a `BottomNavigation` on phones. Reading is
 * public; the account slot shows Sign in until a session exists.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: <HomeIcon size={16} /> },
  { to: '/browse', label: 'Browse', icon: <CompassIcon size={16} /> },
  { to: '/genres', label: 'Genres', icon: <TagIcon size={16} /> },
  { to: '/library', label: 'Library', icon: <BookmarkIcon size={16} /> },
  { to: '/downloads', label: 'Offline', icon: <DownloadIcon size={16} /> },
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
      <span>
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

  const user = session.data ?? undefined;
  const activeNav = NAV_ITEMS.filter(item => isActive(location.pathname, item.to)).at(-1);

  const onSearch = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    const q = event.currentTarget.value.trim();
    void navigate({ to: '/browse', search: prev => ({ ...prev, q: q || undefined, page: undefined }) });
  };

  const sidebar = (
    <Sidebar aria-label="Primary" workspace={<Brand />} footer={<AccountSlot userId={user?.userId} name={user?.name} email={user?.email} pathname={location.pathname} />}>
      <Sidebar.Section>
        {NAV_ITEMS.map(item => (
          // Not a plain <a href>: SPA navigation must not reload, and leaving the click un-prevented lets
          // the Shell's mobile drawer auto-close on item navigation (it closes only on unprevented clicks).
          <Sidebar.Item
            key={item.to}
            icon={item.icon}
            active={isActive(location.pathname, item.to)}
            label={item.label}
            role="link"
            tabIndex={0}
            onClick={() => void navigate({ to: item.to })}
            onKeyDown={event => event.key === 'Enter' && void navigate({ to: item.to })}
          >
            {item.label}
          </Sidebar.Item>
        ))}
      </Sidebar.Section>
    </Sidebar>
  );

  const topbar = (
    <TopNavigation aria-label="Top" utility={<TopUtility theme={theme} onToggleTheme={toggleTheme} userId={user?.userId} userName={user?.name} pathname={location.pathname} />}>
      <div className={styles.search}>
        <Input size="md" prefix={<SearchIcon size={16} />} placeholder="Search novels, authors, genres…" aria-label="Search novels" onKeyDown={onSearch} />
      </div>
    </TopNavigation>
  );

  return (
    <Shell sidebar={sidebar} topbar={topbar}>
      <div className={`${styles.content} ${isPhone ? styles.contentWithBottomNav : ''}`}>{children}</div>
      {isPhone && (
        <BottomNavigation value={activeNav?.to ?? '/'} onValueChange={to => void navigate({ to })}>
          {NAV_ITEMS.map(item => (
            <BottomNavigation.Item key={item.to} value={item.to} icon={item.icon} label={item.label} />
          ))}
        </BottomNavigation>
      )}
    </Shell>
  );
}

function TopUtility(props: { theme: string; onToggleTheme: () => void; userId?: string; userName?: string; pathname: string }): React.JSX.Element {
  return (
    <div className={styles.utility}>
      <Tooltip content="Toggle theme">
        <IconButton variant="ghost" aria-label="Toggle theme" icon={props.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={props.onToggleTheme} />
      </Tooltip>
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
    await signOut();
    await purgeOnLogout(queryClient, props.userId);
    window.location.href = '/';
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
