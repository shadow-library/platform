import { type ReactElement, type ReactNode } from 'react';

import styles from './DetailPage.module.css';

export interface DetailPageProps {
  /** A `Link` back to the directory, named with its count — "All 39 entities". Never a button. */
  back: ReactNode;
  /** Avatar, title and status chips for the item on screen. */
  identity: ReactNode;
  /** An `ItemPager`, which carries the jump button. */
  pager?: ReactNode;
  actions?: ReactNode;
  /** Right-hand context column — relationships, ledgers, attachments. Never navigation. */
  aside?: ReactNode;
  /** Accessible name for the `aside` region. */
  asideLabel?: string;
  children: ReactNode;
}

function DetailPageRoot({ back, identity, pager, actions, aside, asideLabel = 'Details', children }: DetailPageProps): ReactElement {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.back}>
          <span className={styles.backArrow} aria-hidden="true">
            ←
          </span>
          {back}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.identity}>{identity}</div>
        {pager}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>

      <div className={styles.body}>
        <div className={styles.main}>{children}</div>
        {aside && (
          <aside className={styles.aside} aria-label={asideLabel}>
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

export interface DetailProseProps {
  children: ReactNode;
  className?: string;
}

function DetailProse({ children, className }: DetailProseProps): ReactElement {
  return <div className={className ? `${styles.prose} ${className}` : styles.prose}>{children}</div>;
}

export const DetailPage = Object.assign(DetailPageRoot, { Prose: DetailProse });
