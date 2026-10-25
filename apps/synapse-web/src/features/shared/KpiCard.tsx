import { type ReactElement, type ReactNode } from 'react';
import { Card } from '@shadow-library/ui';

import styles from './KpiCard.module.css';

interface KpiCardProps {
  name: string;
  title: ReactNode;
  children: ReactNode;
}

/** The Statistic announces only its own label, so the group names the metric that the card header shows. */
export function KpiCard({ name, title, children }: KpiCardProps): ReactElement {
  return (
    <Card padding="md">
      <Card.Header title={title} />
      <Card.Body className={styles.body} role="group" aria-label={name}>
        {children}
      </Card.Body>
    </Card>
  );
}
