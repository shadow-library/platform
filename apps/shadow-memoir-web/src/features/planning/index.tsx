import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { addMonths, Alert, Button, Card, IconButton, Progress, SegmentedControl, Skeleton, toISODate } from '@shadow-library/ui';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { outcomeTone } from '@/features/quests/quest-presenters';
import { formatShortDate, type PlanDay, type PlanScope, shiftDate, toDate, useCommand, useMemoirData, usePlan } from '@/lib/data';

import styles from './planning.module.css';

export function PlanningBoardScreen(): ReactElement {
  const { today } = useMemoirData();
  const [scope, setScope] = useState<PlanScope>('week');
  const [anchor, setAnchor] = useState(today);
  const plan = usePlan({ scope, anchor });
  const command = useCommand();

  const step = (direction: -1 | 1): void => {
    setAnchor(current => (scope === 'week' ? shiftDate(current, direction * 7) : toISODate(addMonths(toDate(current), direction))));
  };

  const lockWeek = (): void => {
    if (!plan.data) return;
    command.mutate({ type: 'plan.setLock', from: plan.data.from, to: plan.data.to, locked: true });
  };

  return (
    <section className={styles.screen} aria-labelledby="plan-title">
      <header className={styles.header}>
        <h1 className={styles.title} id="plan-title">
          Planning Board
        </h1>
        <p className={styles.subtitle}>Design the week rather than react to it. Every move here obeys the same rules the day does.</p>
      </header>

      <div className={styles.toolbar}>
        <SegmentedControl value={scope} onValueChange={value => setScope(value as PlanScope)}>
          <SegmentedControl.Item value="week">Week</SegmentedControl.Item>
          <SegmentedControl.Item value="month">Month</SegmentedControl.Item>
        </SegmentedControl>
        <div className={styles.stepper}>
          <IconButton variant="ghost" size="sm" aria-label="Previous period" icon={<ChevronLeftIcon size={16} />} onClick={() => step(-1)} />
          <span className={styles.periodLabel}>{plan.data?.label ?? ' '}</span>
          <IconButton variant="ghost" size="sm" aria-label="Next period" icon={<ChevronRightIcon size={16} />} onClick={() => step(1)} />
        </div>
        <div className={styles.toolbarEnd}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/review">Weekly review</Link>
          </Button>
          <Button size="sm" variant="secondary" onClick={lockWeek}>
            Lock this week
          </Button>
        </div>
      </div>

      {plan.isPending || !plan.data ? <Skeleton.Card /> : null}

      {plan.data ? (
        <>
          {plan.data.carryOver ? (
            <Alert intent="warning" title={plan.data.carryOver.title}>
              {plan.data.carryOver.body}
            </Alert>
          ) : null}

          {scope === 'week' ? (
            <div className={styles.week}>
              {plan.data.days.map(day => (
                <PlanDayCard key={day.date} day={day} />
              ))}
            </div>
          ) : (
            <Card padding="md">
              <div className={styles.month}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(head => (
                  <span key={head} className={styles.monthHead}>
                    {head}
                  </span>
                ))}
                {plan.data.month.map((cell, index) => (
                  <div key={cell.date ?? `blank-${index}`} className={styles.monthCell} data-in-month={cell.inMonth} data-today={cell.isToday}>
                    <div className={styles.monthCellHead}>
                      <span className={styles.mono}>{cell.date ? Number(cell.date.slice(-2)) : ''}</span>
                      {cell.locked ? (
                        <span className={styles.lock} title="Plan locked">
                          locked
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.dots} aria-hidden>
                      {cell.outcomes.map((state, dotIndex) => (
                        <span key={dotIndex} className={styles.dot} data-tone={outcomeTone(state)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.legend}>
                <span>
                  <span className={styles.dot} data-tone="kept" /> kept
                </span>
                <span>
                  <span className={styles.dot} data-tone="partial" /> partial
                </span>
                <span>
                  <span className={styles.dot} data-tone="closed" /> skipped or missed
                </span>
                <span>
                  <span className={styles.dot} data-tone="open" /> still open
                </span>
              </div>
            </Card>
          )}

          <div className={styles.summaries}>
            <Card padding="md">
              <h2 className={styles.cardTitle}>Crown period · {plan.data.crown.label}</h2>
              <Progress value={plan.data.crown.keptPercent} max={100} size="md" label="Crown period progress" />
              <p className={styles.cardBody}>
                Day {plan.data.crown.dayIndex} of {plan.data.crown.dayCount} · {plan.data.crown.keptPercent}% of scheduled occurrences kept. The crown is awarded on the period, not
                on any single day.
              </p>
            </Card>
            <Card padding="md">
              <h2 className={styles.cardTitle}>Reschedule budget</h2>
              <p className={styles.budget}>
                <span className={styles.budgetValue}>
                  {plan.data.rescheduleBudget.used} / {plan.data.rescheduleBudget.cap}
                </span>
                <span className={styles.cardBody}>used in the last 7 days</span>
              </p>
              <p className={styles.cardBody}>
                Resets {formatShortDate(plan.data.rescheduleBudget.resetsOn)}. Past the cap, moves still happen — they are recorded as postpones with a reason instead.
              </p>
            </Card>
            <Card padding="md">
              <h2 className={styles.cardTitle}>This week at a glance</h2>
              <ul className={styles.glance}>
                {plan.data.glance.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}

function PlanDayCard({ day }: { day: PlanDay }): ReactElement {
  return (
    <Card padding="sm" className={styles.dayCard} data-today={day.isToday}>
      <div className={styles.dayHead}>
        <div>
          <div className={styles.dayName}>{formatShortDate(day.date)}</div>
          <div className={styles.dayLoad}>{day.loadSummary}</div>
        </div>
        {day.locked ? <span className={styles.lock}>locked</span> : null}
      </div>
      <div className={styles.loadTrack}>
        <span className={styles.loadFill} style={{ width: `${day.loadPercent}%` }} />
        <span className={styles.capacityMark} aria-hidden />
      </div>
      <ul className={styles.dayItems}>
        {day.items.map(item => (
          <li key={item.occurrenceId}>
            <Link to="/quests/$questId" params={{ questId: item.questId }} className={styles.dayItem} data-tone={outcomeTone(item.state)}>
              <span className={styles.dayItemTitle}>{item.title}</span>
              <span className={styles.dayItemMeta}>{item.shielded ? `${item.meta} · shield spent` : item.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
      {day.note ? <p className={styles.dayNote}>{day.note}</p> : null}
    </Card>
  );
}
