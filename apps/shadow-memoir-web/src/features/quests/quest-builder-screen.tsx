import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Button, Card, FormField, Input, NumberStepper, SegmentedControl, Select, Switch, TimePicker, toast } from '@shadow-library/ui';

import {
  formatDuration,
  type QuestDraft,
  type RecurrenceFrequency,
  STAT_LABELS,
  type StatAffinity,
  type Strictness,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useCommand,
  useDraftPreview,
  useMemoirData,
  type Weekday,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from '@/lib/data';

import styles from './quests.module.css';

const STRICTNESS_ORDER: Strictness[] = ['anchor', 'routine', 'goal', 'optional'];
const STAT_ORDER: StatAffinity[] = ['body', 'mind', 'wealth', 'discipline'];
const DEFAULT_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function QuestBuilderScreen(): ReactElement {
  const navigate = useNavigate();
  const { today } = useMemoirData();
  const command = useCommand();

  const [name, setName] = useState('');
  const [statAffinity, setStatAffinity] = useState<StatAffinity>('mind');
  const [strictness, setStrictness] = useState<Strictness>('routine');
  const [time, setTime] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('weekly');
  const [interval, setInterval] = useState(2);
  const [days, setDays] = useState<Weekday[]>(DEFAULT_DAYS);
  const [threshold, setThreshold] = useState(false);
  const [preCommit, setPreCommit] = useState(true);

  const startTimeMinutes = useMemo(() => {
    if (!time) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  }, [time]);

  const draft = useMemo<QuestDraft>(
    () => ({
      name: name.trim(),
      notes: null,
      startTimeMinutes,
      durationMinutes,
      statAffinity,
      strictness,
      optionalStreakOptIn: strictness === 'optional',
      recurrence: {
        frequency,
        interval: frequency === 'daily' ? interval : 1,
        daysOfWeek: frequency === 'daily' ? WEEKDAYS : days,
        dayOfMonth: null,
        startDate: today,
        end: { kind: 'never' },
        exceptions: [],
      },
      consequences: [],
      moduleLink: null,
      notification: { enabled: startTimeMinutes !== null, leadMinutes: 10 },
      healthThreshold: threshold ? { metric: 'steps', target: 8000, unit: 'steps' } : null,
      preCommit,
      active: true,
    }),
    [name, startTimeMinutes, durationMinutes, statAffinity, strictness, frequency, interval, days, threshold, preCommit, today],
  );

  const preview = useDraftPreview(draft);
  const anchorNeedsTime = strictness === 'anchor' && startTimeMinutes === null;

  const create = (): void => {
    if (draft.name.length === 0) return;
    command.mutate(
      { type: 'quest.create', draft },
      {
        onSuccess: result => {
          if (result.status === 'applied' || result.status === 'queued') toast.neutral(result.message);
          void navigate({ to: '/quests' });
        },
      },
    );
  };

  return (
    <section className={styles.screen} aria-labelledby="new-quest-title">
      <div className={styles.grid}>
        <div className={styles.column}>
          <Card padding="lg">
            <h1 className={styles.detailTitle} id="new-quest-title">
              New quest
            </h1>
            <p className={styles.cardBody}>Three decisions: what it is, when it happens, and how strict you want it to be.</p>

            <div className={styles.form}>
              <FormField label="Quest name" required helper="Written as a promise, not a task — “Read 20 pages” keeps better than “Read more”.">
                <Input value={name} onValueChange={setName} placeholder="Read 20 pages" aria-label="Quest name" />
              </FormField>

              <div className={styles.formRow}>
                <FormField label="Category" helper="Decides which lifetime stat grows.">
                  <Select value={statAffinity} onValueChange={value => setStatAffinity(value as StatAffinity)} aria-label="Category">
                    {STAT_ORDER.map(stat => (
                      <Select.Item key={stat} value={stat}>
                        {STAT_LABELS[stat]}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Time of day"
                  helper="Optional. An untimed quest is judged on the day, not the hour."
                  error={anchorNeedsTime ? 'An Anchor quest needs a start time.' : undefined}
                >
                  <TimePicker value={time} onValueChange={setTime} aria-label="Time of day" />
                </FormField>
                <FormField label="Usual length" helper="Used for the day’s load, never as a timer.">
                  <NumberStepper value={durationMinutes} onValueChange={value => setDurationMinutes(value ?? 0)} min={0} max={240} step={5} aria-label="Usual length in minutes" />
                </FormField>
              </div>

              <div>
                <p className={styles.fieldLabel}>Strictness</p>
                <div className={styles.strictnessGrid}>
                  {STRICTNESS_ORDER.map(level => (
                    <button
                      key={level}
                      type="button"
                      className={styles.strictnessCard}
                      data-selected={strictness === level}
                      aria-pressed={strictness === level}
                      onClick={() => setStrictness(level)}
                    >
                      <span className={styles.strictnessName}>{STRICTNESS_LABELS[level]}</span>
                      <span className={styles.strictnessRule}>{STRICTNESS_RULES[level]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <FormField label="Repeats" helper="Six days a week is the pattern most people keep.">
                <div className={styles.repeats}>
                  <SegmentedControl value={frequency} onValueChange={value => setFrequency(value as RecurrenceFrequency)} fullWidth>
                    <SegmentedControl.Item value="weekly">Days of week</SegmentedControl.Item>
                    <SegmentedControl.Item value="daily">Every N days</SegmentedControl.Item>
                  </SegmentedControl>
                  {frequency === 'daily' ? (
                    <NumberStepper value={interval} onValueChange={value => setInterval(value ?? 1)} min={1} max={30} aria-label="Repeat every N days" />
                  ) : (
                    <div className={styles.dayToggles}>
                      {WEEKDAYS.map(day => (
                        <button
                          key={day}
                          type="button"
                          className={styles.dayToggle}
                          data-selected={days.includes(day)}
                          aria-pressed={days.includes(day)}
                          onClick={() => setDays(current => (current.includes(day) ? current.filter(item => item !== day) : [...current, day]))}
                        >
                          {WEEKDAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormField>

              <div className={styles.switches}>
                <Switch
                  checked={threshold}
                  onCheckedChange={setThreshold}
                  label="Complete from a health threshold"
                  description="When a logged metric passes a target, Shadow Memoir offers to complete this quest. It never completes it for you."
                />
                <Switch
                  checked={preCommit}
                  onCheckedChange={setPreCommit}
                  label="Pre-commit this quest each week"
                  description="A committed quest can still be skipped or rescheduled — the lock only stops the promise being edited after the fact."
                />
              </div>
            </div>
          </Card>

          <div className={styles.formFooter}>
            <Button variant="ghost" onClick={() => void navigate({ to: '/quests' })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={draft.name.length === 0 || anchorNeedsTime}>
              Create quest
            </Button>
          </div>
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <h2 className={styles.cardTitle}>Effect on your week</h2>
            <ul className={styles.loadList}>
              {(preview.data?.days ?? []).map(day => (
                <li key={day.label}>
                  <div className={styles.loadHead}>
                    <span>{day.label}</span>
                    <span className={styles.mono}>{formatDuration(day.minutes)}</span>
                  </div>
                  <div className={styles.loadTrack}>
                    <span className={styles.loadFill} style={{ width: `${Math.min(100, day.percentOfCapacity)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {preview.data?.overloadNote ? (
            <Alert intent="warning" title="One day would carry more than usual">
              {preview.data.overloadNote}
            </Alert>
          ) : null}
        </div>
      </div>
    </section>
  );
}
