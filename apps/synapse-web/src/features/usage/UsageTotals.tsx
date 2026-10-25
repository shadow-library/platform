import { type ReactElement } from 'react';
import { Card, Statistic, type StatisticPositiveIs, Tooltip } from '@shadow-library/ui';

import { COST_EXPLANATIONS, COST_LABELS, COST_PHRASES, type CostKind, InfoIcon, usdFormat } from '@/features/shared';
import costStyles from '@/features/shared/CostLabel.module.css';
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
  label: string;
  value: number;
  format?: Intl.NumberFormatOptions;
  delta: number | undefined;
  positiveIs: StatisticPositiveIs;
  comparison: string | undefined;
  loading: boolean;
  cost?: CostKind;
}

function TotalCard({ label, value, format, delta, positiveIs, comparison, loading, cost }: TotalCardProps): ReactElement {
  return (
    <Card padding="md">
      <Card.Body className={styles.total}>
        <Statistic
          label={label}
          value={value}
          {...(format && { format })}
          {...(delta !== undefined && { delta, positiveIs })}
          {...(comparison && { comparison })}
          loading={loading}
        />
        {cost ? (
          <Tooltip content={COST_EXPLANATIONS[cost]}>
            <button type="button" className={`${costStyles.info} ${styles.totalInfo}`} aria-label={`What ${COST_PHRASES[cost]} means`}>
              <InfoIcon />
            </button>
          </Tooltip>
        ) : null}
      </Card.Body>
    </Card>
  );
}

export function UsageTotals({ totals, deltas, period, loading }: UsageTotalsProps): ReactElement {
  const billed = totals?.billedCostUsd ?? 0;
  const list = totals?.listCostUsd ?? 0;
  const average = (totals && averageListCost(totals)) ?? 0;
  const comparison = period ? comparisonLabel(period) : undefined;
  return (
    <div className={styles.totals}>
      <TotalCard
        label={COST_LABELS.billed}
        cost="billed"
        value={billed}
        format={usdFormat(billed)}
        delta={deltas.billed}
        positiveIs="down"
        comparison={comparison}
        loading={loading}
      />
      <TotalCard label={COST_LABELS.list} cost="list" value={list} format={usdFormat(list)} delta={deltas.list} positiveIs="down" comparison={comparison} loading={loading} />
      <TotalCard label="Calls" value={totals?.calls ?? 0} delta={deltas.calls} positiveIs="neither" comparison={comparison} loading={loading} />
      <TotalCard
        label="Avg API-price cost per call"
        value={average}
        format={perCallFormat(average)}
        delta={deltas.averageListCost}
        positiveIs="down"
        comparison={comparison}
        loading={loading}
      />
    </div>
  );
}
