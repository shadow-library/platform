import { type ReactElement, type ReactNode } from 'react';
import { Button, IconButton, Tooltip, useTheme } from '@shadow-library/ui';

import { MemoirMark, MoonIcon, SunIcon } from '@/components/icons';
import { StatusRegion } from '@/components/StatusPage';
import { NetStrip, useSignOut } from '@/features/shell';

import styles from './setup-layout.module.css';

export interface SetupLayoutProps {
  children: ReactNode;
}

export function SetupLayout({ children }: SetupLayoutProps): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const { requestSignOut, signingOut, confirmDialog } = useSignOut();

  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <span className={styles.brand}>
          <MemoirMark size={18} />
          Shadow Memoir
        </span>
        <span className={styles.actions}>
          <Tooltip content="Toggle theme">
            <IconButton variant="ghost" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />} onClick={toggleTheme} />
          </Tooltip>
          <Button variant="ghost" size="sm" loading={signingOut} loadingText="Signing out…" onClick={requestSignOut}>
            Sign out
          </Button>
        </span>
      </header>
      <main className={styles.main}>
        <NetStrip />
        <StatusRegion>{children}</StatusRegion>
      </main>
      {confirmDialog}
    </div>
  );
}
