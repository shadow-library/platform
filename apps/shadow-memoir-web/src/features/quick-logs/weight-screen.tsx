import { type ReactElement, useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, NumberStepper, Skeleton, Statistic, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { LinkageOfferNote } from '@/components/LinkageOfferNote';
import { SparkBars } from '@/components/SparkBars';
import { type EntryCapAdvisory, kgToLb, type QuestLinkageOffer, todayISODate, useQuickLogCommand, useWeight, type WeightEntry } from '@/lib/data';

import styles from './quick-logs.module.css';

export function WeightScreen(): ReactElement {
  const date = todayISODate();
  const weight = useWeight();
  const command = useQuickLogCommand();
  const [kg, setKg] = useState<number | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<WeightEntry | null>(null);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const [linkage, setLinkage] = useState<QuestLinkageOffer | null>(null);

  const view = weight.data;
  const value = kg ?? view?.today?.kg ?? null;

  const save = (confirmedReplacement: boolean): void => {
    if (value === null) return;
    command.mutate(
      { type: 'weight.save', date, kg: value, confirmedReplacement },
      {
        onSuccess: result => {
          if (result.needsConfirmation) return setPendingReplacement(result.needsConfirmation.existing);
          setPendingReplacement(null);
          setAdvisory(result.advisory ?? null);
          setLinkage(result.linkageOffer ?? null);
          toast.success(result.message);
        },
      },
    );
  };

  if (weight.isLoading || !view) return <Skeleton.Card />;

  return (
    <section className={styles.screen} aria-labelledby="weight-title">
      <h2 className={styles.cardTitle} id="weight-title">
        Weight
      </h2>

      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="lg">
            <div className={styles.padLg}>
              <div className={styles.weightHead}>
                <div>
                  <p className={styles.eyebrow}>Today</p>
                  <p className={styles.bigValue}>
                    {view.today ? view.today.kg.toFixed(1) : '—'} <span className={styles.bigUnit}>kg</span>
                  </p>
                  <p className={styles.hint}>
                    {view.today
                      ? `Logged ${view.today.loggedAt.slice(11, 16)}${view.today.replacedKg ? ` · replaced ${view.today.replacedKg} kg` : ''} · ${kgToLb(view.today.kg).toFixed(1)} lb`
                      : 'Nothing logged today'}
                  </p>
                </div>
                <div className={styles.weightStats}>
                  <Statistic label="7-day average" value={Number((view.sevenDayAverageKg ?? 0).toFixed(1))} unit="kg" size="sm" />
                  <Statistic
                    label="90 days"
                    value={Number((view.ninetyDayChangeKg ?? 0).toFixed(1))}
                    unit="kg"
                    size="sm"
                    comparison={view.ninetyDayStartKg === null ? undefined : `from ${view.ninetyDayStartKg} kg`}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <NumberStepper value={value} onValueChange={setKg} min={30} max={250} step={0.1} precision={1} unit="kg" aria-label="Weight in kilograms" />
                <Button variant="primary" loading={command.isPending} disabled={value === null} onClick={() => save(false)}>
                  Save
                </Button>
                <span className={styles.hint}>One value a day. Saving again replaces today’s and keeps the old one in History.</span>
              </div>

              <EntryCapNote advisory={advisory} />
              <LinkageOfferNote offer={linkage} />
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.cardTitle}>Trend</h3>
              <SparkBars values={view.trend.map(point => point.value)} label="Weight trend" height={150} highlightLast />
              <div className={styles.axis}>
                <span>{view.trend[0]?.date}</span>
                <span>{view.trendNote}</span>
                <span>{view.trend[view.trend.length - 1]?.date}</span>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.cardTitle}>Entries</h3>
              {view.entries.length === 0 && <EmptyState size="inline" title="No entries yet" description="Step on the scale when it suits you. Missing days are fine." />}
              {view.entries.map(entry => (
                <div key={entry.id} className={styles.row}>
                  <span className={styles.rowStamp}>{entry.date}</span>
                  <span className={styles.mono} style={{ width: 70 }}>
                    {entry.kg.toFixed(1)} kg
                  </span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowMeta} style={{ marginTop: 0 }}>
                      {entry.note ?? ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Context, not a target</h3>
              <p className={styles.prose}>
                Shadow Memoir never sets a goal weight and never grants or removes XP for a number on a scale. Weight is here so you can see a trend, nothing more.
              </p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Alongside the trend</h3>
              <ul className={styles.list}>
                {view.context.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pendingReplacement !== null}
        onOpenChange={open => !open && setPendingReplacement(null)}
        title="Replace today’s weight?"
        description={
          pendingReplacement ? `Today already carries ${pendingReplacement.kg} kg. Saving ${value?.toFixed(1)} kg replaces it — the old value stays visible in History.` : undefined
        }
        confirmLabel="Replace"
        onConfirm={() => save(true)}
      />
    </section>
  );
}
