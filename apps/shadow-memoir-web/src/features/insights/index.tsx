import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, Card, SegmentedControl, Skeleton, Statistic } from '@shadow-library/ui';

import { Screen, screenStyles } from '@/components/ScreenLayout';
import { type Bar, type InsightPeriod, type TrendSeries, useInsights } from '@/lib/data';

import styles from './insights.module.css';

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
        <span className={styles.periodNote}>{insights.data?.periodNote ?? ' '}</span>
        <span className={styles.toolbarEnd}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/ai">Ask the coach about this</Link>
          </Button>
        </span>
      </div>

      {insights.isPending || !insights.data ? (
        <>
          <Skeleton.Card />
          <Skeleton.List rows={6} />
        </>
      ) : null}

      {insights.data ? (
        <>
          <div className={styles.kpis}>
            {insights.data.kpis.map(kpi => (
              <Card key={kpi.id} padding="md">
                <Statistic
                  label={kpi.label}
                  value={kpi.value}
                  unit={kpi.unit}
                  delta={kpi.delta}
                  positiveIs={kpi.positiveIs}
                  comparison={kpi.comparison}
                  format={kpi.format}
                  size="md"
                />
              </Card>
            ))}
          </div>

          <div className={styles.pair}>
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Adherence by quest</h2>
              <p className={screenStyles.cardBody}>Share of scheduled occurrences kept. Partials count as half.</p>
              <Meters bars={insights.data.adherenceByQuest} max={100} unitLabel="per cent kept" />
            </Card>

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Adherence by weekday</h2>
              <p className={screenStyles.cardBody}>{insights.data.weekdayNote}</p>
              <Columns bars={insights.data.adherenceByWeekday} unitLabel="per cent kept" />
            </Card>
          </div>

          <div className={styles.pair}>
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Experience earned, by month</h2>
              <Columns bars={insights.data.xpByMonth} unitLabel="XP" />
              <p className={styles.note}>{insights.data.xpNote}</p>
            </Card>

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Reasons given on missed and partial days</h2>
              <Meters bars={insights.data.reasons} max={Math.max(...insights.data.reasons.map(bar => bar.value))} unitLabel="times" />
              <p className={styles.note}>{insights.data.reasonsNote}</p>
            </Card>
          </div>

          <div className={styles.pair}>
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Spending by category</h2>
              <Meters bars={insights.data.spend} max={Math.max(...insights.data.spend.map(bar => bar.value))} unitLabel="spent" />
              <p className={styles.note}>{insights.data.spendNote}</p>
            </Card>

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Body and health</h2>
              <div className={styles.trends}>
                {insights.data.trends.map(trend => (
                  <Trend key={trend.id} trend={trend} />
                ))}
              </div>
            </Card>
          </div>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>These numbers are yours alone</h2>
            <p className={screenStyles.cardBody}>
              Every comparison here is you against your own history, and every one of them is optional to look at. Nothing on this screen is shared, published or ranked.
            </p>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Meters({ bars, max, unitLabel }: { bars: Bar[]; max: number; unitLabel: string }): ReactElement {
  return (
    <ul className={styles.meters}>
      {bars.map(bar => (
        <li key={bar.id}>
          <div className={styles.meterHead}>
            <span>{bar.label}</span>
            <span className={styles.meterValue}>{bar.caption}</span>
          </div>
          <div className={styles.track} role="img" aria-label={`${bar.label}: ${bar.caption} ${unitLabel}`}>
            <span className={styles.fill} style={{ width: `${max === 0 ? 0 : Math.round((bar.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Columns({ bars, unitLabel }: { bars: Bar[]; unitLabel: string }): ReactElement {
  const max = Math.max(...bars.map(bar => bar.value), 1);
  return (
    <div className={styles.columns}>
      {bars.map(bar => (
        <div key={bar.id} className={styles.columnItem}>
          <span
            className={styles.columnBar}
            style={{ height: `${Math.round((bar.value / max) * 100)}%`, opacity: 0.35 + (bar.value / max) * 0.65 }}
            role="img"
            aria-label={`${bar.label}: ${bar.caption} ${unitLabel}`}
          />
          <span className={styles.columnLabel}>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ trend }: { trend: TrendSeries }): ReactElement {
  const max = Math.max(...trend.points, 1);
  return (
    <div>
      <div className={styles.trendHead}>
        <span>{trend.name}</span>
        <span className={styles.meterValue}>{trend.value}</span>
      </div>
      <div className={styles.spark} role="img" aria-label={`${trend.name} over the period: ${trend.value}`}>
        {trend.points.map((point, index) => (
          <span key={index} className={styles.sparkBar} style={{ height: `${Math.round((point / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}
