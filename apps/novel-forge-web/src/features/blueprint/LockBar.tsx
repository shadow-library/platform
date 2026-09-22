import { type ReactElement, type ReactNode } from 'react';
import { Button } from '@shadow-library/ui';

import styles from './blueprint.module.css';

export interface LockBarProps {
  label: string;
  /** One line on what locking writes, so the author knows what it costs before pressing it. */
  hint?: ReactNode;
  onLock: () => void;
  /** Also blocks the press: `Button` lets an explicit `disabled={false}` win over `loading`, so a second click would send a second lock. */
  loading?: boolean;
  disabled?: boolean;
  /** Secondary affordances beside the lock — "write my own", "skip this step". */
  secondary?: ReactNode;
}

export function LockBar({ label, hint, onLock, loading, disabled, secondary }: LockBarProps): ReactElement {
  return (
    <div className={styles.lockBar}>
      {hint != null && <span className={styles.lockHint}>{hint}</span>}
      <div className={styles.lockActions}>
        {secondary}
        <Button variant="primary" loading={loading} disabled={disabled === true || loading === true} onClick={onLock}>
          {label}
        </Button>
      </div>
    </div>
  );
}
