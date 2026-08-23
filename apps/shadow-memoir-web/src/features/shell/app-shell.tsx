import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { BottomNavigation, Fab, IconButton, Kbd, matchPath, Tooltip, useMediaQuery, useTheme } from '@shadow-library/ui';
import { AppShell as Chrome } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';

import { BellIcon, LogIcon, MemoirMark, MoonIcon, SearchIcon, SunIcon } from '@/components/icons';
import { logout, meQuery } from '@/lib/apis';

import styles from './app-shell.module.css';
import { DESKTOP_NAV, PHONE_NAV } from './nav';
import { NetStrip } from './net-strip';
import { QuickCapture } from './quick-capture';
import { SystemOverlayProvider, useSystemOverlays } from './system-overlays';

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactElement {
  return (
    <SystemOverlayProvider>
      <ShellChrome>{children}</ShellChrome>
    </SystemOverlayProvider>
  );
}

/**
 * The two-surface chrome. One composition serves both: `AppShell` collapses its sidebar into a drawer below
 * 768px on its own, and this adds what the phone needs on top of that — the bottom bar for the five daily
 * destinations and a promoted capture action within thumb reach. On desktop the same capture action is the
 * command palette, so the FAB and the palette trigger are mutually exclusive rather than duplicated.
 */
function ShellChrome({ children }: AppShellProps): ReactElement {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [captureOpen, setCaptureOpen] = useState(false);
  const me = useQuery(meQuery);
  const overlays = useSystemOverlays();

  /**
   * Ends the app session server-side, then hands the browser on. Where the deployment configures
   * RP-initiated logout the reply carries identity's end-session URL, which must replace the local bounce —
   * routing to the landing screen would leave the central session live and sign the owner straight back in.
   * The session cookie is cleared regardless of the outcome, so a failed call still signs out locally.
   */
  const handleSignOut = async (): Promise<void> => {
    try {
      const { redirectTo } = await logout();
      if (redirectTo) return window.location.assign(redirectTo);
    } catch {
      /* the cookie is gone either way, so fall through to the local bounce */
    }
    await navigate({ to: '/welcome', search: { returnTo: '/' } });
  };

  return (
    <Chrome
      brand={{ icon: <MemoirMark size={18} />, name: 'Shadow', tagline: 'Memoir', to: '/' }}
      nav={DESKTOP_NAV}
      account={{ name: userDisplayName(me.data), email: me.data?.email, onSignOut: () => void handleSignOut() }}
      search={
        <button type="button" className={styles.paletteTrigger} onClick={() => setCaptureOpen(true)} aria-label="Quick capture">
          <SearchIcon size={16} />
          <span className={styles.paletteLabel}>Log something, or jump to a screen</span>
          <Kbd className={styles.paletteKbd} aria-hidden>
            ⌘K
          </Kbd>
        </button>
      }
      utility={
        <>
          <Tooltip content="Notifications">
            <IconButton variant="ghost" aria-label="Notifications" icon={<BellIcon size={18} />} onClick={() => overlays.open('notifications')} />
          </Tooltip>
          <span className={styles.desktopOnly}>
            <Tooltip content="Toggle theme">
              <IconButton variant="ghost" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={toggleTheme} />
            </Tooltip>
          </span>
        </>
      }
      bottomNav={isPhone ? <PhoneNav /> : undefined}
      contentWidth="fluid"
    >
      <NetStrip />
      {children}
      {isPhone && <Fab className={styles.fab} placement="static" icon={<LogIcon size={20} />} aria-label="Quick capture" onClick={() => setCaptureOpen(true)} />}
      <QuickCapture open={captureOpen} onOpenChange={setCaptureOpen} />
    </Chrome>
  );
}

function PhoneNav(): ReactElement {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = PHONE_NAV.filter(item => matchPath(pathname, item.to, { exact: item.exact })).at(-1);
  return (
    <BottomNavigation value={active?.to ?? '/'} onValueChange={to => void navigate({ to })}>
      {PHONE_NAV.map(item => (
        <BottomNavigation.Item key={item.to} value={item.to} icon={item.icon} label={item.label} />
      ))}
    </BottomNavigation>
  );
}
