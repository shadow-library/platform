import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Progress, Skeleton, toast } from '@shadow-library/ui';

import { SparkBars } from '@/components/SparkBars';
import { formatMetricValue, type HealthMetricState, needsConfirmation, type ThresholdOffer, todayISODate, useCommand, useHealth, useQuickLogCommand } from '@/lib/data';

import styles from './quick-logs.module.css';

function MetricCard({ metric, date }: { metric: HealthMetricState; date: string }): ReactElement {
  const command = useQuickLogCommand();
  const [entry, setEntry] = useState(metric.entry ? String(metric.entry.value) : '');

  const save = (): void => {
    const parsed = Number(entry);
    if (!Number.isFinite(parsed)) return;
    command.mutate({ type: 'health.save', key: metric.definition.key, date, value: parsed }, { onSuccess: result => toast.success(result.message) });
  };

  return (
    <Card padding="md">
      <div className={styles.pad}>
        <div className={styles.metricHead}>
          <div>
            <h3 className={styles.cardTitle}>{metric.definition.name}</h3>
            <p className={styles.metricValue}>
              {metric.entry === null ? '—' : formatMetricValue(metric.entry.value, { ...metric.definition, unit: '' })}
              {metric.definition.unit && <span className={styles.metricUnit}> {metric.definition.unit}</span>}
            </p>
            <p className={styles.hint}>{metric.meta}</p>
          </div>
          {metric.offer && (
            <Badge variant="soft" intent={metric.offer.met ? 'success' : 'info'}>
              {metric.offer.met ? 'Threshold met' : `${Math.round(metric.offer.ratio * 100)}% of ${formatMetricValue(metric.offer.thresholdValue, metric.definition)}`}
            </Badge>
          )}
        </div>

        {metric.offer && (
          <div style={{ marginTop: 12 }}>
            <Progress value={metric.offer.ratio * 100} max={100} aria-label={`${metric.definition.name} against its quest threshold`} />
            <p className={styles.hint} style={{ marginTop: 6 }}>
              {metric.offer.note}
            </p>
          </div>
        )}

        <div className={styles.metricEntry}>
          <Input
            className={styles.metricInput}
            size="sm"
            inputMode="decimal"
            value={entry}
            onValueChange={setEntry}
            suffix={metric.definition.unit || undefined}
            aria-label={`${metric.definition.name} for today`}
          />
          <Button size="sm" variant="secondary" loading={command.isPending} onClick={save}>
            Save
          </Button>
        </div>

        <SparkBars values={metric.last14Days.map(day => day.value)} label={`${metric.definition.name}, last 14 days`} highlightLast />
        <div className={styles.axis}>
          <span>14 days</span>
          <span>{metric.trendLabel}</span>
        </div>
      </div>
    </Card>
  );
}

export function HealthMetricsScreen(): ReactElement {
  const date = todayISODate();
  const health = useHealth(date);
  const command = useQuickLogCommand();
  const questCommand = useCommand();

  const view = health.data;
  const offers = view?.metrics.flatMap(metric => (metric.offer?.met ? [{ definition: metric.definition, offer: metric.offer }] : [])) ?? [];

  /**
   * Consent, never automation (PRD §2.6): the offer the server derives names the quest, and accepting it
   * dispatches the owner's own `quest.complete`. Without a server-side threshold behind the offer there is
   * no occurrence to address, so the local acknowledgement is all that is left to do.
   */
  const accept = (offer: ThresholdOffer): void => {
    if (offer.questId === null) {
      command.mutate({ type: 'health.acceptOffer', key: offer.metricKey, date }, { onSuccess: result => toast.success(result.message) });
      return;
    }
    questCommand.mutate(
      { type: 'quest.complete', occurrenceId: `${offer.questId}:${date}` },
      { onSuccess: result => void (needsConfirmation(result) || toast.success(result.message)) },
    );
  };

  if (health.isLoading || !view) return <Skeleton.Card />;

  return (
    <section className={styles.screen} aria-labelledby="health-title">
      <h2 className={styles.cardTitle} id="health-title">
        Body &amp; health
      </h2>

      {offers.map(({ definition, offer }) => (
        <Alert
          key={definition.key}
          intent="success"
          title={`${formatMetricValue(offer.thresholdValue, definition)} reached — “${offer.questTitle}” can be completed`}
          action={{ label: offer.xp > 0 ? `Complete the quest · +${offer.xp} XP` : 'Complete the quest', onClick: () => accept(offer) }}
        >
          You logged {formatMetricValue(offer.currentValue, definition)}. The quest is yours to complete: Shadow Memoir never completes a quest for you, even when the threshold is
          met.
        </Alert>
      ))}

      <div className={styles.metricGrid}>
        {view.metrics.map(metric => (
          <MetricCard key={metric.definition.key} metric={metric} date={date} />
        ))}
      </div>

      <div className={styles.split}>
        <Card padding="md">
          <div className={styles.pad}>
            <h3 className={styles.cardTitle}>Recent entries</h3>
            {view.history.map(row => (
              <div key={`${row.date}-${row.text}`} className={styles.row}>
                <span className={styles.rowStamp}>{row.date}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowMeta} style={{ marginTop: 0 }}>
                    {row.text}
                  </span>
                </span>
                {row.badge && (
                  <Badge variant="outline" size="sm">
                    {row.badge}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>All of this is optional</h3>
              <p className={styles.prose}>
                Every metric here is typed by you, by hand. Blank days are blank — they are not zeros, they do not break a streak, and they never cost HP. Only quests with an
                explicit threshold read these numbers.
              </p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Quest thresholds</h3>
              <ul className={styles.list}>
                {view.thresholds.map(threshold => (
                  <li key={threshold.label}>{threshold.label}</li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
