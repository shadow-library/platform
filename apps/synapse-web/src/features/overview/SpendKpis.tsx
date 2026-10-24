import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { Alert, Card, Statistic, type StatisticPositiveIs } from '@shadow-library/ui';

import { COST_LABELS, CostLabel, formatNumber, usdFormat } from '@/features/shared';
import { budgetStatusQueryOptions, isNoActiveCatalog, type UsageTotalsResponse } from '@/lib';

import { budgetAttentionOf } from './budget-attention';
import styles from './Overview.module.css';
import { changeFrom, type MonthToDate } from './overview-periods';
import { monthUsageOptions } from './overview-queries';

type TotalField = keyof Pick<UsageTotalsResponse, 'billedCostUsd' | 'listCostUsd' | 'calls'>;

interface MonthMetric {
  field: TotalField;
  name: string;
  title: ReactNode;
  positiveIs: StatisticPositiveIs;
  money: boolean;
}

const MONTH_METRICS: readonly MonthMetric[] = [
  { field: 'billedCostUsd', name: COST_LABELS.billed, title: <CostLabel kind="billed" />, positiveIs: 'down', money: true },
  { field: 'listCostUsd', name: COST_LABELS.list, title: <CostLabel kind="list" />, positiveIs: 'down', money: true },
  { field: 'calls', name: 'Calls', title: 'Calls', positiveIs: 'neither', money: false },
];

/** The Statistic announces only its own label, so the group names the metric that the card header shows. */
function KpiCard({ name, title, children }: { name: string; title: ReactNode; children: ReactNode }): ReactElement {
  return (
    <Card padding="md">
      <Card.Header title={title} />
      <Card.Body className={styles.kpiBody} role="group" aria-label={name}>
        {children}
      </Card.Body>
    </Card>
  );
}

function BudgetKpi(): ReactElement {
  const status = useQuery(budgetStatusQueryOptions());
  const noCatalog = status.error !== null && isNoActiveCatalog(status.error);
  const summary = status.data ? budgetAttentionOf(status.data) : null;

  const note = ((): ReactNode => {
    if (noCatalog) return 'No catalog is live yet, so no budgets apply.';
    if (!summary) return null;
    if (summary.total === 0) return <Link to="/budgets">No budgets are set</Link>;
    return <Link to="/budgets">{summary.total === 1 ? 'View the 1 budget' : `View all ${formatNumber(summary.total)} budgets`}</Link>;
  })();

  return (
    <KpiCard name="Budgets at or near their limit" title="Budgets">
      <Statistic label="At or near their limit" value={summary?.items.length ?? 0} loading={status.isPending} error={status.isError && !noCatalog} />
      {note ? <p className={styles.kpiNote}>{note}</p> : null}
    </KpiCard>
  );
}

export function SpendKpis({ month }: { month: MonthToDate }): ReactElement {
  const current = useQuery(monthUsageOptions(month.current));
  const previous = useQuery({ ...monthUsageOptions(month.previous ?? month.current), enabled: month.previous !== null });
  const baseline = month.previous ? previous.data?.totals : undefined;

  return (
    <>
      <div className={styles.kpis}>
        {MONTH_METRICS.map(metric => {
          const value = current.data?.totals[metric.field] ?? 0;
          const delta = changeFrom(current.data?.totals[metric.field], baseline?.[metric.field]);
          return (
            <KpiCard key={metric.field} name={`${metric.name}, month to date`} title={metric.title}>
              <Statistic
                label="Month to date"
                value={value}
                {...(metric.money && { format: usdFormat(value) })}
                {...(delta !== undefined && { delta, positiveIs: metric.positiveIs, ...(month.comparison && { comparison: month.comparison }) })}
                loading={current.isPending}
                error={current.isError}
              />
            </KpiCard>
          );
        })}
        <BudgetKpi />
      </div>
      {current.error ? (
        <Alert intent="danger" title="Couldn’t load this month’s spend" className={styles.notice}>
          {current.error.message}
        </Alert>
      ) : null}
    </>
  );
}
