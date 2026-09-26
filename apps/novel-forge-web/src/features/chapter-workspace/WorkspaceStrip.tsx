import { type ReactNode } from 'react';

import styles from './WorkspaceStrip.module.css';

export interface WorkspaceStripProps {
  tone: 'success' | 'warning' | 'danger';
  children: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  /** Announces the strip at once: the author's text is at stake and waits on their choice. */
  urgent?: boolean;
}

export function WorkspaceStrip({ tone, children, detail, actions, urgent }: WorkspaceStripProps): React.JSX.Element {
  return (
    <div role={urgent ? 'alert' : 'status'} className={styles.strip} data-tone={tone}>
      <span className={styles.message}>
        {children}
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      {actions && <span className={styles.actions}>{actions}</span>}
    </div>
  );
}
