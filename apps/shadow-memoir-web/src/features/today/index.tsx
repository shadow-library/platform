import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { type QuestActions, useQuestActions } from '@/features/quests/quest-actions';
import { QuestRow } from '@/features/quests/quest-row';
import { type DayView, formatDayName, KEPT_STATES, type QuestOccurrence, type QuickLogTile, useComingBack, useDay, useMemoirData, useQuickLogTiles } from '@/lib/data';

import { DayRail } from './day-rail';
import { HeroCard } from './hero-card';
import styles from './today.module.css';

export function TodayScreen(): ReactElement {
  const { today } = useMemoirData();
  const day = useDay();
  const tiles = useQuickLogTiles();
  const actions = useQuestActions();

  return (
    <section className={styles.screen} aria-labelledby="today-title">
      <header className={styles.header}>
        <h1 className={styles.title} id="today-title">
          Today
        </h1>
        <p className={styles.subtitle}>{formatDayName(today)}</p>
      </header>

      <DataState query={day} skeleton={<TodaySkeleton />}>
        {data => <TodayGrid day={data} tiles={tiles.data ?? []} actions={actions} />}
      </DataState>

      {actions.overlays}
    </section>
  );
}

function doneCount(occurrences: QuestOccurrence[]): string {
  const kept = occurrences.filter(item => KEPT_STATES.includes(item.state)).length;
  const partial = occurrences.filter(item => item.state === 'partial').length;
  return `${kept} of ${occurrences.length} done${partial > 0 ? ` · ${partial} partial` : ''}`;
}

interface TodayGridProps {
  day: DayView;
  tiles: QuickLogTile[];
  actions: QuestActions;
}

function TodayGrid({ day, tiles, actions }: TodayGridProps): ReactElement {
  const navigate = useNavigate();
  const comingBack = useComingBack();

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <HeroCard hero={day.hero} mode={day.mode} showCrown={day.hasActiveQuests} />

        {day.recovery && comingBack.data?.kind === 'offered' ? (
          <>
            <Alert intent="info" title={day.recovery.title}>
              {day.recovery.body}
            </Alert>
            <div className={styles.actionRow}>
              <Button size="sm" variant="secondary" asChild>
                <Link to="/hero/recovery">See recovery choices</Link>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/plan">See the week</Link>
              </Button>
            </div>
          </>
        ) : null}

        {day.occurrences.length === 0 ? (
          <>
            <Card padding="lg">
              <Card.Body>
                <EmptyState
                  title="Your first day is empty on purpose"
                  description="A quest is a promise you keep to yourself, not a task. Start with one that takes ten minutes — it is easier to keep a small promise every day than a large one twice."
                  action={{ label: 'Create your first quest', onClick: () => void navigate({ to: '/quests/new' }) }}
                />
              </Card.Body>
            </Card>
            <Card padding="md">
              <Card.Body>
                <h2 className={styles.cardTitle}>While you decide, anything you log still counts</h2>
                <p className={styles.cardBody}>Expenses, meals, weight and journal entries all work before your first quest exists. Side quests earn XP on their own.</p>
                <div className={styles.actionRow}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/log">Quick log</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/log/sidequests">Log a side quest</Link>
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </>
        ) : (
          <div>
            <div className={styles.listHeader}>
              <p className={styles.listCount}>
                <strong>{doneCount(day.occurrences)}</strong>
              </p>
              <p className={styles.listTail}>{day.wakeWindowNote}</p>
            </div>
            <Card padding="sm" className={styles.listCard}>
              <Card.Body className={styles.listBody}>
                <ul className={styles.list}>
                  {day.occurrences.map(occurrence => (
                    <QuestRow key={occurrence.id} occurrence={occurrence} unsaved={actions.unsaved.has(occurrence.id)} onComplete={actions.complete} onOpenActions={actions.open} />
                  ))}
                </ul>
              </Card.Body>
            </Card>
          </div>
        )}

        {day.summary ? (
          <Card padding="md">
            <Card.Body>
              <h2 className={styles.cardTitle}>{day.summary.headline}</h2>
              <p className={styles.cardBody}>{day.summary.detail}</p>
              <div className={styles.actionRow}>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/log">Write a line about today</Link>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/plan">Plan tomorrow</Link>
                </Button>
              </div>
            </Card.Body>
          </Card>
        ) : null}
      </div>

      <DayRail quickLogs={tiles} streaks={day.streaks} upcoming={day.upcoming} activity={day.activity} />
    </div>
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
