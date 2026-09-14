import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useId, useRef, useState } from 'react';
import { addMonths, Alert, Button, Card, EmptyState, IconButton, Progress, SegmentedControl, Skeleton, toISODate } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { outcomeTone } from '@/features/quests/quest-presenters';
import {
  type CrownPeriod,
  failureCopy,
  formatShortDate,
  notifyOutcome,
  type PlanDay,
  type PlanMonthCell,
  type PlanScope,
  type PlanView,
  shiftDate,
  toDate,
  useCommand,
  useMemoirData,
  usePlan,
} from '@/lib/data';
import { useDataReadiness } from '@/lib/sync';

import styles from './planning.module.css';

function isPlanEmpty(data: PlanView): boolean {
  return data.days.every(day => day.items.length === 0) && data.month.every(cell => cell.outcomes.length === 0);
}

export function PlanningBoardScreen(): ReactElement {
  const { today } = useMemoirData();
  const navigate = useNavigate();
  const [scope, setScope] = useState<PlanScope>('week');
  const [anchor, setAnchor] = useState(today);
  const plan = usePlan({ scope, anchor });
  const { readiness } = useDataReadiness({ query: plan, isEmpty: isPlanEmpty });
  const command = useCommand();
  const lockHintId = useId();
  const periodLabelRef = useRef<HTMLSpanElement>(null);

  const step = (direction: -1 | 1): void => {
    setAnchor(current => (scope === 'week' ? shiftDate(current, direction * 7) : toISODate(addMonths(toDate(current), direction))));
  };

  const jumpToWeek = (date: string): void => {
    setScope('week');
    setAnchor(date);
    periodLabelRef.current?.focus();
  };

  const todayCard = plan.data?.days.find(day => day.isToday) ?? null;
  const lockPending = command.isPendingFor(pending => pending.type === 'plan.setLock');
  const nothingScheduledToday = todayCard !== null && todayCard.items.length === 0;

  const toggleLock = async (): Promise<void> => {
    if (!todayCard) return;
    const locked = !todayCard.locked;
    const feedback = { action: locked ? 'lock' : 'unlock', subject: "today's plan" };
    const outcome = await command.run({ type: 'plan.setLock', date: today, locked, questIds: todayCard.items.map(item => item.questId) }).catch(() => null);
    if (!outcome || outcome.status === 'needs-confirmation') {
      notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { ...feedback, success: '' });
      return;
    }
    const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { ...feedback, success: saved ? outcome.local.message : '' });
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
          <span ref={periodLabelRef} tabIndex={-1} className={styles.periodLabel}>
            {plan.data?.label ?? ' '}
          </span>
          <IconButton variant="ghost" size="sm" aria-label="Next period" icon={<ChevronRightIcon size={16} />} onClick={() => step(1)} />
          <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
            Today
          </Button>
        </div>
        <div className={styles.toolbarEnd}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/review">Weekly review</Link>
          </Button>
          {scope === 'week' && readiness.kind === 'ready' ? (
            todayCard ? (
              <span className={styles.lockControl}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void toggleLock()}
                  loading={lockPending}
                  disabled={lockPending || nothingScheduledToday}
                  aria-describedby={nothingScheduledToday ? lockHintId : undefined}
                >
                  {todayCard.locked ? 'Unlock today’s plan' : 'Lock today’s plan'}
                </Button>
                {nothingScheduledToday ? (
                  <span id={lockHintId} className={styles.lockHint}>
                    Nothing is scheduled today.
                  </span>
                ) : null}
              </span>
            ) : (
              <span className={styles.lockHint}>Only today’s plan can be locked.</span>
            )
          ) : null}
        </div>
      </div>

      <DataState
        query={plan}
        skeleton={<Skeleton.Card />}
        isEmpty={isPlanEmpty}
        empty={
          <EmptyState
            title="Nothing planned yet"
            description="Create your first quest and it will show up here."
            action={{ label: 'New quest', onClick: () => void navigate({ to: '/quests/new' }) }}
          />
        }
      >
        {data => (
          <>
            {data.carryOver ? <CarryOverAlert carryOver={data.carryOver} /> : null}

            {scope === 'week' ? (
              <div className={styles.week}>
                {data.days.map(day => (
                  <PlanDayCard key={day.date} day={day} />
                ))}
              </div>
            ) : (
              <Card padding="md">
                <Card.Body>
                  <div className={styles.month}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(head => (
                      <span key={head} className={styles.monthHead}>
                        {head}
                      </span>
                    ))}
                    {data.month.map((cell, index) => (
                      <MonthCell key={cell.date ?? `blank-${index}`} cell={cell} onOpen={jumpToWeek} />
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
                </Card.Body>
              </Card>
            )}

            <div className={styles.summaries}>
              <Card padding="md">
                <Card.Body>
                  <h2 className={styles.cardTitle}>Current crown · {data.crown.label}</h2>
                  <Progress value={data.crown.keptPercent} max={100} size="md" aria-label={`Crown ${data.crown.label}: ${data.crown.keptPercent}% kept`} />
                  <p className={styles.cardBody}>{crownSummary(data.crown)}</p>
                </Card.Body>
              </Card>
              <Card padding="md">
                <Card.Body>
                  <h2 className={styles.cardTitle}>Reschedule budget</h2>
                  <p className={styles.budget}>
                    <span className={styles.budgetValue}>
                      {data.rescheduleBudget.used} / {data.rescheduleBudget.cap}
                    </span>
                    <span className={styles.cardBody}>used in the last 7 days</span>
                  </p>
                  <p className={styles.cardBody}>{rescheduleSummary(data.rescheduleBudget)}</p>
                </Card.Body>
              </Card>
              <Card padding="md">
                <Card.Body>
                  <h2 className={styles.cardTitle}>At a glance · {data.label}</h2>
                  <ul className={styles.glance}>
                    {data.glance.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Card.Body>
              </Card>
            </div>
          </>
        )}
      </DataState>
    </section>
  );
}

function crownSummary(crown: CrownPeriod): string {
  const progress = `${crown.keptPercent}% of the crown kept so far.`;
  if (crown.cadence === 'daily') return `${progress} Today's crown is banked when the day closes.`;
  return `Day ${crown.dayIndex} of ${crown.dayCount} · ${progress} This week's crown is banked when the week closes on ${formatShortDate(crown.closesOn)}.`;
}

function rescheduleSummary(budget: PlanView['rescheduleBudget']): string {
  const rule = `Each quest can move ${budget.cap} times in any 7 days. Past the cap, moves still happen — they are recorded as postpones with a reason instead.`;
  return budget.questName ? `Most moved: ${budget.questName}. ${rule}` : `No quest has moved in the last 7 days. ${rule}`;
}

function CarryOverAlert({ carryOver }: { carryOver: NonNullable<PlanView['carryOver']> }): ReactElement {
  const navigate = useNavigate();
  return (
    <Alert
      intent="warning"
      title={carryOver.title}
      action={{ label: 'Review the quest', onClick: () => void navigate({ to: '/quests/$questId', params: { questId: carryOver.questId } }) }}
    >
      {carryOver.body}
    </Alert>
  );
}

function monthCellLabel(cell: PlanMonthCell, date: string): string {
  const occurrences = cell.outcomes.length === 1 ? '1 occurrence' : `${cell.outcomes.length} occurrences`;
  return `${formatShortDate(date)}, ${cell.locked ? 'locked' : 'not locked'}, ${occurrences}`;
}

function MonthCell({ cell, onOpen }: { cell: PlanMonthCell; onOpen: (date: string) => void }): ReactElement {
  if (!cell.date) return <div className={styles.monthCell} data-in-month={false} aria-hidden="true" />;
  const date = cell.date;

  return (
    <button type="button" className={styles.monthCell} data-in-month={cell.inMonth} data-today={cell.isToday} onClick={() => onOpen(date)} aria-label={monthCellLabel(cell, date)}>
      <div className={styles.monthCellHead}>
        <span className={styles.mono} aria-hidden="true">
          {Number(date.slice(-2))}
        </span>
        {cell.locked ? (
          <span className={styles.lock}>
            <span className={styles.lockGlyph} aria-hidden="true" />
            <span className={styles.lockText}>locked</span>
          </span>
        ) : null}
      </div>
      <div className={styles.dots} aria-hidden="true">
        {cell.outcomes.map((state, dotIndex) => (
          <span key={dotIndex} className={styles.dot} data-tone={outcomeTone(state)} />
        ))}
      </div>
    </button>
  );
}

function PlanDayCard({ day }: { day: PlanDay }): ReactElement {
  return (
    <Card padding="sm" className={styles.dayCard} data-today={day.isToday}>
      <Card.Body>
        <div className={styles.dayHead}>
          <div>
            <div className={styles.dayName}>{formatShortDate(day.date)}</div>
            <div className={styles.dayLoad}>{day.loadSummary}</div>
          </div>
          {day.locked ? <span className={styles.lock}>locked</span> : null}
        </div>
        <div className={styles.loadTrack}>
          <span className={styles.loadFill} data-over={day.overCapacity || undefined} style={{ width: `${day.loadPercent}%` }} />
          <span className={styles.capacityMark} style={{ left: `${day.capacityMarkPercent}%` }} aria-hidden />
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
      </Card.Body>
    </Card>
  );
}
