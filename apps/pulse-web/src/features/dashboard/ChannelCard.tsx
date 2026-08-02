/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';
import { Card, cn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { formatNumber, successRate } from '@/features/shared';
import { type NotificationDeliveryStats } from '@/lib';

import styles from './Dashboard.module.css';

/** One channel's today stats: a success bar plus a total/succeeded/failed/pending grid. */
export default function ChannelCard({ label, stats }: { label: string; stats: NotificationDeliveryStats }): ReactElement {
  const ratePercent = stats.total > 0 ? (stats.succeeded / stats.total) * 100 : 0;

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.channelHead}>
          <span className={styles.channelName}>{label}</span>
          <span className={styles.channelRate}>{successRate(stats.total, stats.succeeded)} success</span>
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${ratePercent}%` }} />
        </div>
        <div className={styles.metricGrid}>
          <Metric label="Total" value={stats.total} />
          <Metric label="Succeeded" value={stats.succeeded} tone={styles.success} />
          <Metric label="Failed" value={stats.failed} tone={styles.danger} />
          <Metric label="Pending" value={stats.pending} tone={styles.warning} />
        </div>
      </Card.Body>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }): ReactElement {
  return (
    <div>
      <div className={styles.metricLabel}>{label}</div>
      <div className={cn(styles.metricValue, tone)}>{formatNumber(value)}</div>
    </div>
  );
}
