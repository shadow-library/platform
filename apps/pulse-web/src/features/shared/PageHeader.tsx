/**
 * Importing npm packages
 */
import clsx from 'clsx';
import { type ReactElement, type ReactNode } from 'react';

import styles from './PageHeader.module.css';

/**
 * Defining types
 */
export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
  /** Render the title in the monospace face (for keys / identifiers). */
  mono?: boolean;
}

/** Page-level title block: optional breadcrumb, an H1 + subtitle, and a trailing action. */
export function PageHeader({ title, subtitle, action, breadcrumb, mono }: PageHeaderProps): ReactElement {
  return (
    <>
      {breadcrumb ? <div className={styles.breadcrumb}>{breadcrumb}</div> : null}
      <div className={styles.header}>
        <div>
          <h1 className={clsx(styles.title, mono && styles.mono)}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </>
  );
}

/** In-page section header (H2 + subtitle + trailing action) used above secondary tables. */
export function SectionHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
