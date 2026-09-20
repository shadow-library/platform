import { type FormEvent, type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Input, Progress, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { SparkBars } from '@/components/SparkBars';
import {
  failureCopy,
  formatMetricValue,
  type HealthMetricState,
  type HealthView,
  metricDisplay,
  metricInputValue,
  notifyOutcome,
  readMetricEntry,
  type ThresholdOffer,
  todayISODate,
  useCommand,
  useHealth,
  useQuickLogCommand,
} from '@/lib/data';
import { formatLocalDate } from '@/lib/format';

import { runQuickLog } from './quick-log-run';
import styles from './quick-logs.module.css';

function MetricCard({ metric, date }: { metric: HealthMetricState; date: string }): ReactElement {
  const command = useQuickLogCommand();
  const { definition } = metric;
  const [entry, setEntry] = useState(metric.entry ? metricInputValue(metric.entry.value, definition) : '');
  const [error, setError] = useState<string | null>(null);
  const errorId = `metric-${definition.key}-error`;
  const shown = metric.entry === null ? null : metricDisplay(metric.entry.value, definition);
  const saving = command.isPendingFor(pending => pending.type === 'health.save' && pending.key === definition.key);

  const onEntryChange = (value: string): void => {
    setEntry(value);
    setError(null);
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    const reading = readMetricEntry(entry, definition);
    if (reading.kind === 'invalid') return setError(reading.message);

    const run = await runQuickLog(
      command,
      { type: 'health.save', key: definition.key, date, value: reading.storedValue },
      { action: 'save', subject: definition.name, success: result => result.message },
    );
    if (run.kind === 'saved') setEntry(metricInputValue(reading.storedValue, definition));
  };

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.metricHead}>
          <div>
            <h3 className={styles.cardTitle}>{definition.name}</h3>
            <p className={styles.metricValue}>
              {shown === null ? '—' : shown.value}
              {shown?.unit && <span className={styles.metricUnit}> {shown.unit}</span>}
            </p>
            <p className={styles.hint}>{metric.meta}</p>
          </div>
          {metric.completedQuest !== null ? (
            <Badge variant="soft" intent="success">
              Quest completed
            </Badge>
          ) : (
            metric.offer && (
              <Badge variant="soft" intent={metric.offer.met ? 'success' : 'info'}>
                {metric.offer.met ? 'Threshold met' : `${Math.floor(metric.offer.ratio * 100)}% of ${formatMetricValue(metric.offer.thresholdValue, definition)}`}
              </Badge>
            )
          )}
        </div>

        {metric.offer && (
          <div style={{ marginTop: 12 }}>
            <Progress value={metric.offer.ratio * 100} max={100} aria-label={`${definition.name} against its quest threshold`} />
            <p className={styles.hint} style={{ marginTop: 6 }}>
              {metric.offer.note}
            </p>
          </div>
        )}
        {metric.completedQuest !== null && !metric.offer && (
          <p className={styles.hint} style={{ marginTop: 12 }}>
            “{metric.completedQuest}” is completed for today.
          </p>
        )}

        <form className={styles.metricEntry} onSubmit={event => void save(event)} noValidate>
          <Input
            className={styles.metricInput}
            size="sm"
            inputMode="decimal"
            value={entry}
            onValueChange={onEntryChange}
            suffix={definition.unit || undefined}
            invalid={error !== null}
            aria-describedby={error === null ? undefined : errorId}
            aria-label={`${definition.name} for today`}
          />
          <Button type="submit" size="sm" variant="secondary" loading={saving}>
            Save
          </Button>
        </form>
        {error !== null && (
          <p id={errorId} className={styles.fieldError} role="alert">
            {error}
          </p>
        )}

        <SparkBars values={metric.last14Days.map(day => day.value)} label={`${definition.name}, last 14 days`} highlightLast axis={{ start: '14 days', end: metric.trendLabel }} />
      </Card.Body>
    </Card>
  );
}

export function HealthMetricsScreen(): ReactElement {
  const date = todayISODate();
  const health = useHealth(date);

  return (
    <section className={styles.screen} aria-labelledby="health-title">
      <h2 className={styles.cardTitle} id="health-title">
        Body &amp; health
      </h2>

      <DataState query={health} skeleton={<Skeleton.Card />}>
        {view => <HealthContent view={view} date={date} />}
      </DataState>
    </section>
  );
}

function HealthContent({ view, date }: { view: HealthView; date: string }): ReactElement {
  const command = useQuickLogCommand();
  const questCommand = useCommand();
  const offers = view.metrics.flatMap(metric => (metric.offer?.met ? [{ definition: metric.definition, offer: metric.offer }] : []));

  /**
   * Consent, never automation (PRD §2.6): the offer the server derives names the quest, and accepting it
   * dispatches the owner's own `quest.complete`. Without a server-side threshold behind the offer there is
   * no occurrence to address, so the local acknowledgement is all that is left to do.
   */
  const accept = async (offer: ThresholdOffer): Promise<void> => {
    if (offer.questId === null) {
      if (command.isPending) return;
      await runQuickLog(
        command,
        { type: 'health.acceptOffer', key: offer.metricKey, date: offer.date },
        { action: 'complete', subject: offer.questTitle, success: result => result.message },
      );
      return;
    }

    if (questCommand.isPending) return;
    const outcome = await questCommand.run({ type: 'quest.complete', occurrenceId: `${offer.questId}:${offer.date}` }).catch(() => null);
    if (!outcome) return notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: 'complete', subject: offer.questTitle, success: '' });
    if (outcome.status === 'needs-confirmation') return;
    const completed = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { action: 'complete', subject: offer.questTitle, success: completed ? outcome.local.message : '' });
  };

  return (
    <>
      {offers.map(({ definition, offer }) => (
        <Alert
          key={definition.key}
          intent="success"
          title={`${formatMetricValue(offer.thresholdValue, definition)} reached — “${offer.questTitle}” can be completed`}
          action={{ label: offer.xp > 0 ? `Complete the quest · +${offer.xp} XP` : 'Complete the quest', onClick: () => void accept(offer) }}
        >
          You logged {formatMetricValue(offer.currentValue, definition)}. The quest is yours to complete: Memoir never completes a quest for you, even when the threshold is met.
        </Alert>
      ))}

      <div className={styles.metricGrid}>
        {view.metrics.map(metric => (
          <MetricCard key={metric.definition.key} metric={metric} date={date} />
        ))}
      </div>

      <div className={styles.split}>
        <Card padding="md">
          <Card.Body>
            <h3 className={styles.cardTitle}>Recent entries</h3>
            {view.history.length === 0 && <EmptyState size="inline" title="Nothing logged yet" description="Metrics you type appear here. Blank days stay blank." />}
            {view.history.map(row => (
              <div key={`${row.date}-${row.text}`} className={styles.row}>
                <span className={styles.rowStamp}>{row.date === view.date ? 'Today' : formatLocalDate(row.date, { year: false })}</span>
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
          </Card.Body>
        </Card>

        <div className={styles.column}>
          <Card padding="md">
            <Card.Body>
              <h3 className={styles.railTitle}>All of this is optional</h3>
              <p className={styles.prose}>
                Every metric here is typed by you, by hand. Blank days are blank — they are not zeros, they do not break a streak, and they never cost HP. Only quests with an
                explicit threshold read these numbers.
              </p>
            </Card.Body>
          </Card>

          <Card padding="md">
            <Card.Body>
              <h3 className={styles.railTitle}>Quest thresholds</h3>
              {view.thresholds.length === 0 ? (
                <p className={styles.prose}>No quest reads these metrics yet. A quest with a health threshold is listed here.</p>
              ) : (
                <ul className={styles.list}>
                  {view.thresholds.map(threshold => (
                    <li key={threshold.label}>{threshold.label}</li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  );
}
