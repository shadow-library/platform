import { describe, expect, it } from 'vitest';

import { breakCostNote, breakStreakNote, rescheduleSummary } from '@/features/quests';
import { formatShortDate, type QuestProgress } from '@/lib/data';

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
  it('should never cost HP for a goal quest', () => {
    expect(breakCostNote('goal', 'standard', 10, false)).toBe('No HP is spent.');
  });

  it('should hedge when the intensity is unknown', () => {
    expect(breakCostNote('anchor', undefined, 10, false)).toBe('May spend HP, depending on your intensity.');
  });

  it('should never cost HP at gentle intensity', () => {
    expect(breakCostNote('anchor', 'gentle', 10, false)).toBe('No HP is spent — gentle intensity.');
  });

  it('should cost 1 HP at standard intensity', () => {
    expect(breakCostNote('routine', 'standard', 10, false)).toBe('Spends 1 HP.');
  });

  it('should cost 1 HP at demanding intensity when a shield covers a long streak', () => {
    expect(breakCostNote('anchor', 'demanding', 10, true)).toBe('Spends 1 HP.');
  });

  it('should cost 2 HP at demanding intensity when an unshielded streak of 7+ days ends', () => {
    expect(breakCostNote('anchor', 'demanding', 7, false)).toBe('Spends 2 HP — this ends a streak of 7 days or more.');
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
