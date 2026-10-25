import { type ReactElement, type ReactNode } from 'react';

import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: PageHeaderProps): ReactElement {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeading}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
