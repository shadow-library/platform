import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, EmptyState, FormField, Input, NumberStepper, SegmentedControl, Select, Skeleton, Switch, TimePicker } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import {
  formatDuration,
  formatShortDate,
  formatTime,
  type HealthThreshold,
  notifyOutcome,
  type Quest,
  type QuestDraft,
  type Recurrence,
  type RecurrenceFrequency,
  STAT_LABELS,
  type StatAffinity,
  type Strictness,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useCommand,
  useDraftPreview,
  useMemoirData,
  useQuestDetail,
  type Weekday,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from '@/lib/data';
import { parseMinuteOfDay } from '@/lib/format';

import { type QuestDuplicateSearch } from './quest-duplicate.search';
import { questThresholdLabel, recurrenceSummary } from './quest-presenters';
import styles from './quests.module.css';

const STRICTNESS_ORDER: Strictness[] = ['anchor', 'routine', 'goal', 'optional'];
const STAT_ORDER: StatAffinity[] = ['body', 'mind', 'wealth', 'discipline'];
const DEFAULT_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BUILDER_FREQUENCIES: readonly RecurrenceFrequency[] = ['daily', 'weekly'];
const DEFAULT_INTERVAL = 2;
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 30;
const DURATION_MIN = 0;
const DURATION_MAX = 240;
const DEFAULT_HEALTH_THRESHOLD: HealthThreshold = { metricKey: 'steps', value: 8000, comparison: 'gte' };

interface QuestFormValues {
  name: string;
  statAffinity: StatAffinity;
  strictness: Strictness;
  time: string | null;
  durationMinutes: number;
  frequency: RecurrenceFrequency;
  interval: number;
  days: Weekday[];
  threshold: boolean;
}

type QuestFormMode = { kind: 'create'; initial: QuestFormValues } | { kind: 'edit'; quest: Quest; scheduleLocked: boolean };

function duplicateValues(duplicate: Partial<QuestDuplicateSearch>): QuestFormValues {
  return {
    name: duplicate.duplicateName ?? '',
    statAffinity: duplicate.duplicateStatAffinity ?? 'mind',
    strictness: duplicate.duplicateStrictness ?? 'routine',
    time: formatTime(duplicate.duplicateStartTimeMinutes ?? null),
    durationMinutes: duplicate.duplicateDurationMinutes ?? 25,
    frequency: duplicate.duplicateFrequency ?? 'weekly',
    interval: duplicate.duplicateInterval ?? DEFAULT_INTERVAL,
    days: duplicate.duplicateDays ?? DEFAULT_DAYS,
    threshold: duplicate.duplicateThreshold ?? false,
  };
}

function questValues(quest: Quest): QuestFormValues {
  const { recurrence } = quest;
  return {
    name: quest.name,
    statAffinity: quest.statAffinity,
    strictness: quest.strictness,
    time: formatTime(quest.startTimeMinutes),
    durationMinutes: quest.durationMinutes,
    frequency: recurrence.frequency,
    interval: recurrence.frequency === 'daily' ? recurrence.interval : DEFAULT_INTERVAL,
    days: recurrence.frequency === 'weekly' ? recurrence.daysOfWeek : DEFAULT_DAYS,
    threshold: quest.healthThreshold !== null,
  };
}

function newRecurrence(today: string): Recurrence {
  return { frequency: 'weekly', interval: 1, daysOfWeek: [], dayOfMonth: null, startDate: today, end: { kind: 'never' }, exceptions: [] };
}

function recurrenceFrom(values: QuestFormValues, base: Recurrence): Recurrence {
  if (values.frequency === 'daily') return { ...base, frequency: 'daily', interval: values.interval, daysOfWeek: WEEKDAYS };
  return { ...base, frequency: 'weekly', interval: base.frequency === 'weekly' ? base.interval : 1, daysOfWeek: values.days };
}

function sameSchedule(next: Recurrence, current: Recurrence): boolean {
  if (next.frequency !== current.frequency || next.interval !== current.interval) return false;
  return next.frequency !== 'weekly' || WEEKDAYS.every(day => next.daysOfWeek.includes(day) === current.daysOfWeek.includes(day));
}

function startTimeOf(values: QuestFormValues): number | null {
  return values.time ? parseMinuteOfDay(values.time) : null;
}

function draftFrom(values: QuestFormValues, today: string): QuestDraft {
  const startTimeMinutes = startTimeOf(values);
  return {
    name: values.name.trim(),
    notes: null,
    startTimeMinutes,
    durationMinutes: values.durationMinutes,
    statAffinity: values.statAffinity,
    strictness: values.strictness,
    optionalStreakOptIn: values.strictness === 'optional',
    recurrence: recurrenceFrom(values, newRecurrence(today)),
    consequences: [],
    moduleLink: null,
    notification: { enabled: startTimeMinutes !== null, leadMinutes: 10 },
    healthThreshold: values.threshold ? DEFAULT_HEALTH_THRESHOLD : null,
    active: true,
  };
}

function questPatch(quest: Quest, values: QuestFormValues, scheduleLocked: boolean, today: string): Partial<QuestDraft> {
  const patch: Partial<QuestDraft> = {};
  const name = values.name.trim();
  if (name !== quest.name) patch.name = name;
  if (values.statAffinity !== quest.statAffinity) patch.statAffinity = values.statAffinity;
  if (values.durationMinutes !== quest.durationMinutes) patch.durationMinutes = values.durationMinutes;
  if (values.threshold !== (quest.healthThreshold !== null)) patch.healthThreshold = values.threshold ? DEFAULT_HEALTH_THRESHOLD : null;
  if (scheduleLocked) return patch;

  const startTimeMinutes = startTimeOf(values);
  if (startTimeMinutes !== quest.startTimeMinutes) {
    patch.startTimeMinutes = startTimeMinutes;
    if ((startTimeMinutes === null) !== (quest.startTimeMinutes === null)) patch.notification = { ...quest.notification, enabled: startTimeMinutes !== null };
  }
  if (values.strictness !== quest.strictness) {
    patch.strictness = values.strictness;
    patch.optionalStreakOptIn = values.strictness === 'optional';
  }
  if (!BUILDER_FREQUENCIES.includes(quest.recurrence.frequency)) return patch;
  const recurrence = recurrenceFrom(values, { ...quest.recurrence, startDate: quest.recurrence.startDate || today });
  if (!sameSchedule(recurrence, quest.recurrence)) patch.recurrence = recurrence;
  return patch;
}

function lockedValues(values: QuestFormValues, quest: Quest): QuestFormValues {
  const original = questValues(quest);
  return { ...values, strictness: original.strictness, time: original.time, frequency: original.frequency, interval: original.interval, days: original.days };
}

function intervalOutOfRange(values: QuestFormValues): boolean {
  return values.frequency === 'daily' && (values.interval < INTERVAL_MIN || values.interval > INTERVAL_MAX);
}

function blockedReason(values: QuestFormValues, scheduleEditable: boolean, unchanged: boolean): string | null {
  if (values.name.trim().length === 0) return 'Give the quest a name.';
  if (scheduleEditable && values.frequency === 'weekly' && values.days.length === 0) return 'Pick at least one day.';
  if (scheduleEditable && intervalOutOfRange(values)) return `Repeat every ${INTERVAL_MIN} to ${INTERVAL_MAX} days.`;
  if (values.strictness === 'anchor' && startTimeOf(values) === null) return 'An Anchor quest needs a start time.';
  if (values.durationMinutes < DURATION_MIN || values.durationMinutes > DURATION_MAX) return `Usual length must be between ${DURATION_MIN} and ${DURATION_MAX} minutes.`;
  return unchanged ? 'Nothing has changed yet.' : null;
}

function repeatsHelper(mode: QuestFormMode, values: QuestFormValues, scheduleLocked: boolean): string {
  if (scheduleLocked) return 'Locked with today’s plan.';
  if (mode.kind === 'edit' && !BUILDER_FREQUENCIES.includes(mode.quest.recurrence.frequency))
    return `${recurrenceSummary(mode.quest.recurrence)} — this schedule can’t be changed here.`;
  if (values.frequency !== 'daily') return 'Six days a week is the pattern most people keep.';
  if (mode.kind === 'create' || mode.quest.recurrence.startDate === '') return `Counted from today, every ${INTERVAL_MIN} to ${INTERVAL_MAX} days.`;
  return `Counted from ${formatShortDate(mode.quest.recurrence.startDate)}, every ${INTERVAL_MIN} to ${INTERVAL_MAX} days.`;
}

export function QuestBuilderScreen(): ReactElement {
  const duplicate = useSearch({ strict: false }) as Partial<QuestDuplicateSearch>;

  return (
    <section className={styles.screen} aria-labelledby="quest-form-title">
      <QuestForm mode={{ kind: 'create', initial: duplicateValues(duplicate) }} />
    </section>
  );
}

export interface QuestEditScreenProps {
  questId: string;
}

export function QuestEditScreen({ questId }: QuestEditScreenProps): ReactElement {
  const navigate = useNavigate();
  const detail = useQuestDetail(questId);
  const showSkeleton = detail.isPending || (detail.isFetching && !detail.data);

  return (
    <section className={styles.screen} aria-labelledby="quest-form-title">
      <div className={styles.actionRow}>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/quests/$questId" params={{ questId }}>
            ‹ Quest details
          </Link>
        </Button>
      </div>

      <DataState skeleton={<QuestFormSkeleton />} size="page">
        {showSkeleton ? (
          <QuestFormSkeleton />
        ) : detail.isError || !detail.data ? (
          <EmptyState
            title={<h1 id="quest-form-title">This quest isn’t here</h1>}
            description="It may have been removed, or the link is wrong."
            action={{ label: 'Back to Quests', onClick: () => void navigate({ to: '/quests' }) }}
          />
        ) : (
          <QuestForm key={`${detail.data.quest.id}:${detail.data.quest.updatedAt}`} mode={{ kind: 'edit', quest: detail.data.quest, scheduleLocked: detail.data.scheduleLocked }} />
        )}
      </DataState>
    </section>
  );
}

function QuestFormSkeleton(): ReactElement {
  return (
    <>
      <h1 className={styles.title} id="quest-form-title">
        Edit quest
      </h1>
      <Skeleton.Card />
    </>
  );
}

interface FieldGroupProps {
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-label': string;
  className?: string;
  children: ReactNode;
}

function FieldGroup({ invalid, disabled, children, ...props }: FieldGroupProps): ReactElement {
  return (
    <div role="group" data-invalid={invalid || undefined} aria-disabled={disabled || undefined} {...props}>
      {children}
    </div>
  );
}

function QuestForm({ mode }: { mode: QuestFormMode }): ReactElement {
  const navigate = useNavigate();
  const { today } = useMemoirData();
  const command = useCommand();
  const heading = useRef<HTMLHeadingElement>(null);

  const editing = mode.kind === 'edit';
  const scheduleLocked = mode.kind === 'edit' && mode.scheduleLocked;
  const scheduleEditable = !scheduleLocked && (mode.kind === 'create' || BUILDER_FREQUENCIES.includes(mode.quest.recurrence.frequency));

  const [edited, setEdited] = useState<QuestFormValues>(() => (mode.kind === 'create' ? mode.initial : questValues(mode.quest)));
  const [nameTouched, setNameTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const values = mode.kind === 'edit' && scheduleLocked ? lockedValues(edited, mode.quest) : edited;
  const update = <K extends keyof QuestFormValues>(key: K, value: QuestFormValues[K]): void => setEdited(current => ({ ...current, [key]: value }));

  const draft = useMemo(() => draftFrom(values, today), [values, today]);
  const patch = mode.kind === 'edit' ? questPatch(mode.quest, values, scheduleLocked, today) : null;
  const blocked = blockedReason(values, scheduleEditable, patch !== null && Object.keys(patch).length === 0);

  const nameMissing = values.name.trim().length === 0;
  const daysMissing = values.frequency === 'weekly' && values.days.length === 0;
  const anchorNeedsTime = values.strictness === 'anchor' && startTimeOf(values) === null;
  const durationOutOfRange = values.durationMinutes < DURATION_MIN || values.durationMinutes > DURATION_MAX;
  const strictnessLevels = STRICTNESS_ORDER.includes(values.strictness) ? STRICTNESS_ORDER : [...STRICTNESS_ORDER, values.strictness];

  useEffect(() => {
    if (editing) heading.current?.focus();
  }, [editing]);

  const submit = async (): Promise<void> => {
    if (blocked !== null) return;
    setSubmitError(null);
    const outcome =
      mode.kind === 'create' ? await command.run({ type: 'quest.create', draft }) : await command.run({ type: 'quest.update', questId: mode.quest.id, patch: patch ?? {} });
    if (outcome.status === 'needs-confirmation') return;

    const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { success: saved ? outcome.local.message : '', action: editing ? 'save' : 'create', subject: draft.name });
    if (!saved) {
      setSubmitError(outcome.message);
      return;
    }
    if (mode.kind === 'create') await navigate({ to: '/quests' });
    else await navigate({ to: '/quests/$questId', params: { questId: mode.quest.id }, replace: true });
  };

  const cancel = (): void => {
    if (mode.kind === 'create') void navigate({ to: '/quests' });
    else void navigate({ to: '/quests/$questId', params: { questId: mode.quest.id }, replace: true });
  };

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card padding="lg">
          <Card.Body>
            <h1 className={styles.detailTitle} id="quest-form-title" ref={heading} tabIndex={-1}>
              {editing ? 'Edit quest' : 'New quest'}
            </h1>
            <p className={styles.cardBody}>
              {editing
                ? 'Changes apply from today on. Days already logged keep the record they were logged with.'
                : 'Three decisions: what it is, when it happens, and how strict you want it to be.'}
            </p>

            <div className={styles.form}>
              <FormField
                label="Quest name"
                required
                helper="Written as a promise, not a task — “Read 20 pages” keeps better than “Read more”."
                error={nameTouched && nameMissing ? 'Give the quest a name.' : undefined}
              >
                <Input
                  value={values.name}
                  onValueChange={value => {
                    update('name', value);
                    setNameTouched(true);
                  }}
                  onBlur={() => setNameTouched(true)}
                  placeholder="Read 20 pages"
                  aria-label="Quest name"
                />
              </FormField>

              <div className={styles.formRow}>
                <FormField label="Category" helper="Decides which lifetime stat grows.">
                  <Select value={values.statAffinity} onValueChange={value => update('statAffinity', value as StatAffinity)} aria-label="Category">
                    {STAT_ORDER.map(stat => (
                      <Select.Item key={stat} value={stat}>
                        {STAT_LABELS[stat]}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Time of day"
                  helper={scheduleLocked ? 'Locked with today’s plan.' : 'Optional. An untimed quest is judged on the day, not the hour.'}
                  error={anchorNeedsTime ? 'An Anchor quest needs a start time.' : undefined}
                  disabled={scheduleLocked}
                >
                  <TimePicker value={values.time} onValueChange={value => update('time', value)} hour12={false} aria-label="Time of day" className={styles.timeField} />
                </FormField>
                <FormField
                  label="Usual length"
                  helper="Used for the day’s load, never as a timer."
                  error={durationOutOfRange ? `Between ${DURATION_MIN} and ${DURATION_MAX} minutes.` : undefined}
                >
                  <NumberStepper
                    value={values.durationMinutes}
                    onValueChange={value => update('durationMinutes', value ?? 0)}
                    min={DURATION_MIN}
                    max={DURATION_MAX}
                    step={5}
                    precision={0}
                    aria-label="Usual length in minutes"
                  />
                </FormField>
              </div>

              <div>
                <p className={styles.fieldLabel}>Strictness</p>
                <div className={styles.strictnessGrid} role="group" aria-label="Strictness">
                  {strictnessLevels.map(level => (
                    <button
                      key={level}
                      type="button"
                      className={styles.strictnessCard}
                      data-selected={values.strictness === level}
                      aria-pressed={values.strictness === level}
                      disabled={scheduleLocked}
                      onClick={() => update('strictness', level)}
                    >
                      <span className={styles.strictnessName}>{STRICTNESS_LABELS[level]}</span>
                      <span className={styles.strictnessRule}>{STRICTNESS_RULES[level]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <FormField
                label="Repeats"
                helper={repeatsHelper(mode, values, scheduleLocked)}
                error={
                  scheduleEditable && daysMissing
                    ? 'Pick at least one day.'
                    : scheduleEditable && intervalOutOfRange(values)
                      ? `Repeat every ${INTERVAL_MIN} to ${INTERVAL_MAX} days.`
                      : undefined
                }
                disabled={scheduleLocked}
              >
                <FieldGroup aria-label="Repeats" className={styles.repeats}>
                  {BUILDER_FREQUENCIES.includes(values.frequency) ? (
                    <>
                      <SegmentedControl value={values.frequency} onValueChange={value => update('frequency', value as RecurrenceFrequency)} disabled={!scheduleEditable} fullWidth>
                        <SegmentedControl.Item value="weekly">Days of week</SegmentedControl.Item>
                        <SegmentedControl.Item value="daily">Every N days</SegmentedControl.Item>
                      </SegmentedControl>
                      {values.frequency === 'daily' ? (
                        <NumberStepper
                          value={values.interval}
                          onValueChange={value => update('interval', value ?? 1)}
                          min={INTERVAL_MIN}
                          max={INTERVAL_MAX}
                          precision={0}
                          clampOnBlur={false}
                          invalid={intervalOutOfRange(values)}
                          disabled={!scheduleEditable}
                          aria-label="Repeat every N days"
                        />
                      ) : (
                        <div className={styles.dayToggles}>
                          {WEEKDAYS.map(day => (
                            <button
                              key={day}
                              type="button"
                              className={styles.dayToggle}
                              data-selected={values.days.includes(day)}
                              aria-pressed={values.days.includes(day)}
                              disabled={!scheduleEditable}
                              onClick={() => update('days', values.days.includes(day) ? values.days.filter(item => item !== day) : [...values.days, day])}
                            >
                              {WEEKDAY_LABELS[day]}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </FieldGroup>
              </FormField>

              <div className={styles.switches}>
                <Switch
                  checked={values.threshold}
                  onCheckedChange={value => update('threshold', value)}
                  label="Complete from a health threshold"
                  description={`${questThresholdLabel(mode.kind === 'edit' && mode.quest.healthThreshold ? mode.quest.healthThreshold : DEFAULT_HEALTH_THRESHOLD)}. When a logged metric passes it, Memoir offers to complete this quest. It never completes it for you.`}
                />
              </div>
            </div>
          </Card.Body>
        </Card>

        {submitError ? (
          <Alert intent="danger" title={editing ? 'Changes not saved' : 'Quest not created'}>
            {submitError}
          </Alert>
        ) : null}

        <div className={styles.formFooter}>
          {blocked ? (
            <p className={styles.formHint} id="quest-form-blocked">
              {blocked}
            </p>
          ) : null}
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={command.isPending}
            disabled={blocked !== null || command.isPending}
            aria-describedby={blocked ? 'quest-form-blocked' : undefined}
          >
            {editing ? 'Save changes' : 'Create quest'}
          </Button>
        </div>
      </div>

      <div className={styles.column}>
        {mode.kind === 'create' ? (
          <WeekEffect draft={{ ...draft, durationMinutes: Math.min(DURATION_MAX, Math.max(DURATION_MIN, draft.durationMinutes)) }} />
        ) : scheduleLocked ? (
          <Alert intent="info" title="Schedule and strictness are read-only today">
            Today’s plan is locked, so the time of day, repeats and strictness can’t change until tomorrow. Name, category and usual length can.
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function WeekEffect({ draft }: { draft: QuestDraft }): ReactElement {
  const preview = useDraftPreview(draft);

  return (
    <>
      <Card padding="md">
        <Card.Body>
          <h2 className={styles.cardTitle}>Effect on your week</h2>
          {preview.data?.cadenceNote ? <p className={styles.cardBody}>{preview.data.cadenceNote}</p> : null}
          <ul className={styles.loadList}>
            {(preview.data?.days ?? []).map(day => (
              <li key={day.date}>
                <div className={styles.loadHead}>
                  <span>{day.label}</span>
                  <span className={styles.mono}>
                    {formatDuration(day.minutes)}
                    {day.overCapacity ? ' · over capacity' : ''}
                  </span>
                </div>
                <div className={styles.loadTrack}>
                  <span className={styles.loadFill} data-over={day.overCapacity || undefined} style={{ width: `${day.loadPercent}%` }} />
                  <span className={styles.capacityMark} style={{ left: `${day.capacityMarkPercent}%` }} aria-hidden />
                </div>
              </li>
            ))}
          </ul>
        </Card.Body>
      </Card>

      {preview.data?.overloadNote ? (
        <Alert intent="warning" title="One day would carry more than usual">
          {preview.data.overloadNote}
        </Alert>
      ) : null}
    </>
  );
}
