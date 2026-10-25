import { type ReactElement, type ReactNode, type Ref } from 'react';

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

export interface SectionHeaderProps extends PageHeaderProps {
  /** Makes the heading a programmatic focus target, for a section that opens on demand */
  headingRef?: Ref<HTMLHeadingElement>;
}

export function SectionHeader({ title, subtitle, action, headingRef }: SectionHeaderProps): ReactElement {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeading}>
        <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={styles.sectionTitle}>
          {title}
        </h2>
        {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
