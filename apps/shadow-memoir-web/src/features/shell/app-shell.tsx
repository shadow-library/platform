import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { Avatar, BottomNavigation, Button, cn, ConfirmDialog, Fab, IconButton, Kbd, matchPath, toast, Tooltip, useMediaQuery, useShellNav, useTheme } from '@shadow-library/ui';
import { AppShell as Chrome } from '@shadow-library/ui/router';
import { isApiError, userDisplayName } from '@shadow-library/web';

import { BellIcon, LogIcon, MemoirMark, MoonIcon, SearchIcon, SunIcon } from '@/components/icons';
import { formatCount } from '@/lib/format';
import { logout, meQuery } from '@/lib/apis';
import { currentPage, signInUrl } from '@/lib/session';
import { useSyncEngine, useSyncStatus } from '@/lib/sync';

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

function SignOutIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6" />
      <path d="M10.5 11 14 8l-3.5-3M14 8H6" />
    </svg>
  );
}

const CONNECTION_NEEDED = 'Sign out needs a connection — nothing was removed.';
const SIGN_OUT_FAILED = 'Couldn’t sign out — try again';

/**
 * The two-surface chrome. One composition serves both: `AppShell` collapses its sidebar into a drawer below
 * 768px on its own, and this adds what the phone needs on top of that — the bottom bar for the five daily
 * destinations and a promoted capture action within thumb reach. On desktop the same capture action is the
 * command palette, so the FAB and the palette trigger are mutually exclusive rather than duplicated.
 */
function ShellChrome({ children }: AppShellProps): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const signingOutRef = useRef(false);
  const me = useQuery(meQuery);
  const { queuedCount } = useSyncStatus();
  const overlays = useSystemOverlays();
  const engine = useSyncEngine();

  const accountName = userDisplayName(me.data, '');
  const accountEmail = me.isError ? 'Account details unavailable' : me.data?.email;

  // `ConfirmDialog` exposes no `onCloseAutoFocus`, so this restores focus itself on cancel.
  const confirmOpenerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (confirmOpen) return undefined;
    const target = confirmOpenerRef.current;
    const fallback = document.querySelector<HTMLElement>('[aria-label="Account menu"]');
    const restoreTarget = isFocusable(target) ? target : fallback;
    const timer = setTimeout(() => {
      if (isFocusable(restoreTarget)) restoreTarget.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [confirmOpen]);

  // A full-page `window.location.assign` at the end, never an in-SPA `navigate` to `/login` — that would
  // leave `useSessionGuard` mounted long enough to race its own redirect in with the wrong `returnTo`.
  const performSignOut = async (): Promise<void> => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    toast.neutral('Signing out…');
    const returnTo = currentPage();

    let redirectTo: string | undefined;
    let sessionGone: boolean;
    try {
      redirectTo = (await logout()).redirectTo;
      sessionGone = true;
    } catch (error) {
      const status = isApiError(error) ? error.status : undefined;
      if (status === 401) {
        sessionGone = true;
      } else {
        signingOutRef.current = false;
        setSigningOut(false);
        toast[status === -1 || status === undefined ? 'warning' : 'danger'](status === -1 || status === undefined ? CONNECTION_NEEDED : SIGN_OUT_FAILED);
        return;
      }
    }

    if (sessionGone) {
      try {
        await engine?.store.wipeAccount();
      } catch {
        /* the redirect below still ends the session either way */
      }
    }
    engine?.store.close();
    window.location.assign(redirectTo ?? signInUrl(returnTo));
  };

  const handleSignOut = (): void => {
    if (signingOutRef.current) return;
    if (!navigator.onLine) {
      toast.warning(CONNECTION_NEEDED);
      return;
    }
    if (queuedCount > 0) {
      confirmOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConfirmOpen(true);
      return;
    }
    void performSignOut();
  };

  const drawerFooter = isPhone ? (
    <DrawerAccountPanel name={accountName} email={accountEmail} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} signingOut={signingOut} />
  ) : undefined;

  return (
    <Chrome
      brand={{ icon: <MemoirMark size={18} />, name: 'Shadow', tagline: 'Memoir', to: '/' }}
      nav={DESKTOP_NAV}
      account={{
        name: accountName,
        email: accountEmail,
        items: [{ id: 'sign-out', label: signingOut ? 'Signing out…' : 'Sign out', icon: <SignOutIcon />, destructive: true, disabled: signingOut, onSelect: handleSignOut }],
      }}
      search={
        <button type="button" className={styles.paletteTrigger} onClick={() => setCaptureOpen(true)}>
          <SearchIcon size={16} />
          <span className={styles.paletteLabel}>Log something, or jump to a screen</span>
          <Kbd className={styles.paletteKbd} keys="mod+K" aria-hidden />
        </button>
      }
      utility={
        <>
          <DrawerFocusReturn />
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
      bottomNav={<PhoneNav />}
      sidebarFooter={drawerFooter}
      contentWidth="fluid"
      stickyTopbar
      className={cn(styles.shellRoot, styles.fabClearance)}
    >
      <NetStrip />
      {children}
      <Fab className={styles.fab} placement="fixed" icon={<LogIcon size={20} />} aria-label="Quick capture" onClick={() => setCaptureOpen(true)} />
      <QuickCapture open={captureOpen} onOpenChange={setCaptureOpen} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        intent="danger"
        title={`Sign out and discard ${formatCount(queuedCount, 'unsynced change', 'unsynced changes')}?`}
        confirmLabel="Sign out"
        cancelLabel="Keep working"
        loading={signingOut}
        onConfirm={() => void performSignOut()}
      />
    </Chrome>
  );
}

function PhoneNav(): ReactElement {
  const { pathname } = useLocation();
  const active = PHONE_NAV.filter(item => matchPath(pathname, item.to, { exact: item.exact })).at(-1);
  return (
    <BottomNavigation value={active?.to ?? ''}>
      {PHONE_NAV.map(item => (
        <BottomNavigation.Item key={item.to} value={item.to} icon={item.icon} label={item.label} asChild>
          <Link to={item.to} />
        </BottomNavigation.Item>
      ))}
    </BottomNavigation>
  );
}

function isFocusable(target: HTMLElement | null | undefined): target is HTMLElement {
  return target != null && target.isConnected;
}

/**
 * `Shell`'s mobile-nav `Dialog` exposes no `onCloseAutoFocus`, so this restores focus itself. Mounted
 * once, via `utility` — not `sidebarFooter`, which renders once per sidebar instance.
 */
function DrawerFocusReturn(): null {
  const { open } = useShellNav();
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) {
      openerRef.current = document.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]');
      return undefined;
    }
    if (!open && wasOpen) {
      const target = openerRef.current;
      const timer = setTimeout(() => {
        if (isFocusable(target)) target.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  return null;
}

interface DrawerAccountPanelProps {
  name: string;
  email: string | undefined;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}

function DrawerAccountPanel({ name, email, theme, onToggleTheme, onSignOut, signingOut }: DrawerAccountPanelProps): ReactElement {
  return (
    <div className={styles.drawerAccount}>
      <div className={styles.drawerIdentity}>
        <Avatar name={name} size="sm" alt="" />
        <span className={styles.drawerIdentityText}>
          <span className={styles.drawerName}>{name || 'Account'}</span>
          {email ? <span className={styles.drawerEmail}>{email}</span> : null}
        </span>
      </div>
      <div className={styles.drawerActions}>
        <IconButton variant="ghost" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={onToggleTheme} />
        <Button variant="secondary" size="sm" loading={signingOut} loadingText="Signing out…" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
