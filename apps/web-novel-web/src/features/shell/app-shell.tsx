/**
 * Importing npm packages
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BottomNavigation, IconButton, Kbd, matchPath, Tooltip, useMediaQuery, useTheme } from '@shadow-library/ui';
import { AppShell as Chrome, type NavConfig, type NavLeaf } from '@shadow-library/ui/router';

/**
 * Importing user defined packages
 */
import { BookIcon, BookmarkIcon, CompassIcon, DownloadIcon, HistoryIcon, HomeIcon, MoonIcon, SearchIcon, SettingsSlidersIcon, SunIcon, TagIcon } from '@/components/icons';
import { SearchOverlay } from '@/features/search';
import { loginUrl, meQuery, purgeOnLogout, sessionQueryOptions, signOut, useNotifications } from '@/lib/apis';
import { NOVEL_FORGE_URL } from '@/lib/constants';

import styles from './app-shell.module.css';

/**
 * Defining types
 */
export interface AppShellProps {
  children?: React.ReactNode;
}

/**
 * Declaring the constants
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

/** The primary destinations, which also drive the phone bottom bar. */
const MAIN_NAV: NavLeaf[] = [
  { to: '/', label: 'Home', icon: <HomeIcon size={16} />, exact: true },
  { to: '/browse', label: 'Browse', icon: <CompassIcon size={16} /> },
  { to: '/genres', label: 'Genres', icon: <TagIcon size={16} /> },
  { to: '/library', label: 'Library', icon: <BookmarkIcon size={16} /> },
  { to: '/downloads', label: 'Offline', icon: <DownloadIcon size={16} /> },
];

const SECONDARY_NAV: NavLeaf[] = [
  { to: '/history', label: 'History', icon: <HistoryIcon size={16} /> },
  { to: '/notifications', label: 'Notifications', icon: <BellIcon size={16} /> },
  { to: '/settings', label: 'Settings', icon: <SettingsSlidersIcon size={16} /> },
  { to: '/help', label: 'Help', icon: <HelpIcon size={16} /> },
  // Novel Forge is a separate service, so this is a real external link, not SPA nav. It sits among the
  // destinations rather than in a footer slot, because to a reader it is simply somewhere else to go.
  { to: NOVEL_FORGE_URL, label: 'Write a novel', icon: <PencilIcon size={16} />, external: true },
];

const NAV: NavConfig = { variant: 'sections', sections: [{ items: MAIN_NAV }, { items: SECONDARY_NAV }] };

/**
 * The reader's chrome. `AppShell` supplies the rail, the top bar, the account menu and the sub-md drawer;
 * this adds the phone bottom bar and the full-screen search overlay.
 *
 * Reading is public, so the account menu has a signed-out face: a "Sign in" call to action rather than an
 * avatar with nothing behind it.
 *
 * The content region is handed over whole (`fluid` + no gutters) because the novel screen is banded — its
 * hero and sticky tab bar span the region edge to edge with a centred column inside, which shell gutters
 * would turn into floating cards. The screens therefore re-create the column and gutters from the shell's
 * own `--sh-page-max` / `--sh-shell-gutter-*` values, so this app measures exactly what Pulse and Identity
 * measure. A screen needing a narrower line (help's running text) narrows inside that constant page.
 *
 * The bottom-nav reservation is the shell's: it restates it for `contentPadding="none"`, so this must not
 * add its own or phones get it twice.
 */
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const session = useQuery(sessionQueryOptions());
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [searchOpen, setSearchOpen] = useState(false);

  const user = session.data ?? undefined;
  // The name lives on its own query, not the session: the session gates routes, and a profile that
  // could not be fetched must never read as "signed out".
  const me = useQuery({ ...meQuery, enabled: Boolean(user) });
  const { unreadCount } = useNotifications(user?.userId);

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

  // End the server session, then purge this account's on-device caches so the next person on the device
  // never inherits the previous user's cached library or reading history, and finally reset the app.
  const onSignOut = async (): Promise<void> => {
    const redirectTo = await signOut();
    await purgeOnLogout(queryClient, user?.userId);
    // On-device traces are purged first either way; where RP-initiated logout is configured the reader is
    // then handed to identity to end the central session, rather than dropped back on the catalog still
    // signed in there.
    window.location.href = redirectTo ?? '/';
  };

  return (
    <Chrome
      brand={{ icon: <BookIcon size={18} />, name: 'Shadow', tagline: 'Webnovel', to: '/' }}
      nav={NAV}
      account={
        user
          ? { name: me.data?.name ?? 'Reader', email: me.data?.email, onSignOut: () => void onSignOut() }
          : { signedOut: { href: loginUrl(location.pathname), label: 'Sign in' } }
      }
      search={
        <button type="button" className={styles.searchEntry} onClick={() => setSearchOpen(true)} aria-label="Search novels, authors, genres">
          <SearchIcon size={16} />
          <span className={styles.searchEntryText}>Search novels, authors…</span>
          <Kbd className={styles.searchKbd} aria-hidden>
            /
          </Kbd>
        </button>
      }
      actions={
        <span className={styles.bell}>
          <Tooltip content="Notifications">
            <IconButton variant="ghost" aria-label="Notifications" icon={<BellIcon size={18} />} onClick={() => void navigate({ to: '/notifications' })} />
          </Tooltip>
          {unreadCount > 0 && <span className={styles.bellDot} aria-hidden />}
        </span>
      }
      utility={
        <span className={styles.desktopOnly}>
          <Tooltip content="Toggle theme">
            <IconButton variant="ghost" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={toggleTheme} />
          </Tooltip>
        </span>
      }
      bottomNav={isPhone ? <PhoneNav /> : undefined}
      contentWidth="fluid"
      contentPadding="none"
      className={styles.shellRoot}
    >
      <div className={styles.content}>{children}</div>
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </Chrome>
  );
}

/** The phone's primary destinations. The most specific match wins, so `/library/x` still lights Library. */
function PhoneNav(): React.JSX.Element {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = MAIN_NAV.filter(item => matchPath(pathname, item.to, { exact: item.exact })).at(-1);
  return (
    <BottomNavigation value={active?.to ?? '/'} onValueChange={to => void navigate({ to })}>
      {MAIN_NAV.map(item => (
        <BottomNavigation.Item key={item.to} value={item.to} icon={item.icon} label={item.label} />
      ))}
    </BottomNavigation>
  );
}
