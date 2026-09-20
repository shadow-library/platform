import { describe, expect, it } from 'bun:test';

import {
  addDays,
  expandRecurrence,
  type ExpansionWindow,
  formatLocalDate,
  type LocalDate,
  type MonthlyPattern,
  nextOccurrenceOnOrAfter,
  type OccurrenceCursor,
  occursOn,
  parseLocalDate,
  type RecurrenceEnd,
  type RecurrenceRule,
  type Weekday,
} from '@modules/rules';

const date = (iso: string): LocalDate => {
  const parsed = parseLocalDate(iso);
  if (!parsed) throw new TypeError(`fixture is not an ISO date: ${iso}`);
  return parsed;
};

const window = (from: string, to: string): ExpansionWindow => ({ from: date(from), to: date(to) });

const NEVER: RecurrenceEnd = { kind: 'never' };

const daily = (startDate: string, interval = 1, end: RecurrenceEnd = NEVER, exceptions?: readonly string[]): RecurrenceRule => ({
  frequency: 'daily',
  interval,
  startDate: date(startDate),
  end,
  exceptions: exceptions?.map(date),
});

const weekly = (startDate: string, daysOfWeek: readonly [Weekday, ...Weekday[]], interval = 1, end: RecurrenceEnd = NEVER): RecurrenceRule => ({
  frequency: 'weekly',
  interval,
  startDate: date(startDate),
  end,
  daysOfWeek,
});

const monthly = (startDate: string, pattern: MonthlyPattern, interval = 1, end: RecurrenceEnd = NEVER): RecurrenceRule => ({
  frequency: 'monthly',
  interval,
  startDate: date(startDate),
  end,
  pattern,
});

const yearly = (startDate: string, interval = 1, end: RecurrenceEnd = NEVER): RecurrenceRule => ({
  frequency: 'yearly',
  interval,
  startDate: date(startDate),
  end,
});

const dates = (rule: RecurrenceRule, span: ExpansionWindow, cursor?: OccurrenceCursor | null): readonly string[] =>
  expandRecurrence(rule, span, cursor).occurrences.map(occurrence => formatLocalDate(occurrence.date));

describe('expandRecurrence', () => {
  describe('daily', () => {
    const cases: readonly [label: string, rule: RecurrenceRule, span: ExpansionWindow, expected: readonly string[]][] = [
      ['every day', daily('2024-01-01'), window('2024-01-01', '2024-01-05'), ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']],
      ['every third day anchored on the start date', daily('2024-01-01', 3), window('2024-01-01', '2024-01-10'), ['2024-01-01', '2024-01-04', '2024-01-07', '2024-01-10']],
      ['a window opening mid-series', daily('2024-01-01', 3), window('2024-01-05', '2024-01-11'), ['2024-01-07', '2024-01-10']],
      ['a window entirely before the start date', daily('2024-06-01'), window('2024-01-01', '2024-05-31'), []],
      ['an interval below one read as one', daily('2024-01-01', 0), window('2024-01-01', '2024-01-03'), ['2024-01-01', '2024-01-02', '2024-01-03']],
      ['a span crossing a leap day', daily('2024-02-27'), window('2024-02-27', '2024-03-01'), ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']],
      ['a span crossing a non-leap February', daily('2023-02-27'), window('2023-02-27', '2023-03-01'), ['2023-02-27', '2023-02-28', '2023-03-01']],
    ];

    for (const [label, rule, span, expected] of cases) {
      it(`should expand ${label}`, () => {
        expect(dates(rule, span)).toEqual(expected);
      });
    }
  });

  describe('weekly', () => {
    const cases: readonly [label: string, rule: RecurrenceRule, span: ExpansionWindow, expected: readonly string[]][] = [
      ['a single weekday', weekly('2024-01-01', [3]), window('2024-01-01', '2024-01-31'), ['2024-01-03', '2024-01-10', '2024-01-17', '2024-01-24', '2024-01-31']],
      ['several weekdays in ascending order', weekly('2024-01-01', [5, 1, 3]), window('2024-01-01', '2024-01-08'), ['2024-01-01', '2024-01-03', '2024-01-05', '2024-01-08']],
      ['duplicate weekdays collapsed', weekly('2024-01-01', [1, 1, 3]), window('2024-01-01', '2024-01-04'), ['2024-01-01', '2024-01-03']],
      [
        'a start date mid-week clipping earlier weekdays',
        weekly('2024-01-04', [1, 4]),
        window('2024-01-01', '2024-01-15'),
        ['2024-01-04', '2024-01-08', '2024-01-11', '2024-01-15'],
      ],
      [
        'a fortnightly rule anchored on the start date Monday week',
        weekly('2024-01-04', [1, 4], 2),
        window('2024-01-01', '2024-02-05'),
        ['2024-01-04', '2024-01-15', '2024-01-18', '2024-01-29', '2024-02-01'],
      ],
      ['a Sunday-only rule', weekly('2024-01-01', [7]), window('2024-01-01', '2024-01-22'), ['2024-01-07', '2024-01-14', '2024-01-21']],
    ];

    for (const [label, rule, span, expected] of cases) {
      it(`should expand ${label}`, () => {
        expect(dates(rule, span)).toEqual(expected);
      });
    }

    describe('Monday-anchored interval counting across a year boundary', () => {
      const rule = weekly('2024-12-26', [1, 4], 2);

      it('should count the start date week as the anchor week', () => {
        expect(dates(rule, window('2024-12-23', '2025-01-31'))).toEqual(['2024-12-26', '2025-01-06', '2025-01-09', '2025-01-20', '2025-01-23']);
      });

      it('should skip the calendar week following the anchor week', () => {
        expect(dates(rule, window('2024-12-30', '2025-01-05'))).toEqual([]);
      });

      it('should treat a Sunday and the Monday after it as different weeks', () => {
        expect(dates(weekly('2024-12-29', [7, 1], 2), window('2024-12-23', '2025-01-20'))).toEqual(['2024-12-29', '2025-01-06', '2025-01-12', '2025-01-20']);
      });
    });
  });

  describe('monthly by day of month', () => {
    const cases: readonly [label: string, rule: RecurrenceRule, span: ExpansionWindow, expected: readonly string[]][] = [
      [
        'the 31st clamped to every month length',
        monthly('2024-01-31', { kind: 'day_of_month', dayOfMonth: 31 }),
        window('2024-01-01', '2024-06-30'),
        ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30'],
      ],
      [
        'the 30th clamped in a non-leap February',
        monthly('2023-01-30', { kind: 'day_of_month', dayOfMonth: 30 }),
        window('2023-01-01', '2023-04-30'),
        ['2023-01-30', '2023-02-28', '2023-03-30', '2023-04-30'],
      ],
      [
        'a quarterly rule',
        monthly('2024-01-15', { kind: 'day_of_month', dayOfMonth: 15 }, 3),
        window('2024-01-01', '2024-12-31'),
        ['2024-01-15', '2024-04-15', '2024-07-15', '2024-10-15'],
      ],
      [
        'a start date after the pattern date in its own month',
        monthly('2024-01-20', { kind: 'day_of_month', dayOfMonth: 5 }),
        window('2024-01-01', '2024-03-31'),
        ['2024-02-05', '2024-03-05'],
      ],
      [
        'a day-of-month beyond every month length',
        monthly('2024-01-01', { kind: 'day_of_month', dayOfMonth: 31 }, 12),
        window('2024-01-01', '2026-12-31'),
        ['2024-01-31', '2025-01-31', '2026-01-31'],
      ],
    ];

    for (const [label, rule, span, expected] of cases) {
      it(`should expand ${label}`, () => {
        expect(dates(rule, span)).toEqual(expected);
      });
    }
  });

  describe('monthly by nth weekday', () => {
    const cases: readonly [label: string, rule: RecurrenceRule, span: ExpansionWindow, expected: readonly string[]][] = [
      [
        'the second Tuesday',
        monthly('2024-01-01', { kind: 'nth_weekday', weekday: 2, ordinal: 2 }),
        window('2024-01-01', '2024-04-30'),
        ['2024-01-09', '2024-02-13', '2024-03-12', '2024-04-09'],
      ],
      [
        'the last Friday',
        monthly('2024-01-01', { kind: 'nth_weekday', weekday: 5, ordinal: 'last' }),
        window('2024-01-01', '2024-04-30'),
        ['2024-01-26', '2024-02-23', '2024-03-29', '2024-04-26'],
      ],
      ['the last Thursday landing on a leap day', monthly('2024-02-01', { kind: 'nth_weekday', weekday: 4, ordinal: 'last' }), window('2024-02-01', '2024-02-29'), ['2024-02-29']],
      [
        'the fourth Sunday every two months',
        monthly('2024-01-01', { kind: 'nth_weekday', weekday: 7, ordinal: 4 }, 2),
        window('2024-01-01', '2024-08-31'),
        ['2024-01-28', '2024-03-24', '2024-05-26', '2024-07-28'],
      ],
      [
        'the first Monday across a year boundary',
        monthly('2024-11-01', { kind: 'nth_weekday', weekday: 1, ordinal: 1 }),
        window('2024-11-01', '2025-02-28'),
        ['2024-11-04', '2024-12-02', '2025-01-06', '2025-02-03'],
      ],
    ];

    for (const [label, rule, span, expected] of cases) {
      it(`should expand ${label}`, () => {
        expect(dates(rule, span)).toEqual(expected);
      });
    }
  });

  describe('yearly', () => {
    const cases: readonly [label: string, rule: RecurrenceRule, span: ExpansionWindow, expected: readonly string[]][] = [
      ['an ordinary anniversary', yearly('2024-07-04'), window('2024-01-01', '2027-12-31'), ['2024-07-04', '2025-07-04', '2026-07-04', '2027-07-04']],
      [
        'a leap-day anniversary clamped to Feb 28 in common years',
        yearly('2024-02-29'),
        window('2024-01-01', '2028-12-31'),
        ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'],
      ],
      [
        'a four-yearly leap-day anniversary that never clamps',
        yearly('2024-02-29', 4),
        window('2024-01-01', '2036-12-31'),
        ['2024-02-29', '2028-02-29', '2032-02-29', '2036-02-29'],
      ],
      ['a leap-day anniversary crossing the 2100 non-leap century', yearly('2096-02-29', 4), window('2096-01-01', '2104-12-31'), ['2096-02-29', '2100-02-28', '2104-02-29']],
      ['a biennial anniversary', yearly('2024-03-01', 2), window('2024-01-01', '2030-12-31'), ['2024-03-01', '2026-03-01', '2028-03-01', '2030-03-01']],
    ];

    for (const [label, rule, span, expected] of cases) {
      it(`should expand ${label}`, () => {
        expect(dates(rule, span)).toEqual(expected);
      });
    }
  });

  describe('ends', () => {
    it('should never stop a NEVER rule', () => {
      expect(dates(daily('2024-01-01'), window('2124-01-01', '2124-01-03'))).toEqual(['2124-01-01', '2124-01-02', '2124-01-03']);
    });

    it('should stop a COUNT rule after N occurrences', () => {
      expect(dates(daily('2024-01-01', 2, { kind: 'count', count: 4 }), window('2024-01-01', '2024-12-31'))).toEqual(['2024-01-01', '2024-01-03', '2024-01-05', '2024-01-07']);
    });

    it('should yield nothing for a zero COUNT', () => {
      expect(dates(daily('2024-01-01', 1, { kind: 'count', count: 0 }), window('2024-01-01', '2024-12-31'))).toEqual([]);
    });

    it('should count weekly occurrences across all selected weekdays', () => {
      expect(dates(weekly('2024-01-01', [1, 3, 5], 1, { kind: 'count', count: 5 }), window('2024-01-01', '2024-12-31'))).toEqual([
        '2024-01-01',
        '2024-01-03',
        '2024-01-05',
        '2024-01-08',
        '2024-01-10',
      ]);
    });

    it('should include the UNTIL date itself', () => {
      expect(dates(daily('2024-01-01', 1, { kind: 'until', date: date('2024-01-04') }), window('2024-01-01', '2024-12-31'))).toEqual([
        '2024-01-01',
        '2024-01-02',
        '2024-01-03',
        '2024-01-04',
      ]);
    });

    it('should yield nothing when UNTIL precedes the start date', () => {
      expect(dates(daily('2024-06-01', 1, { kind: 'until', date: date('2024-05-31') }), window('2024-01-01', '2024-12-31'))).toEqual([]);
    });

    it('should stop a monthly UNTIL rule on the clamped date', () => {
      const rule = monthly('2024-01-31', { kind: 'day_of_month', dayOfMonth: 31 }, 1, { kind: 'until', date: date('2024-02-29') });
      expect(dates(rule, window('2024-01-01', '2024-12-31'))).toEqual(['2024-01-31', '2024-02-29']);
    });
  });

  describe('exceptions', () => {
    it('should exclude listed dates from the expansion', () => {
      expect(dates(daily('2024-01-01', 1, NEVER, ['2024-01-02', '2024-01-04']), window('2024-01-01', '2024-01-05'))).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('should ignore exception dates that are not occurrences', () => {
      expect(dates(daily('2024-01-01', 2, NEVER, ['2024-01-02']), window('2024-01-01', '2024-01-05'))).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
    });

    it('should let an exception consume its COUNT slot', () => {
      const rule = daily('2024-01-01', 1, { kind: 'count', count: 4 }, ['2024-01-02']);
      expect(dates(rule, window('2024-01-01', '2024-12-31'))).toEqual(['2024-01-01', '2024-01-03', '2024-01-04']);
    });

    it('should keep occurrence indices stable when a date is excepted', () => {
      const span = window('2024-01-01', '2024-01-05');
      const withException = expandRecurrence(daily('2024-01-01', 1, NEVER, ['2024-01-03']), span).occurrences;
      expect(withException.map(occurrence => occurrence.index)).toEqual([0, 1, 3, 4]);
    });
  });

  describe('window handling', () => {
    it('should return nothing for an inverted window', () => {
      expect(expandRecurrence(daily('2024-01-01'), window('2024-01-05', '2024-01-01'))).toEqual({ occurrences: [], cursor: null });
    });

    it('should return a single-day window as a membership test', () => {
      expect(dates(daily('2024-01-01', 2), window('2024-01-03', '2024-01-03'))).toEqual(['2024-01-03']);
      expect(dates(daily('2024-01-01', 2), window('2024-01-04', '2024-01-04'))).toEqual([]);
    });

    it('should number occurrences from the start date regardless of the window', () => {
      const occurrences = expandRecurrence(daily('2024-01-01'), window('2024-01-11', '2024-01-13')).occurrences;
      expect(occurrences.map(occurrence => occurrence.index)).toEqual([10, 11, 12]);
    });
  });
});

describe('occurrence cursors', () => {
  const counted = daily('2024-01-01', 3, { kind: 'count', count: 40 }, ['2024-01-07', '2024-02-06']);

  it('should return the last raw occurrence at or before the window end', () => {
    const expansion = expandRecurrence(counted, window('2024-01-01', '2024-01-10'));
    expect(expansion.cursor).toEqual({ date: date('2024-01-10'), index: 3 });
  });

  it('should return the excepted occurrence as the cursor when it is last in the window', () => {
    const expansion = expandRecurrence(counted, window('2024-01-01', '2024-01-08'));
    expect(expansion.cursor).toEqual({ date: date('2024-01-07'), index: 2 });
  });

  it('should return a null cursor when nothing has occurred yet', () => {
    expect(expandRecurrence(daily('2024-06-01'), window('2024-01-01', '2024-05-31')).cursor).toBeNull();
  });

  it('should resume a COUNT expansion from a cursor identically to a full recomputation', () => {
    const span = window('2024-01-01', '2025-01-01');
    const full = expandRecurrence(counted, span).occurrences;

    for (let day = 0; day < 200; day += 1) {
      const boundary = addDays(date('2024-01-01'), day);
      const prefix = expandRecurrence(counted, { from: date('2024-01-01'), to: boundary });
      const suffix = expandRecurrence(counted, { from: addDays(boundary, 1), to: span.to }, prefix.cursor);
      expect([...prefix.occurrences, ...suffix.occurrences]).toEqual(full);
    }
  });

  it('should resume a weekly COUNT expansion mid-week identically to a full recomputation', () => {
    const rule = weekly('2024-12-26', [1, 3, 5], 2, { kind: 'count', count: 25 });
    const span = window('2024-12-01', '2026-01-01');
    const full = expandRecurrence(rule, span).occurrences;

    for (let day = 0; day < 120; day += 1) {
      const boundary = addDays(date('2024-12-01'), day);
      const prefix = expandRecurrence(rule, { from: span.from, to: boundary });
      const suffix = expandRecurrence(rule, { from: addDays(boundary, 1), to: span.to }, prefix.cursor);
      expect([...prefix.occurrences, ...suffix.occurrences]).toEqual(full);
    }
  });

  it('should resume a monthly COUNT expansion from a cursor identically to a full recomputation', () => {
    const rule = monthly('2024-01-31', { kind: 'day_of_month', dayOfMonth: 31 }, 1, { kind: 'count', count: 30 });
    const span = window('2024-01-01', '2027-01-01');
    const full = expandRecurrence(rule, span).occurrences;

    for (let month = 0; month < 24; month += 1) {
      const boundary = addDays(date('2024-01-01'), month * 30);
      const prefix = expandRecurrence(rule, { from: span.from, to: boundary });
      const suffix = expandRecurrence(rule, { from: addDays(boundary, 1), to: span.to }, prefix.cursor);
      expect([...prefix.occurrences, ...suffix.occurrences]).toEqual(full);
    }
  });

  describe('rejecting cursors that would lose occurrences', () => {
    const rule = daily('2024-01-01', 1, { kind: 'count', count: 20 });
    const span = window('2024-01-05', '2024-01-08');
    const expected = ['2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08'];

    const cases: readonly [label: string, cursor: OccurrenceCursor][] = [
      ['a cursor after the window start', { date: date('2024-01-06'), index: 5 }],
      ['a cursor before the start date', { date: date('2023-12-25'), index: 0 }],
      ['a cursor with a negative index', { date: date('2024-01-03'), index: -1 }],
    ];

    for (const [label, cursor] of cases) {
      it(`should ignore ${label}`, () => {
        expect(dates(rule, span, cursor)).toEqual(expected);
      });
    }

    it('should honour a cursor exactly at the window start', () => {
      expect(dates(rule, span, { date: date('2024-01-05'), index: 4 })).toEqual(expected);
    });
  });
});

describe('occursOn', () => {
  const cases: readonly [label: string, rule: RecurrenceRule, iso: string, expected: boolean][] = [
    ['a matching daily interval', daily('2024-01-01', 5), '2024-01-11', true],
    ['a non-matching daily interval', daily('2024-01-01', 5), '2024-01-12', false],
    ['a clamped monthly day', monthly('2024-01-31', { kind: 'day_of_month', dayOfMonth: 31 }), '2024-02-29', true],
    ['the nominal day in a short month', monthly('2024-01-31', { kind: 'day_of_month', dayOfMonth: 31 }), '2024-02-28', false],
    ['a clamped leap-day anniversary', yearly('2024-02-29'), '2025-02-28', true],
    ['a date past a COUNT end', daily('2024-01-01', 1, { kind: 'count', count: 3 }), '2024-01-04', false],
    ['a date past an UNTIL end', daily('2024-01-01', 1, { kind: 'until', date: date('2024-01-03') }), '2024-01-04', false],
    ['an excepted date', daily('2024-01-01', 1, NEVER, ['2024-01-03']), '2024-01-03', false],
    ['a date before the start date', daily('2024-06-01'), '2024-05-31', false],
  ];

  for (const [label, rule, iso, expected] of cases) {
    it(`should report ${expected} for ${label}`, () => {
      expect(occursOn(rule, date(iso))).toBe(expected);
    });
  }

  it('should agree with a cursor-resumed expansion', () => {
    const rule = weekly('2024-01-01', [2, 6], 3, { kind: 'count', count: 12 });
    const cursor = expandRecurrence(rule, window('2024-01-01', '2024-03-01')).cursor;
    for (let day = 0; day < 200; day += 1) {
      const current = addDays(date('2024-03-02'), day);
      expect(occursOn(rule, current, cursor)).toBe(occursOn(rule, current));
    }
  });
});

describe('nextOccurrenceOnOrAfter', () => {
  const cases: readonly [label: string, rule: RecurrenceRule, from: string, expected: string | null][] = [
    ['a date that is itself an occurrence', daily('2024-01-01', 4), '2024-01-05', '2024-01-05'],
    ['a date between occurrences', daily('2024-01-01', 4), '2024-01-06', '2024-01-09'],
    ['a date before the start date', daily('2024-06-01'), '2024-01-01', '2024-06-01'],
    ['a date on an excepted occurrence', daily('2024-01-01', 1, NEVER, ['2024-01-05']), '2024-01-05', '2024-01-06'],
    ['a date past a COUNT end', daily('2024-01-01', 1, { kind: 'count', count: 3 }), '2024-01-04', null],
    ['a date past an UNTIL end', daily('2024-01-01', 1, { kind: 'until', date: date('2024-01-03') }), '2024-01-04', null],
    ['the next last-Friday', monthly('2024-01-01', { kind: 'nth_weekday', weekday: 5, ordinal: 'last' }), '2024-01-27', '2024-02-23'],
    ['the next leap-day anniversary', yearly('2024-02-29'), '2024-03-01', '2025-02-28'],
  ];

  for (const [label, rule, from, expected] of cases) {
    it(`should find ${expected ?? 'nothing'} after ${label}`, () => {
      const next = nextOccurrenceOnOrAfter(rule, date(from));
      expect(next === null ? null : formatLocalDate(next.date)).toBe(expected);
    });
  }

  it('should carry the occurrence index', () => {
    expect(nextOccurrenceOnOrAfter(daily('2024-01-01', 2), date('2024-01-06'))).toEqual({ date: date('2024-01-07'), index: 3 });
  });

  it('should agree with a cursor-resumed search', () => {
    const rule = monthly('2024-01-15', { kind: 'day_of_month', dayOfMonth: 15 }, 2, { kind: 'count', count: 18 });
    const cursor = expandRecurrence(rule, window('2024-01-01', '2024-12-31')).cursor;
    expect(nextOccurrenceOnOrAfter(rule, date('2025-02-01'), cursor)).toEqual(nextOccurrenceOnOrAfter(rule, date('2025-02-01')));
  });
});
