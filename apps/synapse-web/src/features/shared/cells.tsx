import { type ReactElement, type ReactNode } from 'react';
import { Badge } from '@shadow-library/ui';

import styles from './cells.module.css';

export function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.mono}>{children}</span>;
}

export function Muted({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.muted}>{children}</span>;
}

export function TextOrDash({ value, mono }: { value?: string | null; mono?: boolean }): ReactElement {
  if (!value) return <span className={styles.muted}>—</span>;
  return mono ? <Mono>{value}</Mono> : <span className={styles.text}>{value}</span>;
}

export type CatalogState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export function VersionStateBadge({ state, active }: { state: CatalogState; active?: boolean }): ReactElement {
  if (active)
    return (
      <Badge intent="success" variant="soft" dot>
        Active
      </Badge>
    );
  if (state === 'ARCHIVED') return <Badge variant="outline">Archived</Badge>;
  return (
    <Badge intent="neutral" variant="soft" dot>
      {state === 'DRAFT' ? 'Draft' : 'Published'}
    </Badge>
  );
}
