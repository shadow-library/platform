import { type ReactElement, type ReactNode } from 'react';
import { Statistic, type StatisticPositiveIs } from '@shadow-library/ui';

import { COST_LABELS, CostLabel, KpiCard, usdFormat } from '@/features/shared';
import { type UsageTotalsResponse } from '@/lib';

import { averageListCost, comparisonLabel, perCallFormat, type UsagePeriod, type UsageTotalsDeltas } from './usage-report';
import styles from './Usage.module.css';

interface UsageTotalsProps {
  totals: UsageTotalsResponse | undefined;
  deltas: UsageTotalsDeltas;
  period: UsagePeriod | undefined;
  loading: boolean;
}

interface TotalCardProps {
  name: string;
  title: ReactNode;
  value: number;
  format?: Intl.NumberFormatOptions;
  delta: number | undefined;
  positiveIs: StatisticPositiveIs;
  comparison: string | undefined;
  loading: boolean;
}

const RANGE_LABEL = 'In this range';

function TotalCard({ name, title, value, format, delta, positiveIs, comparison, loading }: TotalCardProps): ReactElement {
  return (
    <KpiCard name={`${name}, ${RANGE_LABEL.toLowerCase()}`} title={title}>
      <Statistic
        label={RANGE_LABEL}
        value={value}
        {...(format && { format })}
        {...(delta !== undefined && { delta, positiveIs })}
        {...(comparison && { comparison })}
        loading={loading}
      />
    </KpiCard>
  );
}

export function UsageTotals({ totals, deltas, period, loading }: UsageTotalsProps): ReactElement {
  const billed = totals?.billedCostUsd ?? 0;
  const list = totals?.listCostUsd ?? 0;
  const average = (totals && averageListCost(totals)) ?? 0;
  const comparison = period ? comparisonLabel(period) : undefined;
  const shared = { positiveIs: 'down' as const, comparison, loading };
  return (
    <div className={styles.totals}>
      <TotalCard name={COST_LABELS.billed} title={<CostLabel kind="billed" />} value={billed} format={usdFormat(billed)} delta={deltas.billed} {...shared} />
      <TotalCard name={COST_LABELS.list} title={<CostLabel kind="list" />} value={list} format={usdFormat(list)} delta={deltas.list} {...shared} />
      <TotalCard name="Calls" title="Calls" value={totals?.calls ?? 0} delta={deltas.calls} {...shared} positiveIs="neither" />
      <TotalCard
        name="Avg API-price cost per call"
        title="Avg API-price cost per call"
        value={average}
        format={perCallFormat(average)}
        delta={deltas.averageListCost}
        {...shared}
      />
    </div>
  );
}
