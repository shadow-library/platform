/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { logout } from '@/lib/apis';

import styles from './Layout.module.css';
import OrgSwitcher from './OrgSwitcher';

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
      <Button variant="primary" onClick={() => navigate({ to: '/send' })}>
        Send notification
      </Button>
      <Button variant="secondary" onClick={() => void handleSignOut()}>
        Sign out
      </Button>
    </header>
  );
}
