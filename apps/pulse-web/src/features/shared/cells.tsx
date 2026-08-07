import { type ReactElement, type ReactNode } from 'react';
import { Badge, type BadgeIntent } from '@shadow-library/ui';

import { type Priority, type VersionStatus } from '@/lib';

import styles from './cells.module.css';

export function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.mono}>{children}</span>;
}

export function Muted({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.muted}>{children}</span>;
}

export function EmptyDash(): ReactElement {
  return <span className={styles.muted}>—</span>;
}

export function TextOrDash({ value, mono }: { value?: string | null; mono?: boolean }): ReactElement {
  if (!value) return <EmptyDash />;
  return mono ? <Mono>{value}</Mono> : <span className={styles.text}>{value}</span>;
}

export function AnyOrValue({ value }: { value?: string | null }): ReactElement {
  if (!value) return <span className={styles.any}>any</span>;
  return <span className={styles.text}>{value}</span>;
}

export function StatusBadge({ active }: { active: boolean }): ReactElement {
  return (
    <Badge intent={active ? 'success' : 'neutral'} variant="soft" dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority?: Priority | null }): ReactElement {
  if (!priority) return <EmptyDash />;
  const intent: BadgeIntent = priority === 'HIGH' ? 'danger' : priority === 'MEDIUM' ? 'warning' : 'neutral';
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return (
    <Badge intent={intent} variant="soft" dot>
      {label}
    </Badge>
  );
}

export function OutlineBadge({ children }: { children: ReactNode }): ReactElement {
  return <Badge variant="outline">{children}</Badge>;
}

export function VersionStatusBadge({ status }: { status: VersionStatus }): ReactElement {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  if (status === 'ARCHIVED') return <Badge variant="outline">{label}</Badge>;
  return (
    <Badge intent={status === 'PUBLISHED' ? 'success' : 'neutral'} variant="soft" dot>
      {label}
    </Badge>
  );
}
