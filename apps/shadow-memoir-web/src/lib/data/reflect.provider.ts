import { type SettledCommandResult } from './command.types';
import { type Persona } from './fixtures';
import { formatDayName, shiftDate } from './labels';
import {
  type AiConsent,
  type AiRequest,
  type AiResult,
  type CoachView,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryGroup,
  type HistoryKind,
  type HistoryView,
  type InsightPeriod,
  type InsightsView,
  type ReflectCommand,
  type ReviewView,
} from './reflect.types';

export interface ReflectProvider {
  getHistory(filter: HistoryFilter, query: string): Promise<HistoryView>;
  getRecord(recordId: string): Promise<HistoryDetail>;
  getInsights(period: InsightPeriod): Promise<InsightsView>;
  getReview(): Promise<ReviewView>;
  getCoach(): Promise<CoachView>;
  dispatchCommand(command: ReflectCommand): Promise<SettledCommandResult>;
}

export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = {
  quest: 'Quest',
  hero: 'Hero',
  expense: 'Expense',
  journal: 'Journal',
  meal: 'Meal',
  weight: 'Weight',
  health: 'Health',
  'side-quest': 'Side quest',
  recovery: 'Recovery',
};

export const HISTORY_KINDS: HistoryFilter[] = ['all', 'quest', 'hero', 'expense', 'journal', 'meal', 'weight', 'health', 'side-quest', 'recovery'];

interface RecordSeed {
  id: string;
  dayOffset: number;
  time: string;
  kind: HistoryKind;
  text: string;
  value: string;
  queued?: boolean;
  title: string;
  section: string;
  to: string;
  fields: [string, string][];
}

const RECORDS: RecordSeed[] = [
  {
    id: 'r-steps',
    dayOffset: 0,
    time: '19:02',
    kind: 'health',
    text: 'Steps 8,310 · threshold reached',
    value: '8,310',
    title: 'Steps 8,310',
    section: 'Body and health',
    to: '/log',
    fields: [
      ['Threshold', '8,000 reached'],
      ['Quest offered', 'Move 8,000 steps'],
      ['Replaced', '6,240 at 14:10'],
      ['Sync', 'Synced 19:03'],
    ],
  },
  {
    id: 'r-groceries',
    dayOffset: 0,
    time: '09:14',
    kind: 'expense',
    text: 'Groceries — Rema 1000 · receipt scanned',
    value: '€18.40',
    queued: true,
    title: 'Groceries — Rema 1000',
    section: 'Money',
    to: '/finance',
    fields: [
      ['Amount', '€18.40 · kr 214.00 NOK'],
      ['Category', 'Food'],
      ['Receipt', 'Scanned · 6 lines'],
      ['Sync', 'Queued'],
    ],
  },
  {
    id: 'r-coffee',
    dayOffset: 0,
    time: '08:04',
    kind: 'expense',
    text: 'Coffee · from quick capture',
    value: '€4.20',
    title: 'Coffee',
    section: 'Money',
    to: '/finance',
    fields: [
      ['Amount', '€4.20'],
      ['Category', 'Food'],
      ['Source', 'Quick capture'],
      ['Sync', 'Synced 08:04'],
    ],
  },
  {
    id: 'r-run',
    dayOffset: 0,
    time: '07:40',
    kind: 'quest',
    text: 'Morning run — 5 km kept',
    value: '+40 XP',
    title: 'Morning run — 5 km kept',
    section: 'Quests',
    to: '/quests',
    fields: [
      ['Outcome', 'Completed'],
      ['Streak', '12 days · longest 41'],
      ['Stat', 'Body +1'],
      ['Sync', 'Synced 07:41'],
    ],
  },
  {
    id: 'r-weight',
    dayOffset: 0,
    time: '07:05',
    kind: 'weight',
    text: 'Weight 78.4 kg · replaced 78.9',
    value: '78.4 kg',
    title: 'Weight 78.4 kg',
    section: 'Body and health',
    to: '/log',
    fields: [
      ['Value', '78.4 kg'],
      ['Replaced', '78.9 kg at 06:58'],
      ['Kept as', 'Corrected entry'],
      ['Sync', 'Synced 07:06'],
    ],
  },
  {
    id: 'r-journal',
    dayOffset: -1,
    time: '22:10',
    kind: 'journal',
    text: 'Skipped the stretch and knew I would…',
    value: '112 words',
    title: 'Journal entry',
    section: 'Quick log',
    to: '/log',
    fields: [
      ['Words', '112'],
      ['Mood', 'flat'],
      ['Linked quest', 'Journal a line'],
      ['Sync', 'Synced 22:11'],
    ],
  },
  {
    id: 'r-stretch',
    dayOffset: -1,
    time: '21:00',
    kind: 'quest',
    text: 'Evening stretch missed · streak closed at 9',
    value: '0',
    title: 'Evening stretch missed',
    section: 'Quests',
    to: '/quests',
    fields: [
      ['Outcome', 'Missed'],
      ['Reason', 'work emergency'],
      ['Streak', 'Closed at 9 days · record kept'],
      ['HP', 'Unchanged — goal strictness costs none'],
    ],
  },
  {
    id: 'r-side',
    dayOffset: -1,
    time: '18:40',
    kind: 'side-quest',
    text: 'Fixed the bike light',
    value: '+15 XP',
    title: 'Side quest — fixed the bike light',
    section: 'Quick log',
    to: '/log',
    fields: [
      ['Reward', '+15 XP'],
      ['Stat', 'Discipline +1'],
      ['Streak', 'Side quests never carry one'],
    ],
  },
  {
    id: 'r-meal',
    dayOffset: -1,
    time: '12:30',
    kind: 'meal',
    text: 'Chicken salad and bread',
    value: '620 kcal',
    title: 'Chicken salad and bread',
    section: 'Body and health',
    to: '/log',
    fields: [
      ['Calories', '620 kcal'],
      ['Source', 'Preset'],
      ['Day total', '1,860 kcal'],
    ],
  },
  {
    id: 'r-level',
    dayOffset: -2,
    time: '20:15',
    kind: 'hero',
    text: 'Level 14 reached · 20 coins granted',
    value: '+20 ◈',
    title: 'Level 14 reached',
    section: 'Hero',
    to: '/hero',
    fields: [
      ['From', '8,000 XP'],
      ['Coins', '+20'],
      ['Experience', 'Never removed — a level once reached is kept'],
    ],
  },
  {
    id: 'r-strength',
    dayOffset: -2,
    time: '18:05',
    kind: 'quest',
    text: 'Strength session kept',
    value: '+60 XP',
    title: 'Strength session kept',
    section: 'Quests',
    to: '/quests',
    fields: [
      ['Outcome', 'Completed'],
      ['Streak', '11 days'],
      ['Stat', 'Body +1'],
    ],
  },
  {
    id: 'r-partial',
    dayOffset: -2,
    time: '07:31',
    kind: 'quest',
    text: 'Morning run — partial · 2.4 km',
    value: '+18 XP',
    title: 'Morning run — partial',
    section: 'Quests',
    to: '/quests',
    fields: [
      ['Outcome', 'Partial · 2.4 of 5 km'],
      ['Reason', 'too tired'],
      ['Streak', 'Held — a partial keeps it'],
    ],
  },
  {
    id: 'r-comeback',
    dayOffset: -3,
    time: '08:20',
    kind: 'recovery',
    text: 'Morning walk kept · comeback day 3',
    value: '+15 XP',
    title: 'Morning walk kept',
    section: 'Hero',
    to: '/hero/recovery',
    fields: [
      ['Outcome', 'Completed'],
      ['Kind', 'Recovery quest'],
      ['Streak', 'New streak at 1 — the closed one stays in History'],
    ],
  },
];

const KPIS_BY_PERIOD: Record<InsightPeriod, InsightsView['kpis']> = {
  '30': [
    { id: 'kept', label: 'Quests kept', value: 0.86, positiveIs: 'up', delta: 0.03, comparison: 'vs the 30 days before', format: { style: 'percent' } },
    { id: 'streak', label: 'Longest streak', value: 41, unit: 'days', positiveIs: 'neither', comparison: 'Read 20 pages · ended 3 July' },
    { id: 'xp', label: 'XP earned', value: 3720, positiveIs: 'up', delta: 0.09, comparison: 'vs the 30 days before' },
    { id: 'spend', label: 'Spent', value: 1284.6, positiveIs: 'down', delta: -0.06, comparison: 'vs the 30 days before', format: { style: 'currency', currency: 'EUR' } },
  ],
  '90': [
    { id: 'kept', label: 'Quests kept', value: 0.84, positiveIs: 'up', delta: 0.06, comparison: 'vs the 90 days before', format: { style: 'percent' } },
    { id: 'streak', label: 'Longest streak', value: 41, unit: 'days', positiveIs: 'neither', comparison: 'Read 20 pages · ended 3 July' },
    { id: 'xp', label: 'XP earned', value: 9840, positiveIs: 'up', delta: 0.14, comparison: 'vs the 90 days before' },
    { id: 'spend', label: 'Spent', value: 3910, positiveIs: 'down', delta: -0.04, comparison: 'vs the 90 days before', format: { style: 'currency', currency: 'EUR' } },
  ],
  '365': [
    { id: 'kept', label: 'Quests kept', value: 0.81, positiveIs: 'neither', comparison: 'your whole history', format: { style: 'percent' } },
    { id: 'streak', label: 'Longest streak', value: 41, unit: 'days', positiveIs: 'neither', comparison: 'Read 20 pages · ended 3 July' },
    { id: 'xp', label: 'XP earned', value: 24180, positiveIs: 'neither', comparison: 'since 21 January' },
    { id: 'spend', label: 'Spent', value: 14620, positiveIs: 'neither', comparison: 'since 21 January', format: { style: 'currency', currency: 'EUR' } },
  ],
};

const PERIOD_NOTES: Record<InsightPeriod, string> = {
  '30': 'The last 30 days, against the 30 before them.',
  '90': 'The last 90 days, against the 90 before them.',
  '365': 'Your whole history, with nothing to compare it against but itself.',
};

const ADHERENCE: InsightsView['adherenceByQuest'] = [
  { id: 'journal', label: 'Journal a line', value: 97, caption: '97%' },
  { id: 'read', label: 'Read 20 pages', value: 94, caption: '94%' },
  { id: 'run', label: 'Morning run', value: 86, caption: '86%' },
  { id: 'steps', label: 'Move 8,000 steps', value: 79, caption: '79%' },
  { id: 'strength', label: 'Strength session', value: 71, caption: '71%' },
  { id: 'takeaway', label: 'No takeaway today', value: 68, caption: '68%' },
];

const WEEKDAYS: InsightsView['adherenceByWeekday'] = [
  { id: 'mon', label: 'Mon', value: 88, caption: '88%' },
  { id: 'tue', label: 'Tue', value: 84, caption: '84%' },
  { id: 'wed', label: 'Wed', value: 90, caption: '90%' },
  { id: 'thu', label: 'Thu', value: 62, caption: '62%' },
  { id: 'fri', label: 'Fri', value: 79, caption: '79%' },
  { id: 'sat', label: 'Sat', value: 86, caption: '86%' },
  { id: 'sun', label: 'Sun', value: 92, caption: '92%' },
];

const XP_BY_MONTH: InsightsView['xpByMonth'] = [
  { id: 'dec', label: 'Dec', value: 0, caption: 'no entries' },
  { id: 'jan', label: 'Jan', value: 1240, caption: '1,240 XP' },
  { id: 'feb', label: 'Feb', value: 2180, caption: '2,180 XP' },
  { id: 'mar', label: 'Mar', value: 3020, caption: '3,020 XP' },
  { id: 'apr', label: 'Apr', value: 2740, caption: '2,740 XP' },
  { id: 'may', label: 'May', value: 3480, caption: '3,480 XP' },
  { id: 'jun', label: 'Jun', value: 1620, caption: '1,620 XP' },
  { id: 'jul', label: 'Jul', value: 4180, caption: '4,180 XP' },
  { id: 'aug', label: 'Aug', value: 3720, caption: '3,720 XP' },
];

const REASONS: InsightsView['reasons'] = [
  { id: 'work_emergency', label: 'work emergency', value: 14, caption: '14' },
  { id: 'too_tired', label: 'too tired', value: 6, caption: '6' },
  { id: 'travel', label: 'travel', value: 5, caption: '5' },
  { id: 'health', label: 'health', value: 3, caption: '3' },
  { id: 'forgot', label: 'forgot', value: 2, caption: '2' },
];

const SPEND: InsightsView['spend'] = [
  { id: 'home', label: 'Home', value: 2340, caption: '€2,340' },
  { id: 'food', label: 'Food', value: 1208, caption: '€1,208' },
  { id: 'transport', label: 'Transport', value: 484, caption: '€484' },
  { id: 'health', label: 'Health', value: 386, caption: '€386' },
  { id: 'subscriptions', label: 'Subscriptions', value: 253, caption: '€253' },
];

function wave(count: number, seed: number, base: number, spread: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.round(base + Math.abs(Math.sin((index + seed) * 1.6)) * spread));
}

const TRENDS: InsightsView['trends'] = [
  { id: 'weight', name: 'Weight', value: '78.4 kg · down 2.1', points: wave(20, 2, 30, 60) },
  { id: 'sleep', name: 'Sleep', value: '7h 10m average', points: wave(20, 5, 40, 55) },
  { id: 'steps', name: 'Steps', value: '7,240 average', points: wave(20, 8, 25, 70) },
  { id: 'water', name: 'Water', value: '1.9 l average', points: wave(20, 3, 30, 60) },
];

const REVIEW_QUESTS: ReviewView['quests'] = [
  { id: 'run', title: 'Morning run', result: '6 of 6', days: ['kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'none'] },
  { id: 'read', title: 'Read 20 pages', result: '6 of 7', days: ['kept', 'partial', 'kept', 'kept', 'kept', 'kept', 'kept'] },
  { id: 'steps', title: 'Move 8,000 steps', result: '5 of 7', days: ['kept', 'kept', 'missed', 'kept', 'missed', 'kept', 'kept'] },
  { id: 'strength', title: 'Strength session', result: '2 of 3', days: ['none', 'kept', 'none', 'missed', 'none', 'kept', 'none'] },
  { id: 'takeaway', title: 'No takeaway today', result: '5 of 7', days: ['kept', 'missed', 'kept', 'kept', 'kept', 'missed', 'kept'] },
  { id: 'journal', title: 'Journal a line', result: '7 of 7', days: ['kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'kept'] },
];

const RESULT: AiResult = {
  id: 'result-nightly',
  title: 'Last night’s result',
  meta: 'Nightly summary · ready 06:02 · read quests, planning and money',
  findings: [
    {
      heading: 'Thursdays are structurally overloaded',
      body: 'Five occurrences and about 2h 20m, against a fourteen-day median of 1h 40m. Four of your six misses this fortnight were Thursday evenings, and all four carry the reason work emergency.',
    },
    {
      heading: 'Mornings are load-bearing',
      body: 'The morning run sits at 86% and has never been missed on a day the plan was locked the night before. Locking the plan is doing more work than the schedule itself.',
    },
    {
      heading: 'Food spend tracks one quest',
      body: 'Every euro of the €62 over your food average lands on a day No takeaway today was skipped. Nothing to change in the budget; one quest explains it.',
    },
  ],
  suggestions: [
    { id: 'result-nightly:0', index: 0, label: 'Move the strength session off Thursday', to: '/quests' },
    { id: 'result-nightly:1', index: 1, label: 'Drop the evening stretch to five days a week', to: '/quests' },
  ],
  limitationNote: null,
};

const REQUEST_COPY: Record<AiRequest['state'], { when: string; body: string }> = {
  queued: {
    when: 'submitted a moment ago · position 2',
    body: 'Nothing is running yet. Cancelling while it is queued returns the request to your quota.',
  },
  processing: {
    when: 'started a few minutes ago · usually under an hour',
    body: 'Reading the window you chose. You can close the app — the result will be waiting here, and a notification arrives only if you asked for one.',
  },
  ready: { when: 'ready', body: 'The answer is below.' },
  held: { when: 'waiting on a plan change', body: 'The request is held until the plan question is settled. Nothing has been charged.' },
  failed: {
    when: 'failed · no request used',
    body: 'The run could not finish. Nothing was charged against your quota and none of your data was left half-read. Retrying is safe.',
  },
  cancelled: { when: 'cancelled while queued · no request used', body: 'The request was returned to your quota.' },
};

const HISTORY_ENTRIES: CoachView['history'] = [
  { id: 'h1', state: 'ready', title: 'Nightly summary · quests, planning, money', when: 'Today 06:02' },
  { id: 'h2', state: 'ready', title: 'What is my Thursday problem?', when: '19 Aug' },
  { id: 'h3', state: 'failed', title: 'Weekly deep read · week 33', when: '18 Aug · no request used' },
  { id: 'h4', state: 'cancelled', title: 'Is my food spend unusual?', when: '15 Aug · cancelled while queued' },
  { id: 'h5', state: 'ready', title: 'Weekly deep read · week 32', when: '11 Aug' },
];

interface ReflectFixtureState {
  persona: Persona;
  today: string;
  consent: AiConsent;
  quotaUsed: number;
  active: AiRequest | null;
  answers: Record<string, string>;
  reviewComplete: boolean;
}

export interface ReflectFixtureOptions {
  today: string;
  persona?: Persona;
}

/** Free carries two requests a month; the third must meet the paywall before a task is ever written (PRD §6.8). */
const FREE_MONTHLY_REQUESTS = 2;

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function historyGroups(state: ReflectFixtureState, filter: HistoryFilter, query: string): HistoryGroup[] {
  const needle = query.trim().toLowerCase();
  const offsets = [...new Set(RECORDS.map(record => record.dayOffset))].sort((left, right) => right - left);
  return offsets
    .map(offset => {
      const date = shiftDate(state.today, offset);
      const rows = RECORDS.filter(record => record.dayOffset === offset)
        .filter(record => filter === 'all' || record.kind === filter)
        .filter(record => needle.length === 0 || record.text.toLowerCase().includes(needle) || HISTORY_KIND_LABELS[record.kind].toLowerCase().includes(needle))
        .map(record => ({ id: record.id, time: record.time, kind: record.kind, text: record.text, value: record.value, queued: record.queued === true }));
      return { date, label: offset === 0 ? `Today · ${formatDayName(date)}` : formatDayName(date), rows };
    })
    .filter(group => group.rows.length > 0);
}

/** The fixture reflection seam, kept for stories and component tests. */
export function createReflectProvider({ today, persona = 'active' }: ReflectFixtureOptions): ReflectProvider {
  const state: ReflectFixtureState = {
    persona,
    today,
    consent: { journal: false, health: false, decided: false },
    quotaUsed: persona === 'new' ? 0 : 1,
    active: null,
    answers: {},
    reviewComplete: false,
  };

  const coach = (): CoachView => ({
    consent: { ...state.consent },
    quota: {
      used: state.quotaUsed,
      limit: FREE_MONTHLY_REQUESTS,
      planName: 'Free',
      resetsOn: '1 September',
      note: `Free includes ${FREE_MONTHLY_REQUESTS} requests a month. Coach adds sixty a month, the nightly summary and a weekly deep read — and nothing else.`,
    },
    active: state.active,
    latest: state.consent.decided && state.persona !== 'new' ? RESULT : null,
    history: state.persona === 'new' ? [] : HISTORY_ENTRIES,
  });

  const review = (): ReviewView => ({
    weekLabel: 'Week 34 · 11 – 17 August',
    keptHeadline: '28 of 34 occurrences. Two partials, three skips with reasons, one shielded travel day.',
    quests: REVIEW_QUESTS,
    keptPattern: 'The pattern worth naming: every skip was an evening quest after a day with more than four occurrences. Mornings held all week.',
    moneyHeadline: '€312.40 across 23 expenses, €41 below your weekly average.',
    moneyFacts: [
      { label: 'Spent', value: 312.4, comparison: 'vs weekly average', format: { style: 'currency', currency: 'EUR' } },
      { label: 'No-spend days', value: 2, comparison: 'Tuesday and Sunday' },
      { label: 'Biggest category', value: 96.2, comparison: 'Food · 11 expenses', format: { style: 'currency', currency: 'EUR' } },
    ],
    moneyNote: 'One subscription renewed and one was cancelled. The cancellation is worth logging as a side quest if you have not already.',
    bodyHeadline: 'Weight, sleep and steps had enough entries to be worth reading. Water did not.',
    bodyFacts: [
      { label: 'Weight', value: 78.7, unit: 'kg', comparison: 'down 0.4 over the week' },
      { label: 'Average sleep', value: 7.1, unit: 'h', comparison: '6 nights logged' },
      { label: 'Average steps', value: 7420, comparison: '7 days logged' },
    ],
    bodyGap: {
      title: 'Not enough water entries to say anything',
      body: 'Two days of seven have entries. Rather than guess a weekly average from two numbers, this section stays empty — it will fill in on its own.',
    },
    prompts: [
      { id: 'better', question: 'What went better than you expected?', placeholder: 'One sentence is enough', answer: state.answers.better ?? '' },
      { id: 'change', question: 'What will you change about next week?', placeholder: 'One sentence is enough', answer: state.answers.change ?? '' },
      { id: 'carry', question: 'Anything you want to stop carrying?', placeholder: 'Optional', answer: state.answers.carry ?? '' },
    ],
    completion: state.reviewComplete
      ? {
          title: 'Week 34 closed',
          body: 'Saved as a journal entry and to History. One shield earned for a week above eighty percent.',
          lines: [
            '28 of 34 kept · 82% · your steadiest week since 21 July',
            '€312.40 spent · €41 under average · 2 no-spend days',
            'Weight down 0.4 kg · sleep 7h 06m average',
            'Most common reason for a miss: work emergency (3)',
            'Level 13 to 14 · 1,140 XP earned',
          ],
        }
      : null,
    glance: ['34 occurrences · 28 kept · 82%', 'Level 13 to 14 · 1,140 XP', 'HP unchanged at 4 · 1 shield spent', '6 journal entries · 4 meals logged'],
    carried:
      'Two suggestions will appear on the Planning Board: move the strength session off Thursday, and drop the evening stretch to five days a week. Both are suggestions — the board never rewrites itself.',
  });

  return {
    getHistory: (filter, query) => {
      const groups = historyGroups(state, filter, query);
      const rowCount = groups.reduce((total, group) => total + group.rows.length, 0);
      return Promise.resolve({
        countLabel: filter === 'all' && query.trim().length === 0 ? `${rowCount} of 1,284 records` : `${rowCount} matching records`,
        groups,
        totals: ['142 quest outcomes · 118 kept', '96 expenses · €1,284.60', '26 journal entries · 4,120 words', '68 metric entries · 19 meals · 21 weights'],
        pageCount: filter === 'all' ? 42 : 1,
      });
    },
    getRecord: recordId => {
      const record = RECORDS.find(item => item.id === recordId) ?? (RECORDS[0] as RecordSeed);
      return Promise.resolve({
        id: record.id,
        kind: record.kind,
        title: record.title,
        when: record.dayOffset === 0 ? `Today ${record.time}` : `${formatDayName(shiftDate(state.today, record.dayOffset))} ${record.time}`,
        section: record.section,
        to: record.to,
        fields: record.fields.map(([label, value]) => ({ label, value })),
      });
    },
    getInsights: period =>
      Promise.resolve({
        periodNote: PERIOD_NOTES[period],
        kpis: KPIS_BY_PERIOD[period],
        adherenceByQuest: ADHERENCE,
        adherenceByWeekday: WEEKDAYS,
        weekdayNote: 'Thursday is your weakest weekday, and it is also your heaviest planned one.',
        xpByMonth: XP_BY_MONTH,
        xpNote: 'Experience has never decreased. The flat months are pauses, not losses.',
        reasons: REASONS,
        reasonsNote: 'Work emergency accounts for nearly half of your misses, and almost all of them are evening quests.',
        spend: SPEND,
        spendNote: 'Food is €62 above your ninety-day average, and every one of those euros lands on a day No takeaway today was skipped.',
        trends: TRENDS,
      }),
    getReview: () => Promise.resolve(review()),
    getCoach: () => Promise.resolve(coach()),
    dispatchCommand: command => {
      if (command.type === 'ai.setConsent') {
        state.consent = { ...command.consent, decided: true };
        return Promise.resolve(applied('Saved. You can withdraw either consent at any time.'));
      }

      if (command.type === 'ai.submit') {
        if (command.question.trim().length === 0) return Promise.resolve({ status: 'rejected', message: 'A question is needed before anything is queued.' });
        if (state.quotaUsed >= FREE_MONTHLY_REQUESTS)
          return Promise.resolve({
            status: 'rejected',
            message: `Free covers ${FREE_MONTHLY_REQUESTS} requests a month and both are used. The count resets on 1 September, and Coach raises it.`,
          });
        state.quotaUsed += 1;
        state.active = { id: `req-${state.quotaUsed}`, question: command.question.trim(), state: 'queued', ...REQUEST_COPY.queued };
        return Promise.resolve(applied('Queued. The answer will be here within a few hours.'));
      }

      if (command.type === 'ai.cancel') {
        state.quotaUsed = Math.max(0, state.quotaUsed - 1);
        state.active = state.active ? { ...state.active, state: 'cancelled', ...REQUEST_COPY.cancelled } : null;
        return Promise.resolve(applied('Cancelled, and the request went back to your quota.'));
      }

      if (command.type === 'ai.retry') {
        state.active = state.active ? { ...state.active, state: 'processing', ...REQUEST_COPY.processing } : null;
        return Promise.resolve(applied('Running again. Nothing extra is charged for a retry.'));
      }

      if (command.type === 'ai.applySuggestion') {
        const suggestion = RESULT.suggestions[command.suggestionIndex];
        return Promise.resolve(applied(suggestion ? 'Recorded. Opening the quest so you can make the change yourself.' : 'Nothing to apply.'));
      }

      if (command.type === 'review.answer') {
        state.answers[command.promptId] = command.answer;
        return Promise.resolve(applied('Saved with the review.'));
      }

      state.reviewComplete = true;
      return Promise.resolve(applied('Week closed and saved as a journal entry.'));
    },
  };
}
