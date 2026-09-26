import { type ReactElement } from 'react';
import { Progress, Skeleton } from '@shadow-library/ui';

import { useAiQuotaQuery } from '@/lib/apis';
import { messageTime } from '@/lib/format';
import { formatUsd, quotaMeter } from '@/lib/usage';

import styles from './usage.module.css';
import { StatCard, StatNote, StatValue } from './UsageParts';

export function QuotaMeter(): ReactElement {
  const quotaQuery = useAiQuotaQuery();
  const quota = quotaQuery.data;

  if (quotaQuery.error) {
    return (
      <StatCard label="Usage limit · your account">
        <StatNote>Couldn’t load your limit: {quotaQuery.error.message}</StatNote>
      </StatCard>
    );
  }
  if (!quota) {
    return (
      <StatCard label="Usage limit · your account">
        <Skeleton shape="rect" height={34} />
      </StatCard>
    );
  }

  const meter = quotaMeter(quota);
  const label = `${meter.windowLabel} · your account`;
  if (!meter.spend && !meter.calls) {
    return (
      <StatCard label={label} footer={<StatNote>No limit is set for your account.</StatNote>}>
        <StatValue value={formatUsd(quota.costUsd)} unit={`${quota.calls.toLocaleString()} calls`} />
      </StatCard>
    );
  }

  const resets = meter.resetsAt ? `resets ${messageTime(meter.resetsAt)}` : 'nothing counted right now';
  const callsNote = meter.calls ? `${meter.calls.used.toLocaleString()} of ${meter.calls.limit.toLocaleString()} calls` : `${quota.calls.toLocaleString()} calls`;
  const headline = meter.spend ? (
    <StatValue value={formatUsd(meter.spend.used)} unit={`of ${formatUsd(meter.spend.limit)}`} />
  ) : (
    <StatValue value={meter.calls?.used.toLocaleString()} unit={`of ${meter.calls?.limit.toLocaleString()} calls`} />
  );

  return (
    <StatCard label={label}>
      <div className={styles.quotaValue}>{headline}</div>
      <Progress value={meter.pct} intent={meter.intent} size="md" aria-label={`${meter.pct}% of your ${meter.windowLabel.toLowerCase()} used`} />
      <div className={styles.quotaNote}>
        <StatNote>{meter.spend ? `${callsNote} · ${resets}` : resets}</StatNote>
      </div>
    </StatCard>
  );
}
