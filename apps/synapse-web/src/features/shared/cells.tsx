import { type ReactElement, type ReactNode } from 'react';
import { Badge } from '@shadow-library/ui';

import styles from './cells.module.css';

export function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.mono}>{children}</span>;
}

export function Muted({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.muted}>{children}</span>;
}

export function VersionStateBadge({ active }: { active: boolean }): ReactElement {
  if (!active) return <Badge variant="outline">Archived</Badge>;
  return (
    <Badge intent="success" variant="soft" dot>
      Active
    </Badge>
  );
}
