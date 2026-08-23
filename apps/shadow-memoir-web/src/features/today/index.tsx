import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton } from '@shadow-library/ui';

import { QuestRow } from '@/features/quests/quest-row';
import { useQuestActions } from '@/features/quests/quest-actions';
import { formatDayName, type QuestOccurrence, useCommand, useDay, useMemoirData } from '@/lib/data';

import { DayRail } from './day-rail';
import { HeroCard } from './hero-card';
import styles from './today.module.css';

export function TodayScreen(): ReactElement {
  const { today } = useMemoirData();
  const navigate = useNavigate();
  const day = useDay();
  const command = useCommand();
  const actions = useQuestActions();

  const complete = (occurrence: QuestOccurrence): void => {
    command.mutate({ type: 'quest.complete', occurrenceId: occurrence.id });
  };

  return (
    <section className={styles.screen} aria-labelledby="today-title">
      <header className={styles.header}>
        <h1 className={styles.title} id="today-title">
          Today
        </h1>
        <p className={styles.subtitle}>{formatDayName(today)}</p>
      </header>

      {day.isPending || !day.data ? <TodaySkeleton /> : null}

      {day.data ? (
        <div className={styles.grid}>
          <div className={styles.column}>
            <HeroCard hero={day.data.hero} mode={day.data.mode} />

            {day.data.recovery ? (
              <>
                <Alert intent="info" title={day.data.recovery.title}>
                  {day.data.recovery.body}
                </Alert>
                <div className={styles.actionRow}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/hero">See recovery choices</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/plan">Lift the reduced load</Link>
                  </Button>
                </div>
              </>
            ) : null}

            {day.data.occurrences.length === 0 ? (
              <>
                <Card padding="lg">
                  <EmptyState
                    title="Your first day is empty on purpose"
                    description="A quest is a promise you keep to yourself, not a task. Start with one that takes ten minutes — it is easier to keep a small promise every day than a large one twice."
                    action={{ label: 'Create your first quest', onClick: () => void navigate({ to: '/quests/new' }) }}
                  />
                </Card>
                <Card padding="md">
                  <h2 className={styles.cardTitle}>While you decide, anything you log still counts</h2>
                  <p className={styles.cardBody}>Expenses, meals, weight and journal entries all work before your first quest exists. Side quests earn XP on their own.</p>
                  <div className={styles.actionRow}>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/log">Quick log</Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/log">Log a side quest</Link>
                    </Button>
                  </div>
                </Card>
              </>
            ) : (
              <div>
                <div className={styles.listHeader}>
                  <p className={styles.listCount}>
                    <strong>
                      {day.data.occurrences.filter(item => item.state === 'completed' || item.state === 'partial').length} of {day.data.occurrences.length} done
                    </strong>
                  </p>
                  <p className={styles.listTail}>{day.data.wakeWindowNote}</p>
                </div>
                <Card padding="sm" className={styles.listCard}>
                  <ul className={styles.list}>
                    {day.data.occurrences.map(occurrence => (
                      <QuestRow key={occurrence.id} occurrence={occurrence} onComplete={complete} onOpenActions={actions.open} />
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {day.data.summary ? (
              <Card padding="md">
                <h2 className={styles.cardTitle}>{day.data.summary.headline}</h2>
                <p className={styles.cardBody}>{day.data.summary.detail}</p>
                <div className={styles.actionRow}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/log">Write a line about today</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/plan">Plan tomorrow</Link>
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>

          <DayRail quickLogs={day.data.quickLogs} streaks={day.data.streaks} upcoming={day.data.upcoming} activity={day.data.activity} />
        </div>
      ) : null}

      {actions.overlays}
    </section>
  );
}

function TodaySkeleton(): ReactElement {
  return (
    <div className={styles.grid} aria-hidden>
      <div className={styles.column}>
        <Skeleton.Card />
        <Skeleton.List rows={5} />
      </div>
      <div className={styles.column}>
        <Skeleton.Card />
        <Skeleton.List rows={4} />
      </div>
    </div>
  );
}
