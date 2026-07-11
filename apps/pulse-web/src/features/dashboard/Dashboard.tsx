/**
 * Importing npm packages
 */
import { Alert, Card, Spinner, Statistic } from '@shadow-library/ui';
import clsx from 'clsx';
import { type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { type NotificationDeliveryStats, useStatsQuery } from '@/lib';
import { formatDay, successRate } from '@/features/shared';

import ChannelCard from './ChannelCard';
import VolumeChart from './VolumeChart';
import styles from './Dashboard.module.css';

export default function Dashboard(): ReactElement {
  const { data, isLoading, error } = useStatsQuery();

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load dashboard">
        {error.message}
      </Alert>
    );
  if (isLoading || !data)
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );

  const { today, trend } = data;
  const channels: { label: string; stats: NotificationDeliveryStats }[] = [
    { label: 'EMAIL', stats: today.channels.email },
    { label: 'SMS', stats: today.channels.sms },
    { label: 'PUSH', stats: today.channels.push },
  ];
  const rangeLabel = `${formatDay(trend.fromDate)} – ${formatDay(trend.toDate)}`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Delivery health</h1>
        <p className={styles.subtitle}>At-a-glance delivery for today, and the 14-day trend across all channels.</p>
      </header>

      <div className={styles.sectionHead}>
        <h2 className={styles.h3}>Today</h2>
        <span className={styles.muted}>Success rate {successRate(today.overall.total, today.overall.succeeded)}</span>
      </div>
      <div className={styles.kpiGrid}>
        <Card padding="md">
          <Statistic label="Total sent" value={today.overall.total} size="lg" />
        </Card>
        <Card padding="md">
          <Statistic label="Succeeded" value={today.overall.succeeded} size="lg" />
        </Card>
        <Card padding="md">
          <Statistic label="Failed" value={today.overall.failed} size="lg" />
        </Card>
        <Card padding="md">
          <Statistic label="Pending" value={today.overall.pending} size="lg" />
        </Card>
      </div>

      <h2 className={styles.sectionTitle}>By channel</h2>
      <div className={styles.channelGrid}>
        {channels.map(channel => (
          <ChannelCard key={channel.label} label={channel.label} stats={channel.stats} />
        ))}
      </div>

      <Card padding="lg">
        <div className={styles.trendHead}>
          <h2 className={styles.h3}>Daily volume trend</h2>
          <span className={styles.muted}>{rangeLabel}</span>
        </div>
        <div className={styles.legend}>
          <LegendItem dotClass={styles.dotSuccess} label="Succeeded" />
          <LegendItem dotClass={styles.dotWarning} label="Pending" />
          <LegendItem dotClass={styles.dotDanger} label="Failed" />
        </div>
        <VolumeChart stats={trend.stats} />
      </Card>
    </div>
  );
}

function LegendItem({ dotClass, label }: { dotClass?: string; label: string }): ReactElement {
  return (
    <span className={styles.legendItem}>
      <span className={clsx(styles.legendDot, dotClass)} />
      {label}
    </span>
  );
}
