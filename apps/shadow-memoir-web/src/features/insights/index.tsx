import { Link } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Button, Card, SegmentedControl, Skeleton, Statistic } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, screenStyles } from '@/components/ScreenLayout';
import { type Bar, type InsightKpi, type InsightPeriod, type InsightsView, type TrendSeries, useInsights } from '@/lib/data';

import styles from './insights.module.css';

export const PLOT_HEIGHT = 148;
const MAX_SPARK_POINTS = 60;

export function InsightsScreen(): ReactElement {
  const [period, setPeriod] = useState<InsightPeriod>('90');
  const insights = useInsights(period);

  return (
    <Screen title="Insights" subtitle="Your history against itself. There are no leaderboards, no percentile ranks and no comparison with anyone else.">
      <div className={styles.toolbar}>
        <SegmentedControl value={period} onValueChange={value => setPeriod(value as InsightPeriod)}>
          <SegmentedControl.Item value="30">30 days</SegmentedControl.Item>
          <SegmentedControl.Item value="90">90 days</SegmentedControl.Item>
          <SegmentedControl.Item value="365">Year</SegmentedControl.Item>
        </SegmentedControl>
        <span className={styles.periodNote} title={insights.data?.periodNote}>
          {insights.data?.periodNote ?? ' '}
        </span>
        <span className={styles.toolbarEnd}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/ai">Ask the coach about this</Link>
          </Button>
        </span>
      </div>

      <DataState query={insights} skeleton={<InsightsSkeleton />}>
        {data => <InsightsContent data={data} />}
      </DataState>
    </Screen>
  );
}

function InsightsSkeleton(): ReactElement {
  return (
    <>
      <Skeleton.Card />
      <Skeleton.List rows={6} />
    </>
  );
}

function KpiTile({ kpi }: { kpi: InsightKpi }): ReactElement {
  return (
    <Card padding="md">
      <Card.Body>
        {kpi.value === null ? (
          <div>
            <p className={styles.kpiLabel}>{kpi.label}</p>
            <p className={styles.kpiEmptyValue}>—</p>
          </div>
        ) : (
          <div title={kpi.exactValue}>
            <Statistic label={kpi.label} value={kpi.value} unit={kpi.unit} delta={kpi.delta} positiveIs={kpi.positiveIs} format={kpi.format} size="md" />
          </div>
        )}
        <p className={styles.kpiCaption}>{kpi.caption}</p>
      </Card.Body>
    </Card>
  );
}

function InsightsContent({ data }: { data: InsightsView }): ReactElement {
  const weekdayEmpty = data.adherenceByWeekday.every(bar => !bar.hasEntries);
  const monthEmpty = data.xpByMonth.every(bar => !bar.hasEntries);

  return (
    <div className={styles.content}>
      <div className={styles.kpis}>
        {data.kpis.map(kpi => (
          <KpiTile key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className={styles.pair}>
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Adherence by quest</h2>
            <p className={screenStyles.cardBody}>Share of scheduled occurrences kept. Partials count as half.</p>
            {data.adherenceByQuest.length === 0 ? <p className={styles.emptyNote}>No quests logged in this period yet.</p> : <Meters bars={data.adherenceByQuest} max={100} />}
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Adherence by weekday</h2>
            <p className={screenStyles.cardBody}>{data.weekdayNote}</p>
            {weekdayEmpty ? null : <Columns bars={data.adherenceByWeekday} label="Adherence by weekday" />}
          </Card.Body>
        </Card>
      </div>

      <div className={styles.pair}>
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Experience earned, by month</h2>
            {monthEmpty ? null : <Columns bars={data.xpByMonth} label="Experience earned, by month" />}
            <p className={styles.note}>{data.xpNote}</p>
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Reasons given on missed and partial days</h2>
            <Meters bars={data.reasons} max={Math.max(...data.reasons.map(bar => bar.value), 1)} />
            <p className={styles.note}>{data.reasonsNote}</p>
          </Card.Body>
        </Card>
      </div>

      <div className={styles.pair}>
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Spending by category</h2>
            <Meters bars={data.spend} max={Math.max(...data.spend.map(bar => bar.value), 1)} />
            <p className={styles.note}>{data.spendNote}</p>
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Body and health</h2>
            {data.trends.length === 0 ? (
              <p className={styles.emptyNote}>Not enough weight or health entries yet to show a trend.</p>
            ) : (
              <div className={styles.trends}>
                {data.trends.map(trend => (
                  <Trend key={trend.id} trend={trend} />
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      <Card padding="md">
        <Card.Body>
          <h2 className={screenStyles.cardTitle}>These numbers are yours alone</h2>
          <p className={screenStyles.cardBody}>
            Every comparison here is you against your own history, and every one of them is optional to look at. Nothing on this screen is shared, published or ranked.
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}

function Meters({ bars, max }: { bars: Bar[]; max: number }): ReactElement {
  return (
    <ul className={styles.meters}>
      {bars.map(bar => (
        <li key={bar.id}>
          <div className={styles.meterHead}>
            <span>{bar.label}</span>
            <span className={styles.meterValue}>{bar.caption}</span>
          </div>
          <div className={styles.track} role="img" aria-label={bar.ariaLabel}>
            <span className={styles.fill} style={{ width: `${max === 0 ? 0 : Math.round((bar.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function barHeightPx(value: number, max: number): number {
  return Math.max(3, Math.round((value / max) * PLOT_HEIGHT));
}

function Columns({ bars, label }: { bars: Bar[]; label: string }): ReactElement {
  const max = Math.max(...bars.map(bar => bar.value), 1);
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    row.scrollLeft = row.scrollWidth;

    const measure = (): void => setOverflowing(row.scrollWidth > row.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [bars]);

  return (
    <div className={styles.columns} ref={ref} role="group" aria-label={label} tabIndex={overflowing ? 0 : undefined}>
      {bars.map(bar => (
        <div key={bar.id} className={styles.columnItem}>
          <div className={styles.plot}>
            <span className={styles.columnBar} style={{ height: `${barHeightPx(bar.value, max)}px` }} role="img" aria-label={bar.ariaLabel} />
          </div>
          <span className={styles.columnLabel}>
            {bar.label}
            {bar.hasEntries ? <span className={styles.columnValue}>{bar.caption}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Trend({ trend }: { trend: TrendSeries }): ReactElement {
  const points = trend.points.length > MAX_SPARK_POINTS ? downsample(trend.points, MAX_SPARK_POINTS) : trend.points;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min;
  return (
    <div>
      <div className={styles.trendHead}>
        <span>{trend.name}</span>
        <span className={styles.meterValue}>{trend.value}</span>
      </div>
      <div className={styles.spark} role="img" aria-label={`${trend.name} over the period: ${trend.value}`}>
        {points.map((point, index) => (
          <span key={index} className={styles.sparkBar} style={{ height: `${range === 0 ? 50 : Math.round(((point - min) / range) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

/** One representative point per bucket (not an average), with the series' own final point always kept. */
function downsample(points: number[], target: number): number[] {
  const step = points.length / target;
  const sampled = Array.from({ length: target }, (_, index) => points[Math.min(points.length - 1, Math.floor(index * step))] as number);
  sampled[sampled.length - 1] = points[points.length - 1] as number;
  return sampled;
}
