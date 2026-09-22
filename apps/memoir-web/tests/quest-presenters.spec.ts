import { describe, expect, it } from 'bun:test';

import { breakCostNote, breakStreakNote, lockBreakNote, questMeta, rescheduleSummary, scheduleSummary } from '@/features/quests';
import { formatShortDate, type Quest, type QuestOccurrence, type QuestProgress, type QuestSummary, type Recurrence } from '@/lib/data';

const TODAY = '2026-08-22';

function progress(rescheduledDates: string[], rescheduleCap = 2): QuestProgress {
  return {
    currentStreakDays: 0,
    longestStreakDays: 0,
    shields: 0,
    adherence30d: null,
    xpEarned: 0,
    reschedulesUsed: rescheduledDates.length,
    rescheduleCap,
    rescheduledDates,
    recentOutcomes: [],
  };
}

describe('rescheduleSummary', () => {
  it('should count a past reschedule below the cap', () => {
    expect(rescheduleSummary(progress(['2026-08-20']), TODAY)).toBe('1 of 2 used in the last 7 days');
  });

  it('should list a future reschedule as booked ahead without counting it as used', () => {
    expect(rescheduleSummary(progress(['2026-08-25']), TODAY)).toBe('0 of 2 used in the last 7 days · 1 more booked ahead');
  });

  it('should report the cap reached from the total counted (past + ahead), like the engine', () => {
    expect(rescheduleSummary(progress(['2026-08-20', '2026-08-25']), TODAY)).toBe(
      `Cap reached — frees up for occurrences from ${formatShortDate('2026-08-27')} · 1 more booked ahead`,
    );
  });

  it('should show the free-up date from the nth-from-cap counted date', () => {
    expect(rescheduleSummary(progress(['2026-08-20', '2026-08-21']), TODAY)).toBe(`Cap reached — frees up for occurrences from ${formatShortDate('2026-08-27')}`);
  });
});

describe('breakCostNote', () => {
  it('should never cost HP for a goal, recovery or optional quest', () => {
    for (const strictness of ['goal', 'recovery', 'optional'] as const) expect(breakCostNote(strictness, 'demanding')).toBe('No HP is spent.');
  });

  it('should hedge when the day’s intensity is unknown', () => {
    expect(breakCostNote('anchor', null)).toBe('May spend HP when the day closes, depending on your intensity.');
  });

  it('should never cost HP at gentle intensity', () => {
    expect(breakCostNote('anchor', 'gentle')).toBe('No HP is spent — gentle intensity.');
  });

  it('should cost 1 HP at the day close under standard and demanding intensity, as rollover charges', () => {
    expect(breakCostNote('routine', 'standard')).toBe('Spends 1 HP when the day closes.');
    expect(breakCostNote('anchor', 'demanding')).toBe('Spends 1 HP when the day closes.');
  });
});

describe('lockBreakNote', () => {
  it('should warn only for a locked occurrence on the open day', () => {
    expect(lockBreakNote({ locked: true, date: TODAY } as QuestOccurrence, TODAY)).toBe('Postponing breaks today’s locked plan, so its lock bonus stops for every quest in it.');
    expect(lockBreakNote({ locked: true, date: '2026-08-23' } as QuestOccurrence, TODAY)).toBeNull();
    expect(lockBreakNote({ locked: false, date: TODAY } as QuestOccurrence, TODAY)).toBeNull();
  });
});

describe('breakStreakNote', () => {
  it('should say a recovery quest keeps no streak', () => {
    expect(breakStreakNote('recovery', 0)).toBe('Doesn’t touch a streak — this quest doesn’t keep one.');
  });

  it('should say an optional quest keeps no streak when it hasn’t opted in', () => {
    expect(breakStreakNote('optional', 0, false)).toBe('Doesn’t touch a streak — this quest doesn’t keep one.');
  });

  it('should treat an optional quest as opted in when the opt-in status is unknown', () => {
    expect(breakStreakNote('optional', 0)).toBe('Breaks the streak.');
  });

  it('should say a held shield bridges the break', () => {
    expect(breakStreakNote('anchor', 1)).toBe('A held shield bridges the break — the streak continues, but the shield is spent.');
  });

  it('should say the streak breaks without a shield', () => {
    expect(breakStreakNote('routine', 0)).toBe('Breaks the streak.');
  });
});

function recurrence(partial: Partial<Recurrence>): Recurrence {
  return { frequency: 'weekly', interval: 1, daysOfWeek: [], dayOfMonth: null, startDate: '2026-01-01', end: { kind: 'never' }, exceptions: [], ...partial };
}

function summary(questPatch: Partial<Quest>, progressPatch: Partial<QuestProgress> = {}): QuestSummary {
  const quest: Quest = {
    id: 'q1',
    name: 'Quest',
    notes: null,
    startTimeMinutes: null,
    durationMinutes: 30,
    statAffinity: 'body',
    strictness: 'routine',
    optionalStreakOptIn: false,
    recurrence: recurrence({ frequency: 'daily', daysOfWeek: [] }),
    consequences: [],
    moduleLink: null,
    notification: { enabled: false, leadMinutes: 10 },
    healthThreshold: null,
    active: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...questPatch,
  };
  return { quest, progress: { ...progress([]), ...progressPatch }, scheduleLocked: false };
}

describe('scheduleSummary', () => {
  it('should name a daily quest without weekdays as every day', () => {
    expect(scheduleSummary({ recurrence: recurrence({ frequency: 'daily' }), startTimeMinutes: null })).toBe('Every day · all day');
  });

  it('should show the interval of an every-N-days quest', () => {
    expect(scheduleSummary({ recurrence: recurrence({ frequency: 'daily', interval: 3 }), startTimeMinutes: 420 })).toBe('Every 3 days · 07:00');
  });

  it('should collapse consecutive weekdays into a range and list the rest', () => {
    expect(scheduleSummary({ recurrence: recurrence({ daysOfWeek: ['fri', 'mon', 'tue', 'wed', 'thu'] }), startTimeMinutes: null })).toBe('Mon–Fri · all day');
    expect(scheduleSummary({ recurrence: recurrence({ daysOfWeek: ['tue', 'thu', 'sat'] }), startTimeMinutes: 1080 })).toBe('Tue, Thu, Sat · 18:00');
    expect(scheduleSummary({ recurrence: recurrence({ daysOfWeek: ['mon', 'tue', 'wed', 'sat', 'sun'] }), startTimeMinutes: null })).toBe('Mon–Wed, Sat, Sun · all day');
  });

  it('should describe a monthly quest by its day of the month', () => {
    expect(scheduleSummary({ recurrence: recurrence({ frequency: 'monthly', dayOfMonth: 15 }), startTimeMinutes: null })).toBe('Monthly on day 15 · all day');
  });

  it('should describe a monthly quest on a weekday of the month', () => {
    const lastFriday = recurrence({ frequency: 'monthly', nthWeekday: { weekday: 'fri', ordinal: 'last' } });
    const secondTuesday = recurrence({ frequency: 'monthly', interval: 2, nthWeekday: { weekday: 'tue', ordinal: 2 } });

    expect(scheduleSummary({ recurrence: lastFriday, startTimeMinutes: null })).toBe('Monthly on the last Friday · all day');
    expect(scheduleSummary({ recurrence: secondTuesday, startTimeMinutes: 1080 })).toBe('Every 2 months on the second Tuesday · 18:00');
  });
});

describe('questMeta', () => {
  it('should start a daily quest with its schedule and pluralise a single shield', () => {
    expect(questMeta(summary({}, { currentStreakDays: 8, shields: 1 }))).toBe('Every day · all day · 8-day streak · 1 shield');
  });

  it('should count the streak of a non-daily quest in occurrences', () => {
    const weekly = summary({ recurrence: recurrence({ daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'] }) }, { currentStreakDays: 4, shields: 2 });
    expect(questMeta(weekly)).toBe('Mon–Fri · all day · 4-occurrence streak · 2 shields');
  });

  it('should fall back to the longest streak and omit it for a fresh quest', () => {
    expect(questMeta(summary({}, { longestStreakDays: 12 }))).toBe('Every day · all day · longest 12-day streak');
    expect(questMeta(summary({}))).toBe('Every day · all day');
  });

  it('should mark an inactive quest as kept as history', () => {
    expect(questMeta(summary({ active: false }))).toBe('Every day · all day · kept as history');
  });
});
