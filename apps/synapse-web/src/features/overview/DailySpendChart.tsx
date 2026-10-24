import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { Alert, Card, Chart, EmptyState, SegmentedControl, Spinner } from '@shadow-library/ui';

import { COST_LABELS, COST_PHRASES, formatUsd, SectionHeader } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type UsageSeriesResponse } from '@/lib';

import { dailySpendOf, formatDay, formatUsdTick, type SpendMeasure } from './daily-spend';
import styles from './Overview.module.css';
import { SPEND_RANGES, type SpendRange } from './overview-periods';
import { dailySpendOptions, DEFAULT_SPEND_RANGE } from './overview-queries';

const MEASURES: readonly SpendMeasure[] = ['billed', 'list'];

function isMeasure(value: string): value is SpendMeasure {
  return (MEASURES as readonly string[]).includes(value);
}

function rangeOf(value: string): SpendRange | undefined {
  return SPEND_RANGES.find(range => String(range) === value);
}

interface ChartBodyProps {
  data: UsageSeriesResponse;
  days: number;
  measure: SpendMeasure;
  stale: boolean;
  onShowList: () => void;
}

function ChartBody({ data, days, measure, stale, onShowList }: ChartBodyProps): ReactElement {
  const spend = dailySpendOf(data, measure);
  if (spend.series.length === 0) return <EmptyState size="inline" title={`No calls in the last ${days} days`} description="Spend appears here once apps call Synapse." />;
  if (spend.total === 0 && measure === 'billed')
    return (
      <EmptyState
        size="inline"
        title={`Nothing was billed in the last ${days} days`}
        description="Subscription and local calls cost nothing here. API-price cost shows what they would cost at the providers’ list prices."
        action={{ label: 'Show API-price cost', onClick: onShowList }}
      />
    );
  return (
    <div className={stale ? styles.stale : undefined} aria-busy={stale || undefined}>
      <Chart
        type="bar"
        stacked
        data={spend.data}
        series={spend.series}
        formatValue={formatUsd}
        formatTick={formatUsdTick}
        formatX={formatDay}
        aria-label={`Daily ${COST_PHRASES[measure]} by app over the last ${days} days`}
      />
    </div>
  );
}

export function DailySpendChart({ today }: { today: string }): ReactElement {
  const [measure, setMeasure] = useState<SpendMeasure>('billed');
  const [range, setRange] = useState<SpendRange>(DEFAULT_SPEND_RANGE);
  const series = useQuery({ ...dailySpendOptions(today, range), placeholderData: keepPreviousData });
  const days = series.data?.days.length ?? range;

  const body = ((): ReactElement => {
    if (series.error)
      return (
        <Alert intent="danger" title="Couldn’t load daily spend">
          {series.error.message}
        </Alert>
      );
    if (!series.data)
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading daily spend" />
        </div>
      );
    return <ChartBody data={series.data} days={days} measure={measure} stale={series.isPlaceholderData} onShowList={() => setMeasure('list')} />;
  })();

  return (
    <section className={styles.section} aria-label="Daily spend by app">
      <SectionHeader
        title="Daily spend by app"
        subtitle={`${COST_LABELS[measure]} per UTC day over the last ${days} days${series.isPlaceholderData ? `; loading ${range} days` : ''}.`}
        action={
          <div className={styles.chartControls}>
            <SegmentedControl size="sm" value={measure} onValueChange={value => isMeasure(value) && setMeasure(value)} aria-label="Cost to chart">
              {MEASURES.map(option => (
                <SegmentedControl.Item key={option} value={option}>
                  {COST_LABELS[option]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
            <SegmentedControl size="sm" value={String(range)} onValueChange={value => setRange(rangeOf(value) ?? range)} aria-label="Days to chart">
              {SPEND_RANGES.map(option => (
                <SegmentedControl.Item key={option} value={String(option)}>
                  {option} days
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          </div>
        }
      />
      <Card padding="md">
        <Card.Body>{body}</Card.Body>
      </Card>
    </section>
  );
}
