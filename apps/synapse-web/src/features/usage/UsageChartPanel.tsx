import { type UseQueryResult } from '@tanstack/react-query';
import { type ReactElement } from 'react';
import { Alert, Card, Chart, EmptyState, Spinner } from '@shadow-library/ui';

import { chartDayFormatter, formatUsd, formatUsdTick, SectionHeader, useMinuteClock } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type ApiError, type UsageSeriesResponse } from '@/lib';

import { BASIS_NOUNS, type CostBasis, usageChart, usageKeyName, type UsageNames, type UsagePeriod, usageSlotKeys } from './usage-report';
import styles from './Usage.module.css';
import { USAGE_GROUP_LABELS, type UsageGroup, usagePeriodText, utcToday } from './usage-search';

interface UsageChartPanelProps {
  query: UseQueryResult<UsageSeriesResponse, ApiError>;
  group: UsageGroup;
  basis: CostBasis;
  names: UsageNames;
  period: UsagePeriod | undefined;
}

export function UsageChartPanel({ query, group, basis, names, period }: UsageChartPanelProps): ReactElement {
  const now = useMinuteClock();
  const today = now === null ? null : utcToday(new Date(now));
  const formatDay = chartDayFormatter(today);
  const noun = BASIS_NOUNS[basis];
  const title = `Daily ${noun} by ${USAGE_GROUP_LABELS[group].toLowerCase()}`;

  const body = (): ReactElement => {
    if (query.error)
      return (
        <Alert intent="danger" title="Couldn't load the daily chart">
          {query.error.message}
        </Alert>
      );
    if (!query.data)
      return (
        <div className={controls.loading}>
          <Spinner label="Loading the daily chart" />
        </div>
      );
    const chart = usageChart(query.data, basis, key => usageKeyName(group, key, names), undefined, usageSlotKeys(group, names));
    return (
      <Chart
        type="bar"
        stacked
        data={chart.data}
        series={chart.series}
        formatValue={formatUsd}
        formatTick={formatUsdTick}
        formatX={formatDay}
        aria-label={title}
        emptyState={<EmptyState size="inline" title={`No ${noun} in this range`} description="Try a longer range or clear the filters." />}
      />
    );
  };

  return (
    <section className={styles.section} aria-label={title}>
      <SectionHeader title={title} subtitle={period ? `${usagePeriodText(period, today)}, UTC days.` : undefined} />
      <Card padding="md">
        <Card.Body>{body()}</Card.Body>
      </Card>
    </section>
  );
}
