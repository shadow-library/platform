import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, DescriptionList, FormField, Input, RadioGroup, SegmentedControl, Select, Slider, Tag, TimePicker } from '@shadow-library/ui';

import {
  notifyOutcome,
  type QuestDraft,
  STAT_LABELS,
  type StatAffinity,
  type Strictness,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useAccountCommand,
  useCommand,
  useDayPreferences,
  type Weekday,
  WEEKDAY_LABELS,
  weekdayOf,
  WEEKDAYS,
} from '@/lib/data';
import { accountDay, formatCount, parseMinuteOfDay, timeZoneOptions } from '@/lib/format';

import styles from './onboarding.module.css';

type Recurrence = 'daily' | 'chosen' | 'count';

type OnboardingStrictness = Exclude<Strictness, 'recovery'>;

type SetupState = 'unsaved' | 'saved-here' | 'saved-elsewhere';

interface SubmitError {
  title: string;
  message: string;
  hint: string;
}

const HEADINGS: { title: string; subtitle: string }[] = [
  { title: 'Set up your day', subtitle: 'Two decisions about time, one about money.' },
  { title: 'Your first quest', subtitle: 'A promise, not a task.' },
  { title: 'When it happens', subtitle: 'Fewer days kept beats more days planned.' },
  { title: 'How strict is it?', subtitle: 'This is the setting that decides how the app feels.' },
  { title: 'Ready', subtitle: 'One quest, with nothing else in the way.' },
];

const LAST_STEP = HEADINGS.length - 1;

const CURRENCIES = [
  { value: 'EUR', label: 'EUR €' },
  { value: 'NOK', label: 'NOK kr' },
  { value: 'USD', label: 'USD $' },
  { value: 'GBP', label: 'GBP £' },
];

const EXAMPLES = ['Read 10 pages', 'Walk 20 minutes', 'No takeaway today', 'Write one line', 'Bed by 22:30'];

const NAME_MAX_LENGTH = 120;

const QUEST_MINUTES = 10;

const LIGHT_WEEK_DAYS = 3;

const STATS: { stat: StatAffinity; description: string }[] = [
  { stat: 'body', description: 'Movement, sleep, food, strength' },
  { stat: 'mind', description: 'Reading, writing, study, focus' },
  { stat: 'wealth', description: 'Spending, saving, admin' },
  { stat: 'discipline', description: 'Anchors, tidiness, follow-through' },
];

const STRICTNESS_ORDER: OnboardingStrictness[] = ['optional', 'goal', 'routine', 'anchor'];

const STRICTNESS_COSTS: Record<OnboardingStrictness, string> = {
  optional: 'no cost, ever',
  goal: 'streak ends, no HP',
  routine: 'streak ends, 1 HP',
  anchor: 'streak ends, 1 HP, fixed time',
};

const SPREAD_DAYS: Weekday[][] = [
  ['mon'],
  ['tue', 'fri'],
  ['mon', 'wed', 'fri'],
  ['mon', 'tue', 'thu', 'fri'],
  ['mon', 'tue', 'wed', 'thu', 'fri'],
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  WEEKDAYS,
];

const WEEKDAY_NAMES: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const SETUP_NOT_SAVED = 'That could not be saved.';

const CHECK_CONNECTION = 'Check your connection and try again.';

function isOnboardingStrictness(value: string): value is OnboardingStrictness {
  return STRICTNESS_ORDER.some(option => option === value);
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function scheduledDays(recurrence: Recurrence, chosen: Weekday[], timesPerWeek: number): Weekday[] {
  if (recurrence === 'daily') return WEEKDAYS;
  if (recurrence === 'count') return SPREAD_DAYS[timesPerWeek - 1] ?? WEEKDAYS;
  return WEEKDAYS.filter(weekday => chosen.includes(weekday));
}

function firstDay(days: Weekday[], today: string): Weekday | null {
  const start = WEEKDAYS.indexOf(weekdayOf(today));
  const ordered = [...WEEKDAYS.slice(start), ...WEEKDAYS.slice(0, start)];
  return ordered.find(weekday => days.includes(weekday)) ?? null;
}

/**
 * The first run, in five steps and under two minutes. Nothing is written until the last one, and the home
 * currency is the single decision that becomes read-only afterwards so historical totals stay comparable.
 */
export function OnboardingScreen(): ReactElement {
  const navigate = useNavigate();
  const day = useDayPreferences();
  const command = useAccountCommand();
  const questCommand = useCommand();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState('EUR');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [sleepTime, setSleepTime] = useState('22:30');
  const [browserZone] = useState(browserTimeZone);
  const [timezone, setTimezone] = useState(browserZone);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [stat, setStat] = useState<StatAffinity>('mind');
  const [strictness, setStrictness] = useState<OnboardingStrictness>('goal');
  const [recurrence, setRecurrence] = useState<Recurrence>('chosen');
  const [days, setDays] = useState<Weekday[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [timesPerWeek, setTimesPerWeek] = useState(4);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [setup, setSetup] = useState<SetupState>('unsaved');
  const onboardedRef = useRef(false);
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const setupSaved = setup !== 'unsaved';
  const savedDay = day.data?.currencyLocked ? day.data : null;
  const shownDay = setupSaved && savedDay ? savedDay : { wakeTime, sleepTime, timezone, currency };
  const shownCurrency = savedDay?.currency ?? currency;
  const savedDayUnread = setup === 'saved-elsewhere' && savedDay === null;
  const zoneOptions = useMemo(() => timeZoneOptions(shownDay.timezone), [shownDay.timezone]);
  const today = accountDay(shownDay.timezone);
  const questName = name.trim();
  const schedule = scheduledDays(recurrence, days, timesPerWeek);
  const dayCount = schedule.length;
  const startsOn = firstDay(schedule, today);
  const startsToday = startsOn === weekdayOf(today);
  const startsLabel = startsOn ? WEEKDAY_NAMES[startsOn] : null;
  const currencyLocked = setupSaved || savedDay !== null;
  const startTimeMinutes = strictness === 'anchor' && startTime ? parseMinuteOfDay(startTime) : null;
  const anchorNeedsTime = strictness === 'anchor' && startTimeMinutes === null;
  const isSubmitting = command.isPending || questCommand.isPending;

  const heading = HEADINGS[step] as (typeof HEADINGS)[number];
  const subtitle =
    step === LAST_STEP
      ? startsToday
        ? 'One quest, on today, with nothing else in the way.'
        : `One quest, starting ${startsLabel}, with nothing else in the way.`
      : heading.subtitle;

  const problems: (string | null)[] = [
    null,
    questName.length === 0 ? 'Name the promise to continue.' : null,
    dayCount === 0 ? 'Choose at least one day.' : null,
    anchorNeedsTime ? 'Anchor needs a start time before you can continue.' : null,
    null,
  ];
  const problem = problems[step] ?? null;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const toggleDay = (weekday: Weekday): void => {
    setDays(current => (current.includes(weekday) ? current.filter(item => item !== weekday) : [...current, weekday]));
  };

  const draft = (): QuestDraft => ({
    name: questName,
    notes: null,
    startTimeMinutes,
    durationMinutes: QUEST_MINUTES,
    statAffinity: stat,
    strictness,
    optionalStreakOptIn: strictness === 'optional',
    recurrence: {
      frequency: recurrence === 'daily' ? 'daily' : 'weekly',
      interval: 1,
      daysOfWeek: recurrence === 'daily' ? [] : schedule,
      dayOfMonth: null,
      startDate: today,
      end: { kind: 'never' },
      exceptions: [],
    },
    consequences: [],
    moduleLink: null,
    notification: { enabled: false, leadMinutes: 0 },
    healthThreshold: null,
    active: true,
  });

  /**
   * The quest is created after the account is onboarded, because the gate on `/` only lets go once
   * `onboarding_completed_at` is set. `submittingRef` blocks a re-entrant call synchronously — before
   * `isPending` has even re-rendered the button — so a double-click can never send a second request, and
   * `onboardedRef` remembers a completed (or already-completed) account across a retry so a quest that
   * failed to create is retried without re-submitting onboarding or creating a second quest.
   */
  const finish = async (): Promise<void> => {
    if (problems.some(Boolean) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitError(null);

    try {
      if (!onboardedRef.current) {
        const outcome = await command.run({ type: 'onboarding.complete', submission: { currency, timezone, wakeTime, sleepTime } });
        const alreadyOnboarded = outcome.status === 'rejected' && outcome.code === 'ACC_003';
        if (outcome.status !== 'applied' && !alreadyOnboarded) {
          const unreachable = outcome.status === 'queued-offline' || outcome.status === 'failed';
          setSubmitError({
            title: 'Setup wasn’t saved',
            message: outcome.status === 'queued-offline' ? SETUP_NOT_SAVED : outcome.message,
            hint: `Nothing was changed. ${unreachable ? CHECK_CONNECTION : 'Check the details and try again.'}`,
          });
          return;
        }
        onboardedRef.current = true;
        setSetup(alreadyOnboarded ? 'saved-elsewhere' : 'saved-here');
      }

      const questOutcome = await questCommand.run({ type: 'quest.create', draft: draft() });
      if (questOutcome.status === 'needs-confirmation') return;

      if (questOutcome.status === 'applied' || questOutcome.status === 'queued-offline') {
        notifyOutcome(questOutcome, { success: questOutcome.local.message, action: 'create', subject: questName });
        await navigate({ to: '/' });
        return;
      }
      setSubmitError({
        title: 'Your first quest could not be created',
        message: questOutcome.message,
        hint: `Your day and currency are saved. ${questOutcome.status === 'failed' ? CHECK_CONNECTION : 'Go back to change the quest, then try again.'}`,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const advanceOrFinish = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (step === LAST_STEP) {
      void finish();
      return;
    }
    if (problem) return;
    setSubmitError(null);
    setStep(current => Math.min(LAST_STEP, current + 1));
  };

  const defaultFootNote =
    step === 0
      ? setupSaved
        ? 'Already saved.'
        : 'Nothing is saved until the last step.'
      : step === LAST_STEP
        ? 'You can change all of this later.'
        : 'Two minutes, and no tour afterwards.';
  const footNote = (step === 2 ? null : problem) ?? defaultFootNote;

  return (
    <section className={styles.page} aria-labelledby="onboarding-title">
      <form className={styles.wrap} onSubmit={advanceOrFinish} noValidate>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h1 className={styles.title} id="onboarding-title">
              Set up
            </h1>
            <h2 ref={headingRef} tabIndex={-1} className={styles.subtitle}>
              {heading.title} · {subtitle}
            </h2>
          </div>
          <span className={styles.stepLabel}>
            Step {step + 1} of {HEADINGS.length}
          </span>
        </div>

        <div className={styles.dots} role="img" aria-label={`Step ${step + 1} of ${HEADINGS.length}`}>
          {HEADINGS.map((item, index) => (
            <span key={item.title} className={styles.dot} data-reached={index <= step} />
          ))}
        </div>

        {step === 0 ? (
          <Card padding="lg">
            <Card.Body>
              <p className={styles.lead}>
                A day in Shadow Memoir runs from when you wake to when you sleep, not from midnight. Two times and a currency, and you never have to think about this again.
              </p>
              <div className={styles.fields}>
                <FormField label="Wake time" helper="Quests scheduled before this are not counted late." disabled={setupSaved}>
                  <TimePicker value={shownDay.wakeTime} onValueChange={value => setWakeTime(value ?? wakeTime)} hour12={false} disabled={setupSaved} />
                </FormField>
                <FormField label="Sleep time" helper="Your day closes here — logs after it still belong to today." disabled={setupSaved}>
                  <TimePicker value={shownDay.sleepTime} onValueChange={value => setSleepTime(value ?? sleepTime)} hour12={false} disabled={setupSaved} />
                </FormField>
                <FormField
                  label="Timezone"
                  helper={
                    shownDay.timezone === browserZone
                      ? 'Detected from your browser. Travel will not move your day unless you change it.'
                      : `Your browser is set to ${browserZone.replace(/_/g, ' ')}. Travel will not move your day unless you change it.`
                  }
                  disabled={setupSaved}
                >
                  <Select value={shownDay.timezone} aria-label="Timezone" disabled={setupSaved} onValueChange={setTimezone}>
                    {zoneOptions.map(zone => (
                      <Select.Item key={zone.value} value={zone.value}>
                        {zone.label}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Home currency"
                  helper={
                    currencyLocked
                      ? 'Already set, and fixed from here so your totals stay comparable.'
                      : 'Chosen once. Spend in another currency keeps its own and converts to this one, and this stays fixed afterwards.'
                  }
                  disabled={currencyLocked}
                >
                  <Select value={shownCurrency} aria-label="Home currency" disabled={currencyLocked} onValueChange={setCurrency}>
                    {CURRENCIES.map(option => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
              </div>
              <p className={styles.note}>
                {savedDayUnread
                  ? 'Setup was already finished for this account, and its saved day and currency couldn’t be loaded on this device yet, so what is shown here may not match. Check them in Settings once your first quest is created.'
                  : setupSaved
                    ? 'These are already saved, so they can’t be changed here. Wake, sleep and time zone can be changed in Settings once your first quest is created.'
                    : 'Everything else here can be changed in Settings, including after a year of history. Changing your wake window never rewrites past days.'}
              </p>
            </Card.Body>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card padding="lg">
            <Card.Body>
              <p className={styles.lead}>One quest is enough to start. Pick something you could do today even on a bad day — the point is the promise, not the size of it.</p>
              <FormField
                label="What is the promise?"
                required
                helper="Concrete beats ambitious: read ten pages keeps better than read more."
                error={nameTouched && problem ? 'Name the promise — for example, read 10 pages.' : undefined}
              >
                <Input
                  value={name}
                  onValueChange={value => {
                    setName(value);
                    setNameTouched(true);
                  }}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Read 10 pages"
                  maxLength={NAME_MAX_LENGTH}
                  size="lg"
                />
              </FormField>
              <div className={styles.examples}>
                {EXAMPLES.map(example => (
                  <Button key={example} size="sm" variant="secondary" onClick={() => setName(example)}>
                    {example}
                  </Button>
                ))}
              </div>
              <p className={styles.groupLabel}>Which part of you does it grow?</p>
              <div className={styles.choices} role="group" aria-label="Stat">
                {STATS.map(option => (
                  <button key={option.stat} type="button" className={styles.choice} aria-pressed={stat === option.stat} onClick={() => setStat(option.stat)}>
                    <span className={styles.choiceName}>{STAT_LABELS[option.stat]}</span>
                    <span className={styles.choiceDesc}>{option.description}</span>
                  </button>
                ))}
              </div>
            </Card.Body>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card padding="lg">
            <Card.Body>
              <p className={styles.lead}>When should “{questName}” come round? Most people start with fewer days than they expect to keep.</p>
              <SegmentedControl value={recurrence} onValueChange={value => setRecurrence(value as Recurrence)} fullWidth>
                <SegmentedControl.Item value="daily">Every day</SegmentedControl.Item>
                <SegmentedControl.Item value="chosen">Chosen days</SegmentedControl.Item>
                <SegmentedControl.Item value="count">Times a week</SegmentedControl.Item>
              </SegmentedControl>

              {recurrence === 'chosen' ? (
                <>
                  <div className={styles.weekdays} role="group" aria-label="Days of the week" aria-describedby={dayCount === 0 ? 'onboarding-days-error' : undefined}>
                    {WEEKDAYS.map(weekday => (
                      <button key={weekday} type="button" className={styles.weekday} aria-pressed={days.includes(weekday)} onClick={() => toggleDay(weekday)}>
                        {WEEKDAY_LABELS[weekday]}
                      </button>
                    ))}
                  </div>
                  {dayCount === 0 ? (
                    <p id="onboarding-days-error" className={styles.fieldError} role="alert">
                      {problem}
                    </p>
                  ) : null}
                </>
              ) : null}

              {recurrence === 'count' ? (
                <div className={styles.count}>
                  <Slider
                    label="How many days a week?"
                    aria-label="Days a week"
                    value={timesPerWeek}
                    min={1}
                    max={7}
                    step={1}
                    marks
                    formatValue={value => formatCount(value, 'day', 'days')}
                    onValueChange={value => setTimesPerWeek(Array.isArray(value) ? (value[0] ?? 1) : value)}
                  />
                  <p className={styles.note}>
                    {dayCount === 7
                      ? 'That is every day of the week.'
                      : `Spread across your week on ${schedule.map(weekday => WEEKDAY_LABELS[weekday]).join(', ')}. Choose the exact days with Chosen days.`}
                  </p>
                </div>
              ) : null}

              <div className={styles.preview}>
                <p className={styles.groupLabel}>Your week would look like this</p>
                <div className={styles.previewDays}>
                  {WEEKDAYS.map(weekday => (
                    <div key={weekday} className={styles.previewDay}>
                      <div>{WEEKDAY_LABELS[weekday]}</div>
                      <div className={styles.previewMark} data-on={schedule.includes(weekday)} />
                    </div>
                  ))}
                </div>
                <p className={styles.note}>
                  {formatCount(dayCount, 'day', 'days')} a week · about {formatCount(dayCount * QUEST_MINUTES, 'minute', 'minutes')} of promises.{' '}
                  {dayCount <= LIGHT_WEEK_DAYS ? 'Light enough to keep on a bad week.' : 'If a bad week makes it hard to keep, drop a day rather than the quest.'}
                </p>
              </div>
            </Card.Body>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card padding="lg">
            <Card.Body>
              <p className={styles.lead}>
                How much should a missed day cost? This is the one setting that changes how the app feels. You can lower it at any time, and raising it takes effect next week.
              </p>
              <p className={styles.note}>Whatever you choose, a miss never removes experience or a level.</p>
              <RadioGroup
                className={styles.strictness}
                aria-label="Strictness"
                value={strictness}
                onValueChange={value => {
                  if (isOnboardingStrictness(value)) setStrictness(value);
                }}
              >
                {STRICTNESS_ORDER.map(option => (
                  <RadioGroup.Item
                    key={option}
                    value={option}
                    className={styles.strictRow}
                    label={
                      <span className={styles.strictHead}>
                        <span className={styles.strictName}>{STRICTNESS_LABELS[option]}</span>
                        <span className={styles.strictCost}>{STRICTNESS_COSTS[option]}</span>
                      </span>
                    }
                    description={STRICTNESS_RULES[option]}
                  />
                ))}
              </RadioGroup>

              {strictness === 'anchor' ? (
                <FormField
                  label="Start time"
                  required
                  helper="Anchor quests happen at a fixed time each day, with thirty minutes of grace."
                  error={anchorNeedsTime ? 'Choose a start time to continue.' : undefined}
                  className={styles.startTimeField}
                >
                  <TimePicker value={startTime} onValueChange={setStartTime} hour12={false} aria-label="Start time" />
                </FormField>
              ) : null}

              <Alert intent="info" title="Shields cover the days you could not help">
                You earn one shield for each kept week, up to three. A shield protects a streak on an unavoidable miss, with no explanation required from you.
              </Alert>
            </Card.Body>
          </Card>
        ) : null}

        {step === LAST_STEP ? (
          <Card padding="lg">
            <Card.Body>
              <p className={styles.groupLabel}>Your first quest</p>
              <div className={styles.summaryName}>{questName}</div>
              <div className={styles.tags}>
                <Tag>{STAT_LABELS[stat]}</Tag>
                <Badge variant="outline">{STRICTNESS_LABELS[strictness]}</Badge>
                <Badge variant="soft" intent="neutral">
                  {dayCount === 7 ? 'Every day' : `${formatCount(dayCount, 'day', 'days')} a week`}
                </Badge>
              </div>
              <DescriptionList layout="row" termWidth={150}>
                <DescriptionList.Item term="First occurrence">
                  {startsToday ? 'Today · it goes on your Today screen as soon as you start' : `Starts ${startsLabel} · your Today screen stays clear until then`}
                </DescriptionList.Item>
                <DescriptionList.Item term="Reward">Experience when kept · {STAT_LABELS[stat]} up one</DescriptionList.Item>
                <DescriptionList.Item term="If you miss it">{STRICTNESS_RULES[strictness]}</DescriptionList.Item>
                <DescriptionList.Item term="Home currency">{shownCurrency} · fixed from here, so your totals stay comparable</DescriptionList.Item>
              </DescriptionList>
              <p className={styles.note}>
                {startsToday ? 'Next is your Today screen with this quest on it.' : `Next is your Today screen. This quest starts ${startsLabel}, so today stays clear until then.`}{' '}
                Nothing else is set up, and nothing else needs to be — expenses, meals, weight and journal all work whenever you first reach for them.
              </p>
              {submitError ? (
                <Alert intent="danger" title={submitError.title} action={{ label: 'Try again', onClick: () => void finish() }} className={styles.submitError}>
                  <p className={styles.errorLine}>{submitError.message}</p>
                  <p className={styles.errorLine}>{submitError.hint}</p>
                </Alert>
              ) : null}
            </Card.Body>
          </Card>
        ) : null}

        <div className={styles.footer}>
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0}
            onClick={() => {
              setSubmitError(null);
              setStep(current => Math.max(0, current - 1));
            }}
          >
            Back
          </Button>
          {step === LAST_STEP ? (
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Create it and start
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={problem !== null}>
              {step === LAST_STEP - 1 ? 'Review' : 'Continue'}
            </Button>
          )}
          <span className={styles.footNote}>{footNote}</span>
        </div>
      </form>
    </section>
  );
}
