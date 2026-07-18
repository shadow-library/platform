/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import styles from './Layout.module.css';

export default function Header(): ReactElement {
  const navigate = useNavigate();
  const stage = import.meta.env.DEV ? 'dev' : 'production';

  return (
    <header className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.headerEyebrow}>PULSE OPERATIONS</span>
        <span className={styles.headerName}>Multi-channel notification service</span>
      </div>
      <div className={styles.spacer} />
      <div className={styles.envPill} title="Environment stage (set via env variable)">
        <span className={styles.envDot} />
        <span className={styles.envLabel}>env</span>
        <span className={styles.envValue}>{stage}</span>
      </div>
      <Button variant="primary" onClick={() => navigate({ to: '/send' })}>
        Send notification
      </Button>
    </header>
  );
}
