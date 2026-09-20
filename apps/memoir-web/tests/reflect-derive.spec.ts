import { describe, expect, it } from 'vitest';

import {
  adherenceOf,
  deriveHistory,
  deriveInsights,
  deriveRecord,
  deriveReview,
  emptyReflectSource,
  type ExpenseDetail,
  formatRange,
  type HealthMetricEntry,
  holdsOccurrence,
  isoWeekOf,
  type JournalEntry,
  type QuestLogState,
  type ReasonTag,
  type ReflectQuestLog,
  type ReflectSource,
  type WeightEntry,
} from '@/lib/data';

const TODAY = '2026-08-22';
const LAST_MONDAY = '2026-08-10';

function log(partial: Partial<ReflectQuestLog> & { date: string; state: QuestLogState }): ReflectQuestLog {
  return {
    id: `${partial.questId ?? 'run'}:${partial.date}`,
    questId: 'run',
    questName: 'Morning run',
    xpAwarded: 0,
    coinsAwarded: 0,
    reasonTag: null,
    statAffinity: 'body',
    performedAt: `${partial.date}T07:30:00.000Z`,
    ...partial,
  };
}

function expense(date: string, amountMinor: number, categoryId: ExpenseDetail['categoryId'] = 'food'): ExpenseDetail {
  return {
    id: `e-${date}-${amountMinor}`,
    amountMinor,
    amountText: (amountMinor / 100).toFixed(2),
    currency: 'EUR',
    fxRate: null,
    homeAmountMinor: amountMinor,
    categoryId,
    merchant: 'Bagerhuset',
    occurredOnDate: date,
    loggedAt: `${date}T09:00:00.000Z`,
    source: 'manual',
    syncState: 'synced',
    audit: [],
  };
}

function weight(date: string, kg: number): WeightEntry {
  return { id: date, date, kg, loggedAt: `${date}T07:00:00.000Z`, rewarded: true };
}

function metric(date: string, value: number): HealthMetricEntry {
  return { key: 'steps', date, value, loggedAt: `${date}T19:00:00.000Z`, replacedValue: null, source: 'manual' };
}

function journalEntry(date: string, text: string): JournalEntry {
  return { id: `j-${date}`, date, title: text.slice(0, 20), text, mood: 3, tags: [], wordCount: text.split(' ').length, loggedAt: `${date}T22:00:00.000Z`, rewarded: true };
}

function source(overrides: Partial<ReflectSource> = {}): ReflectSource {
  return { ...emptyReflectSource(TODAY), ...overrides };
}

describe('adherenceOf', () => {
  it('should count a completed, a late and a recovery occurrence as whole holds', () => {
    const result = adherenceOf([log({ date: '2026-08-20', state: 'completed' }), log({ date: '2026-08-19', state: 'late' }), log({ date: '2026-08-18', state: 'recovery' })]);
    expect(result).toEqual({ held: 3, occurrences: 3, ratio: 1 });
  });

  it('should count a partial as half an occurrence and still a hold', () => {
    const result = adherenceOf([log({ date: '2026-08-20', state: 'completed' }), log({ date: '2026-08-19', state: 'partial' })]);
    expect(result.held).toBe(1.5);
    expect(result.ratio).toBe(0.75);
    expect(holdsOccurrence('partial')).toBe(true);
  });

  it('should not count a moved occurrence on the day it was planned', () => {
    const result = adherenceOf([
      log({ date: '2026-08-20', state: 'completed' }),
      log({ date: '2026-08-19', state: 'postponed' }),
      log({ date: '2026-08-18', state: 'rescheduled' }),
    ]);
    expect(result).toEqual({ held: 1, occurrences: 1, ratio: 1 });
  });

  it('should return a null ratio rather than a zero when nothing was logged', () => {
    expect(adherenceOf([]).ratio).toBeNull();
  });
});

describe('deriveInsights', () => {
  it('should bucket adherence by weekday', () => {
    const insights = deriveInsights(
      source({
        logs: [
          log({ date: '2026-08-17', state: 'completed' }),
          log({ date: '2026-08-18', state: 'missed' }),
          log({ date: '2026-08-19', state: 'completed' }),
          log({ date: '2026-08-20', state: 'partial' }),
        ],
      }),
      '30',
    );

    const byId = new Map(insights.adherenceByWeekday.map(bar => [bar.id, bar]));
    expect(byId.get('mon')?.caption).toBe('100%');
    expect(byId.get('tue')?.caption).toBe('0%');
    expect(byId.get('wed')?.caption).toBe('100%');
    expect(byId.get('thu')?.caption).toBe('50%');
    expect(byId.get('sun')?.caption).toBe('no entries');
  });

  it('should rank reason tags by how often they were given', () => {
    const reasons: ReasonTag[] = ['work_emergency', 'work_emergency', 'too_tired', 'work_emergency', 'travel'];
    const insights = deriveInsights(source({ logs: reasons.map((reasonTag, index) => log({ date: `2026-08-${String(10 + index)}`, state: 'missed', reasonTag })) }), '30');

    expect(insights.reasons.map(bar => [bar.id, bar.value])).toEqual([
      ['work_emergency', 3],
      ['too_tired', 1],
      ['travel', 1],
    ]);
    expect(insights.reasonsNote).toContain('work emergency');
  });

  it('should sum spend from minor units and rank the categories', () => {
    const insights = deriveInsights(source({ expenses: [expense('2026-08-20', 1840, 'groceries'), expense('2026-08-19', 420), expense('2026-08-18', 1200)] }), '30');

    expect(insights.spend.map(bar => bar.caption)).toEqual(['€18.40', '€16.20']);
    expect(insights.kpis.find(kpi => kpi.id === 'spend')?.value).toBe(34.6);
  });

  it('should leave an expense outside the window out of the period totals', () => {
    const insights = deriveInsights(source({ expenses: [expense('2026-08-20', 1000), expense('2026-06-01', 9900)] }), '30');
    expect(insights.kpis.find(kpi => kpi.id === 'spend')?.value).toBe(10);
  });

  it('should read a falling weight as a downward trend', () => {
    const insights = deriveInsights(source({ weights: [weight('2026-08-01', 80.5), weight('2026-08-10', 79.4), weight('2026-08-20', 78.4)] }), '30');
    expect(insights.trends.find(trend => trend.id === 'weight')?.value).toBe('78.4 kg · down 2.1');
  });

  it('should read a rising weight as an upward trend', () => {
    const insights = deriveInsights(source({ weights: [weight('2026-08-01', 78.4), weight('2026-08-20', 79.0)] }), '30');
    expect(insights.trends.find(trend => trend.id === 'weight')?.value).toBe('79 kg · up 0.6');
  });

  it('should leave a metric with a single entry out of the trends entirely', () => {
    const insights = deriveInsights(source({ weights: [weight('2026-08-20', 78.4)], metricEntries: [metric('2026-08-20', 8000)] }), '30');
    expect(insights.trends).toEqual([]);
  });

  it('should stay honest about an empty store rather than showing zeroes as facts', () => {
    const insights = deriveInsights(source(), '90');

    expect(insights.adherenceByQuest).toEqual([]);
    expect(insights.reasons).toEqual([]);
    expect(insights.spend).toEqual([]);
    expect(insights.trends).toEqual([]);
    const kept = insights.kpis.find(kpi => kpi.id === 'kept');
    expect(kept?.value).toBeNull();
    expect(kept?.caption).toBe('No occurrences logged yet.');
    expect(insights.weekdayNote).toContain('Not enough occurrences');
  });

  it('should label each month once in the year view', () => {
    const insights = deriveInsights(source({ logs: [log({ date: '2026-08-20', state: 'completed', xpAwarded: 40 })] }), '365');

    const labels = insights.xpByMonth.map(bar => bar.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toBe('Aug 25');
    expect(labels.find(label => label === 'Jan 26')).toBe('Jan 26');
  });

  it('should give every bar an unambiguous aria label', () => {
    const insights = deriveInsights(source({ logs: [log({ date: '2026-08-20', state: 'completed', xpAwarded: 40 })] }), '30');

    expect(insights.adherenceByWeekday.find(bar => bar.id === 'mon')?.ariaLabel).toBe('Monday: no entries');
    const month = insights.xpByMonth.find(bar => bar.value > 0);
    expect(month?.ariaLabel).toMatch(/^August 2026: [\d.]+K? XP$/);
  });

  it("should say there's nothing earlier when a KPI has no baseline period", () => {
    const insights = deriveInsights(source(), '30');

    expect(insights.kpis.find(kpi => kpi.id === 'xp')?.caption).toBe('Nothing earlier to compare with yet.');
    expect(insights.kpis.find(kpi => kpi.id === 'xp')?.delta).toBeUndefined();
  });

  it('should name the point difference for quests kept instead of a relative percent', () => {
    const insights = deriveInsights(source({ logs: [log({ date: '2026-08-20', state: 'completed' }), log({ questId: 'other', date: '2026-07-01', state: 'missed' })] }), '30');

    const kept = insights.kpis.find(kpi => kpi.id === 'kept');
    expect(kept?.caption).toBe('100 points higher than the 30 days before.');
    expect(kept?.delta).toBeUndefined();
  });

  it('should show a period caption in the year view instead of hiding it behind a delta', () => {
    const insights = deriveInsights(source({ logs: [log({ date: '2026-08-20', state: 'completed' })] }), '365');
    expect(insights.kpis.find(kpi => kpi.id === 'xp')?.caption).toBe('Over the last year.');
  });

  it('should attribute the longest streak caption to its quest', () => {
    const insights = deriveInsights(source({ streaks: [{ questId: 'run', questName: 'Morning run', currentRunDays: 3, bestRunDays: 12 }] }), '90');
    expect(insights.kpis.find(kpi => kpi.id === 'streak')?.caption).toBe('Held by Morning run.');
  });
});

describe('deriveHistory', () => {
  const feed = source({
    logs: [log({ date: '2026-08-21', state: 'missed', reasonTag: 'work_emergency' }), log({ date: '2026-08-22', state: 'completed', xpAwarded: 40 })],
    expenses: [expense('2026-08-22', 1840, 'groceries')],
    journal: [journalEntry('2026-08-22', 'A private line about a difficult afternoon')],
  });

  it('should group the feed by day, newest first, and mark today', () => {
    const history = deriveHistory(feed, 'all', '');

    expect(history.groups.map(group => group.date)).toEqual(['2026-08-22', '2026-08-21']);
    expect(history.groups[0]?.label).toMatch(/^Today · /);
    expect(history.countLabel).toBe('4 records');
  });

  it('should filter the feed to one record kind', () => {
    const history = deriveHistory(feed, 'expense', '');

    expect(history.groups.flatMap(group => group.rows).map(row => row.kind)).toEqual(['expense']);
    expect(history.countLabel).toBe('1 matching record');
  });

  it('should match a search against a quest name and its reason tag', () => {
    expect(deriveHistory(feed, 'all', 'morning run').groups.flatMap(group => group.rows)).toHaveLength(2);
    expect(deriveHistory(feed, 'all', 'work emergency').groups.flatMap(group => group.rows)).toHaveLength(1);
  });

  it('should never match a search against journal text', () => {
    expect(deriveHistory(feed, 'all', 'difficult afternoon').groups).toEqual([]);
    expect(deriveHistory(feed, 'all', 'journal').groups.flatMap(group => group.rows)).toHaveLength(1);
  });

  it('should page a long feed in stable order without repeating a row', () => {
    const long = source({
      logs: Array.from({ length: 45 }, (_, index) => log({ date: `2026-0${index < 30 ? 7 : 8}-${String((index % 28) + 1).padStart(2, '0')}`, state: 'completed' })),
    });

    const first = deriveHistory(long, 'all', '', 1).groups.flatMap(group => group.rows);
    const second = deriveHistory(long, 'all', '', 2).groups.flatMap(group => group.rows);

    expect(deriveHistory(long, 'all', '', 1).pageCount).toBe(3);
    expect(first).toHaveLength(20);
    expect(second).toHaveLength(20);
    expect(first.some(row => second.some(other => other.id === row.id))).toBe(false);
  });

  it('should open the newest record of the day when no record was chosen', () => {
    expect(deriveRecord(feed, '').title).toBe('Journal entry');
  });

  it('should say nothing is recorded rather than inventing a detail', () => {
    expect(deriveRecord(source(), 'log:missing').title).toBe('Nothing recorded yet');
    expect(deriveHistory(source(), 'all', '').groups).toEqual([]);
    expect(deriveHistory(source(), 'all', '').countLabel).toBe('0 records');
  });

  it('should format a large record count with digit grouping', () => {
    const large = source({ expenses: Array.from({ length: 2912 }, (_, index) => expense('2026-08-22', 100 + index)) });

    expect(deriveHistory(large, 'all', '').countLabel).toBe('2,912 records');
    expect(deriveHistory(large, 'expense', '').countLabel).toBe('2,912 matching records');
  });
});

describe('metricRecord', () => {
  it('should render metric records with the metric’s display unit', () => {
    const water: HealthMetricEntry = { key: 'water', date: '2026-08-22', value: 1400, loggedAt: '2026-08-22T17:30:00.000Z', replacedValue: null, source: 'manual' };
    const record = deriveRecord(source({ metricEntries: [water] }), `metric:water:2026-08-22`);

    expect(record.title).toBe('Water 1.4 l');
    expect(record.fields).toContainEqual({ label: 'Value', value: '1.4 l' });
    expect(record.fields).toContainEqual({ label: 'Threshold', value: '2.0 l' });
  });
});

describe('formatRange', () => {
  it('should name the month and year once for a range inside one month', () => {
    expect(formatRange('2026-09-07', '2026-09-13')).toBe('7–13 September 2026');
  });

  it('should name both months for a range across two months', () => {
    expect(formatRange('2026-08-31', '2026-09-06')).toBe('31 August\u00a0– 6 September 2026');
  });

  it('should name both years for a range across two years', () => {
    expect(formatRange('2026-12-28', '2027-01-03')).toBe('28 December 2026\u00a0– 3 January 2027');
  });

  it('should name a single day once', () => {
    expect(formatRange('2026-09-13', '2026-09-13')).toBe('13 September 2026');
  });
});

describe('isoWeekOf', () => {
  it.each([
    ['2026-09-07', { year: 2026, week: 37 }],
    ['2026-09-13', { year: 2026, week: 37 }],
    ['2026-01-01', { year: 2026, week: 1 }],
    ['2025-12-29', { year: 2026, week: 1 }],
    ['2021-01-03', { year: 2020, week: 53 }],
    ['2020-12-31', { year: 2020, week: 53 }],
    ['2021-01-04', { year: 2021, week: 1 }],
  ])('should number %s as ISO 8601 does', (date, expected) => {
    expect(isoWeekOf(date)).toEqual(expected);
  });
});

describe('deriveReview', () => {
  const week = Array.from({ length: 7 }, (_, index) => `2026-08-${String(10 + index).padStart(2, '0')}`);

  const lastWeek = source({
    logs: [
      ...week.map(date => log({ date, state: 'completed', xpAwarded: 40 })),
      ...week.slice(0, 3).map(date => log({ questId: 'read', questName: 'Read 20 pages', date, state: 'missed', reasonTag: 'work_emergency' })),
      log({ questId: 'read', questName: 'Read 20 pages', date: week[3] as string, state: 'partial', xpAwarded: 12, reasonTag: 'too_tired' }),
    ],
    expenses: [expense(week[0] as string, 1840, 'groceries'), expense(week[2] as string, 420)],
    weights: [weight(week[0] as string, 79.1), weight(week[6] as string, 78.7)],
  });

  it('should read the week that closed rather than the week in progress', () => {
    expect(deriveReview(lastWeek, { answers: {}, complete: false }).weekLabel).toMatch(/^Week 33 · /);
    expect(deriveReview(lastWeek, { answers: {}, complete: false }).quests.map(quest => quest.id)).toEqual(['run', 'read']);
  });

  it('should name the month and year once in the week label', () => {
    expect(deriveReview(lastWeek, { answers: {}, complete: false }).weekLabel).toBe('Week 33 · 10–16 August 2026');
  });

  it('should lay the week out as seven day cells with partials distinguished from misses', () => {
    const read = deriveReview(lastWeek, { answers: {}, complete: false }).quests.find(quest => quest.id === 'read');

    expect(read?.days).toEqual(['missed', 'missed', 'missed', 'partial', 'none', 'none', 'none']);
    expect(read?.result).toBe('1 of 4');
  });

  it('should name the most common reason behind the misses', () => {
    const review = deriveReview(lastWeek, { answers: {}, complete: false });

    expect(review.keptPattern).toContain('work emergency');
    expect(review.keptHeadline).toBe('8 of 11 occurrences. 1 partial, 3 misses with a reason.');
  });

  it('should total the week from minor units and count the no-spend days', () => {
    const review = deriveReview(lastWeek, { answers: {}, complete: false });

    expect(review.moneyFacts.find(fact => fact.label === 'Spent')?.value).toBe(22.6);
    expect(review.moneyFacts.find(fact => fact.label === 'No-spend days')?.value).toBe(5);
    expect(review.moneyFacts.find(fact => fact.label === 'Biggest category')?.comparison).toBe('Groceries · 1 expense');
  });

  it('should read the body trend and keep a thin metric out of the facts', () => {
    const review = deriveReview(lastWeek, { answers: {}, complete: false });

    expect(review.bodyFacts).toEqual([{ label: 'Weight', value: 78.7, unit: 'kg', comparison: 'down 0.4 over the week' }]);
    expect(review.bodyGap?.title).toBe('Not enough steps entries to say anything');
  });

  it('should carry the answers it was given and close only when asked', () => {
    expect(deriveReview(lastWeek, { answers: {}, complete: false }).completion).toBeNull();

    const answered = deriveReview(lastWeek, { answers: { better: 'The mornings held.' }, complete: true });
    expect(answered.prompts.find(prompt => prompt.id === 'better')?.answer).toBe('The mornings held.');
    expect(answered.completion?.lines[0]).toBe('8 of 11 kept · 73%');
  });

  it('should stay empty rather than guess when the week has nothing in it', () => {
    const review = deriveReview(source(), { answers: {}, complete: false });

    expect(review.quests).toEqual([]);
    expect(review.keptHeadline).toContain('Nothing was logged last week');
    expect(review.moneyHeadline).toBe('Nothing was logged as spent this week.');
    expect(review.bodyFacts).toEqual([]);
    expect(review.glance[0]).toBe('No occurrences logged');
  });

  it('should place a week starting on Monday and ending on Sunday', () => {
    expect(deriveReview(lastWeek, { answers: {}, complete: false }).quests[0]?.days).toHaveLength(7);
    expect(week[0]).toBe(LAST_MONDAY);
  });
});
