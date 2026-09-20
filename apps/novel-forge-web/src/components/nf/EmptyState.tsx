import { type ReactElement, type ReactNode } from 'react';

import { type CollectionCount, formatCountsStrip } from '@/lib/collection-page';

import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  /** One sentence naming the action or event that puts items here. */
  description: ReactNode;
  actions?: ReactNode;
  counts?: readonly CollectionCount[];
}

export function EmptyState({ icon, title, description, actions, counts }: EmptyStateProps): ReactElement {
  const strip = counts && counts.length > 0 ? formatCountsStrip(counts) : null;

  return (
    <div className={styles.root}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {actions && <div className={styles.actions}>{actions}</div>}
      {strip && <p className={styles.counts}>{strip}</p>}
    </div>
  );
}
