import { type ReactElement, type ReactNode } from 'react';
import { cn } from '@shadow-library/ui';

import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
  /** Render the title in the monospace face (for keys / identifiers). */
  mono?: boolean;
}

export function PageHeader({ title, subtitle, action, breadcrumb, mono }: PageHeaderProps): ReactElement {
  return (
    <>
      {breadcrumb ? <div className={styles.breadcrumb}>{breadcrumb}</div> : null}
      <div className={styles.header}>
        <div>
          <h1 className={cn(styles.title, mono && styles.mono)}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </>
  );
}

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
