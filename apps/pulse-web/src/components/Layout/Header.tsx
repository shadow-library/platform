/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button, IconButton, useShellNav } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { MenuIcon } from '@/features/shared';
import { logout } from '@/lib/apis';

import styles from './Layout.module.css';
import OrgSwitcher from './OrgSwitcher';

/** Opens the shell's nav drawer. This header isn't a `TopNavigation`, so it wires its own trigger. */
function NavMenuButton(): ReactElement | null {
  const nav = useShellNav();
  if (!nav.hasSidebar) return null;
  return (
    <span className={styles.navMenu}>
      <IconButton variant="ghost" size="sm" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={nav.open} icon={<MenuIcon />} onClick={() => nav.setOpen(true)} />
    </span>
  );
}

export default function Header(): ReactElement {
  const navigate = useNavigate();
  const stage = import.meta.env.DEV ? 'dev' : 'production';

  /**
   * Ends the app session server-side, then hands the browser to `/login` — which bounces to SSO. The
   * session cookie is cleared regardless of the request outcome, so a failed call still signs out.
   */
  const handleSignOut = async (): Promise<void> => {
    try {
      await logout();
    } finally {
      await navigate({ to: '/login', search: { returnTo: '/' } });
    }
  };

  return (
    <header className={styles.header}>
      <NavMenuButton />
      <div className={styles.headerTitle}>
        <span className={styles.headerEyebrow}>PULSE OPERATIONS</span>
        <span className={styles.headerName}>Multi-channel notification service</span>
      </div>
      <div className={styles.spacer} />
      <OrgSwitcher />
      <div className={styles.envPill} title="Environment stage (set via env variable)">
        <span className={styles.envDot} />
        <span className={styles.envLabel}>env</span>
        <span className={styles.envValue}>{stage}</span>
      </div>
      {/* A phone bar has no room for it, and the drawer's Messaging section reaches the same screen. */}
      <span className={styles.sendAction}>
        <Button variant="primary" onClick={() => navigate({ to: '/send' })}>
          Send notification
        </Button>
      </span>
      <Button variant="secondary" onClick={() => void handleSignOut()}>
        Sign out
      </Button>
    </header>
  );
}
