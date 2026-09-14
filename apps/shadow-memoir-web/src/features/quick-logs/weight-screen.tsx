import { type ReactElement, useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, NumberStepper, Skeleton, Statistic } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { EntryCapNote } from '@/components/EntryCapNote';
import { LinkageOfferNote } from '@/components/LinkageOfferNote';
import { SparkBars } from '@/components/SparkBars';
import {
  type EntryCapAdvisory,
  kgToLb,
  type QuestLinkageOffer,
  todayISODate,
  useQuickLogCommand,
  useWeight,
  WEIGHT_RANGE_KG,
  type WeightEntry,
  weightError,
  type WeightView,
} from '@/lib/data';
import { formatLocalDate, formatLocalTime } from '@/lib/format';

import { runQuickLog } from './quick-log-run';
import styles from './quick-logs.module.css';

const WEIGHT_STEP_START_KG = 70;
const KG_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

function formatKg(kg: number): string {
  return kg.toLocaleString('en-US', KG_FORMAT);
}

export function WeightScreen(): ReactElement {
  const weight = useWeight();

  return (
    <section className={styles.screen} aria-labelledby="weight-title">
      <h2 className={styles.cardTitle} id="weight-title">
        Weight
      </h2>

      <DataState query={weight} skeleton={<Skeleton.Card />}>
        {view => <WeightContent view={view} />}
      </DataState>
    </section>
  );
}

function WeightContent({ view }: { view: WeightView }): ReactElement {
  const date = todayISODate();
  const command = useQuickLogCommand();
  const [kg, setKg] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [pendingReplacement, setPendingReplacement] = useState<WeightEntry | null>(null);
  const [replaced, setReplaced] = useState<{ date: string; kg: number } | null>(null);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const [linkage, setLinkage] = useState<QuestLinkageOffer | null>(null);

  const value = kg ?? view.today?.kg ?? null;
  const error = touched ? weightError(value) : null;
  const replacedKgOn = (entry: WeightEntry): number | undefined => entry.replacedKg ?? (replaced?.date === entry.date ? replaced.kg : undefined);
  const todayReplacedKg = view.today ? replacedKgOn(view.today) : undefined;
  const firstTrend = view.trend[0];
  const lastTrend = view.trend[view.trend.length - 1];

  const save = async (replacing: WeightEntry | null): Promise<void> => {
    if (command.isPending) return;
    setTouched(true);
    if (value === null || weightError(value) !== null) return;
    setPendingReplacement(null);

    const run = await runQuickLog(
      command,
      { type: 'weight.save', date, kg: value, confirmedReplacement: replacing !== null },
      { action: 'save', subject: `${formatKg(value)} kg`, success: result => result.message },
    );
    if (run.kind === 'confirm') return setPendingReplacement(run.result.needsConfirmation?.existing ?? null);
    if (run.kind !== 'saved') return;

    if (replacing) setReplaced({ date, kg: replacing.kg });
    setAdvisory(run.result.advisory ?? null);
    setLinkage(run.result.linkageOffer ?? null);
    setKg(null);
    setTouched(false);
  };

  return (
    <div className={styles.split}>
      <div className={styles.column}>
        <Card padding="lg">
          <Card.Body>
            <div className={styles.weightHead}>
              <div>
                <p className={styles.eyebrow}>Today</p>
                <p className={styles.bigValue}>
                  {view.today ? formatKg(view.today.kg) : '—'} <span className={styles.bigUnit}>kg</span>
                </p>
                <p className={styles.hint}>
                  {view.today
                    ? `Logged ${formatLocalTime(view.today.loggedAt)}${todayReplacedKg === undefined ? '' : ` · replaced ${formatKg(todayReplacedKg)} kg`} · ${formatKg(kgToLb(view.today.kg))} lb`
                    : 'Nothing logged today'}
                </p>
              </div>
              {(view.sevenDayAverageKg !== null || view.ninetyDayChangeKg !== null) && (
                <div className={styles.weightStats}>
                  {view.sevenDayAverageKg !== null && <Statistic label="7-day average" value={view.sevenDayAverageKg} unit="kg" size="sm" format={KG_FORMAT} />}
                  {view.ninetyDayChangeKg !== null && (
                    <Statistic label="90 days" value={view.ninetyDayChangeKg} unit="kg" size="sm" format={{ ...KG_FORMAT, signDisplay: 'exceptZero' }} />
                  )}
                </div>
              )}
            </div>

            <form
              className={styles.formRow}
              noValidate
              onSubmit={event => {
                event.preventDefault();
                void save(null);
              }}
            >
              <NumberStepper
                className={styles.weightStepper}
                value={value}
                onValueChange={next => {
                  setKg(next);
                  setTouched(false);
                }}
                min={WEIGHT_RANGE_KG.min}
                max={WEIGHT_RANGE_KG.max}
                step={0.1}
                precision={1}
                startValue={view.entries[0]?.kg ?? WEIGHT_STEP_START_KG}
                clampOnBlur={false}
                unit="kg"
                invalid={error !== null}
                aria-describedby={error === null ? undefined : 'weight-error'}
                aria-label="Weight in kilograms"
              />
              <Button type="submit" variant="primary" loading={command.isPending} disabled={value === null}>
                Save
              </Button>
              <span className={styles.hint}>One value a day. Saving again replaces today’s.</span>
            </form>
            {error !== null && (
              <p id="weight-error" className={styles.fieldError} role="alert">
                {error}
              </p>
            )}

            <EntryCapNote advisory={advisory} />
            <LinkageOfferNote offer={linkage} />
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h3 className={styles.cardTitle}>Trend</h3>
            {firstTrend && lastTrend ? (
              <SparkBars
                values={view.trend.map(point => point.value)}
                dates={view.trend.map(point => point.date)}
                domain="range"
                label={`Weight trend from ${formatLocalDate(firstTrend.date)} to ${formatLocalDate(lastTrend.date)}${view.trendNote ? `, ${view.trendNote}` : ''}`}
                height={150}
                highlightLast
                axis={{ start: formatLocalDate(firstTrend.date, { year: false }), middle: view.trendNote, end: formatLocalDate(lastTrend.date, { year: false }) }}
              />
            ) : (
              <EmptyState size="inline" title="No trend yet" description="Weights from the last 90 days draw the trend once there is one." />
            )}
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h3 className={styles.cardTitle}>Entries</h3>
            {view.entries.length === 0 && <EmptyState size="inline" title="No entries yet" description="Step on the scale when it suits you. Missing days are fine." />}
            {view.entries.map(entry => {
              const replacedKg = replacedKgOn(entry);
              return (
                <div key={entry.id} className={styles.row}>
                  <span className={styles.rowStamp}>{formatLocalDate(entry.date, { year: false })}</span>
                  <span className={styles.rowValue}>{formatKg(entry.kg)} kg</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowMeta} style={{ marginTop: 0 }}>
                      {entry.note ?? (replacedKg === undefined ? '' : `Replaced ${formatKg(replacedKg)} kg`)}
                    </span>
                  </span>
                </div>
              );
            })}
          </Card.Body>
        </Card>
      </div>

      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <h3 className={styles.railTitle}>Context, not a target</h3>
            <p className={styles.prose}>
              Shadow Memoir never sets a goal weight and never grants or removes XP for a number on a scale. Weight is here so you can see a trend, nothing more.
            </p>
          </Card.Body>
        </Card>

        {view.context.length > 0 && (
          <Card padding="md">
            <Card.Body>
              <h3 className={styles.railTitle}>Alongside the trend</h3>
              <ul className={styles.list}>
                {view.context.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={pendingReplacement !== null}
        onOpenChange={open => !open && setPendingReplacement(null)}
        title="Replace today’s weight?"
        description={pendingReplacement && value !== null ? `Today already carries ${formatKg(pendingReplacement.kg)} kg. Saving ${formatKg(value)} kg replaces it.` : undefined}
        confirmLabel="Replace"
        onConfirm={() => void save(pendingReplacement)}
      />
    </div>
  );
}
