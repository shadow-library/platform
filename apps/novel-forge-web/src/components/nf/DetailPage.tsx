import { type ReactElement, type ReactNode } from 'react';

import styles from './DetailPage.module.css';

/**
 * The width bands D5 allows a right-hand panel. `summary` holds labels, chips and clamped summaries;
 * `prose` is the narrowest column prose reads at, below which a field belongs in a `ReadingSheet`.
 */
export type DetailAsideWidth = 'summary' | 'prose';

export interface DetailPageProps {
  /** A `Link` back to the directory, named with its count — "All 39 entities". Never a button. */
  back: ReactNode;
  /** A `DetailPage.Identity`, or arbitrary nodes for an item the common arrangement does not fit. */
  identity: ReactNode;
  /** An `ItemPager`, which carries the jump button. */
  pager?: ReactNode;
  actions?: ReactNode;
  /** Right-hand context column — relationships, ledgers, attachments. Never navigation. */
  aside?: ReactNode;
  /** Accessible name for the `aside` region. */
  asideLabel?: string;
  asideWidth?: DetailAsideWidth;
  children: ReactNode;
}

function DetailPageRoot({ back, identity, pager, actions, aside, asideLabel = 'Details', asideWidth = 'summary', children }: DetailPageProps): ReactElement {
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

      <div className={styles.body} data-aside={asideWidth}>
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

export interface DetailIdentityProps {
  avatar?: ReactNode;
  title: ReactNode;
  /** Status chips beside the name — type, importance, state. */
  children?: ReactNode;
}

function DetailIdentity({ avatar, title, children }: DetailIdentityProps): ReactElement {
  return (
    <>
      {avatar}
      <h1 className={styles.title}>{title}</h1>
      {children}
    </>
  );
}

export interface DetailProseProps {
  children: ReactNode;
  className?: string;
}

function DetailProse({ children, className }: DetailProseProps): ReactElement {
  return <div className={className ? `${styles.prose} ${className}` : styles.prose}>{children}</div>;
}

export const DetailPage = Object.assign(DetailPageRoot, { Identity: DetailIdentity, Prose: DetailProse });
