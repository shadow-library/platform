import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, DescriptionList, FormField, Input, SegmentedControl, Select, Slider, Tag, TimePicker } from '@shadow-library/ui';

import {
  STAT_LABELS,
  type StatAffinity,
  type Strictness,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useAccountCommand,
  useDayPreferences,
  type Weekday,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from '@/lib/data';

import styles from './onboarding.module.css';

type Recurrence = 'daily' | 'chosen' | 'count';

const HEADINGS: { title: string; subtitle: string }[] = [
  { title: 'Set up your day', subtitle: 'Two decisions about time, one about money.' },
  { title: 'Your first quest', subtitle: 'A promise, not a task.' },
  { title: 'When it happens', subtitle: 'Fewer days kept beats more days planned.' },
  { title: 'How strict is it?', subtitle: 'This is the setting that decides how the app feels.' },
  { title: 'Ready', subtitle: 'One quest, on today, with nothing else in the way.' },
];

const CURRENCIES = [
  { value: 'EUR', label: 'EUR €' },
  { value: 'NOK', label: 'NOK kr' },
  { value: 'USD', label: 'USD $' },
  { value: 'GBP', label: 'GBP £' },
];

const TIMEZONES = ['Europe/Oslo', 'Europe/London', 'Europe/Lisbon', 'Europe/Berlin'];

const EXAMPLES = ['Read 10 pages', 'Walk 20 minutes', 'No takeaway today', 'Write one line', 'Bed by 22:30'];

const STATS: { stat: StatAffinity; description: string }[] = [
  { stat: 'body', description: 'Movement, sleep, food, strength' },
  { stat: 'mind', description: 'Reading, writing, study, focus' },
  { stat: 'wealth', description: 'Spending, saving, admin' },
  { stat: 'discipline', description: 'Anchors, tidiness, follow-through' },
];

const STRICTNESS_ORDER: Strictness[] = ['optional', 'goal', 'routine', 'anchor', 'recovery'];

const STRICTNESS_COSTS: Record<Strictness, string> = {
  optional: 'no cost, ever',
  goal: 'streak ends, no HP',
  routine: 'streak ends, 1 HP',
  anchor: 'streak ends, 1 HP, fixed time',
  recovery: 'offered after a miss',
};

/**
 * The first run, in five steps and under two minutes. Nothing is written until the last one, and the home
 * currency is the single decision that becomes read-only afterwards so historical totals stay comparable.
 */
export function OnboardingScreen(): ReactElement {
  const navigate = useNavigate();
  const day = useDayPreferences();
  const command = useAccountCommand();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState('EUR');
  const [name, setName] = useState('');
  const [stat, setStat] = useState<StatAffinity>('mind');
  const [strictness, setStrictness] = useState<Strictness>('goal');
  const [recurrence, setRecurrence] = useState<Recurrence>('chosen');
  const [days, setDays] = useState<Weekday[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [timesPerWeek, setTimesPerWeek] = useState(4);

  const heading = HEADINGS[step] as (typeof HEADINGS)[number];
  const questName = name.trim().length > 0 ? name.trim() : 'Your first quest';
  const dayCount = recurrence === 'daily' ? 7 : recurrence === 'count' ? timesPerWeek : days.length;
  const currencyLocked = day.data?.currencyLocked ?? false;

  const toggleDay = (weekday: Weekday): void => {
    setDays(current => (current.includes(weekday) ? current.filter(item => item !== weekday) : [...current, weekday]));
  };

  const finish = (): void => {
    command.mutate({ type: 'day.set', patch: { currency } });
    void navigate({ to: '/' });
  };

  return (
    <section className={styles.page} aria-labelledby="onboarding-title">
      <div className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={styles.brand}>Shadow Memoir</div>
            <h1 className={styles.title} id="onboarding-title">
              Set up
            </h1>
            <p className={styles.subtitle}>
              {heading.title} · {heading.subtitle}
            </p>
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
            <p className={styles.lead}>
              A day in Shadow Memoir runs from when you wake to when you sleep, not from midnight. Two times and a currency, and you never have to think about this again.
            </p>
            <div className={styles.fields}>
              <FormField label="Wake time" helper="Quests scheduled before this are not counted late.">
                <TimePicker defaultValue="06:30" />
              </FormField>
              <FormField label="Sleep time" helper="Your day closes here — logs after it still belong to today.">
                <TimePicker defaultValue="22:30" />
              </FormField>
              <FormField label="Timezone" helper="Detected from your browser. Travel will not move your day unless you change it.">
                <Select defaultValue="Europe/Oslo" aria-label="Timezone">
                  {TIMEZONES.map(zone => (
                    <Select.Item key={zone} value={zone}>
                      {zone}
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
                <Select value={currency} aria-label="Home currency" disabled={currencyLocked} onValueChange={setCurrency}>
                  {CURRENCIES.map(option => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            </div>
            <p className={styles.note}>Everything else here can be changed in Settings, including after a year of history. Changing your wake window never rewrites past days.</p>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card padding="lg">
            <p className={styles.lead}>One quest is enough to start. Pick something you could do today even on a bad day — the point is the promise, not the size of it.</p>
            <FormField label="What is the promise?" required helper="Concrete beats ambitious: read ten pages keeps better than read more.">
              <Input value={name} onValueChange={setName} placeholder="Read 10 pages" size="lg" />
            </FormField>
            <div className={styles.examples}>
              {EXAMPLES.map(example => (
                <Button key={example} size="sm" variant="ghost" onClick={() => setName(example)}>
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
          </Card>
        ) : null}

        {step === 2 ? (
          <Card padding="lg">
            <p className={styles.lead}>When should {questName} come round? Most people start with fewer days than they expect to keep.</p>
            <SegmentedControl value={recurrence} onValueChange={value => setRecurrence(value as Recurrence)} fullWidth>
              <SegmentedControl.Item value="daily">Every day</SegmentedControl.Item>
              <SegmentedControl.Item value="chosen">Chosen days</SegmentedControl.Item>
              <SegmentedControl.Item value="count">Times a week</SegmentedControl.Item>
            </SegmentedControl>

            {recurrence === 'chosen' ? (
              <div className={styles.weekdays} role="group" aria-label="Days of the week">
                {WEEKDAYS.map(weekday => (
                  <button key={weekday} type="button" className={styles.weekday} aria-pressed={days.includes(weekday)} onClick={() => toggleDay(weekday)}>
                    {WEEKDAY_LABELS[weekday]}
                  </button>
                ))}
              </div>
            ) : null}

            {recurrence === 'count' ? (
              <FormField label="How many days a week?" helper="Any days you like — the quest just needs this many by Sunday.">
                <Slider value={timesPerWeek} min={1} max={7} step={1} showValue onValueChange={value => setTimesPerWeek(Array.isArray(value) ? (value[0] ?? 1) : value)} />
              </FormField>
            ) : null}

            <div className={styles.preview}>
              <p className={styles.groupLabel}>Your week would look like this</p>
              <div className={styles.previewDays}>
                {WEEKDAYS.map((weekday, index) => (
                  <div key={weekday} className={styles.previewDay}>
                    <div>{WEEKDAY_LABELS[weekday]}</div>
                    <div
                      className={styles.previewMark}
                      data-on={recurrence === 'daily' || (recurrence === 'chosen' && days.includes(weekday)) || (recurrence === 'count' && index < timesPerWeek)}
                    />
                  </div>
                ))}
              </div>
              <p className={styles.note}>
                {dayCount} days a week · about {dayCount * 15} minutes of promises. Light enough to keep on a bad week.
              </p>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card padding="lg">
            <p className={styles.lead}>
              How much should a missed day cost? This is the one setting that changes how the app feels. You can lower it at any time, and raising it takes effect next week.
            </p>
            <p className={styles.note}>Whatever you choose, a miss never removes experience or a level.</p>
            <div className={styles.strictness} role="group" aria-label="Strictness">
              {STRICTNESS_ORDER.map(option => (
                <button key={option} type="button" className={styles.strictRow} aria-pressed={strictness === option} onClick={() => setStrictness(option)}>
                  <span className={styles.strictDot} aria-hidden />
                  <span>
                    <span className={styles.strictHead}>
                      <span className={styles.strictName}>{STRICTNESS_LABELS[option]}</span>
                      <span className={styles.strictCost}>{STRICTNESS_COSTS[option]}</span>
                    </span>
                    <span className={styles.strictDesc}>{STRICTNESS_RULES[option]}</span>
                  </span>
                </button>
              ))}
            </div>
            <Alert intent="info" title="Shields cover the days you could not help">
              You earn one shield for each kept week, up to three. A shield protects a streak on an unavoidable miss, with no explanation required from you.
            </Alert>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card padding="lg">
            <p className={styles.groupLabel}>Your first quest</p>
            <div className={styles.summaryName}>{questName}</div>
            <div className={styles.tags}>
              <Tag>{STAT_LABELS[stat]}</Tag>
              <Badge variant="outline">{STRICTNESS_LABELS[strictness]}</Badge>
              <Badge variant="soft" intent="neutral">
                {dayCount === 7 ? 'Every day' : `${dayCount} days a week`}
              </Badge>
            </div>
            <DescriptionList layout="row" termWidth={150}>
              <DescriptionList.Item term="First occurrence">Today · it is already on your Today screen</DescriptionList.Item>
              <DescriptionList.Item term="Reward">Experience when kept · {STAT_LABELS[stat]} up one</DescriptionList.Item>
              <DescriptionList.Item term="If you miss it">{STRICTNESS_RULES[strictness]}</DescriptionList.Item>
              <DescriptionList.Item term="Home currency">{currency} · fixed from here, so your totals stay comparable</DescriptionList.Item>
            </DescriptionList>
            <p className={styles.note}>
              Next is your Today screen with this quest on it. Nothing else is set up, and nothing else needs to be — expenses, meals, weight and journal all work whenever you
              first reach for them.
            </p>
          </Card>
        ) : null}

        <div className={styles.footer}>
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))}>
            Back
          </Button>
          {step === HEADINGS.length - 1 ? (
            <Button variant="primary" onClick={finish}>
              Create it and start
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(current => Math.min(HEADINGS.length - 1, current + 1))}>
              {step === HEADINGS.length - 2 ? 'Review' : 'Continue'}
            </Button>
          )}
          <span className={styles.footNote}>
            {step === 0 ? 'Nothing is saved until the last step.' : step === HEADINGS.length - 1 ? 'You can change all of this later.' : 'Two minutes, and no tour afterwards.'}
          </span>
        </div>
      </div>
    </section>
  );
}
