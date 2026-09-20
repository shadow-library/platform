import { describe, expect, it } from 'bun:test';

import {
  addDays,
  addMonths,
  clampPerformedAt,
  clampToMonthEnd,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  epochDayOf,
  formatLocalDate,
  instantAtLocalMinute,
  isLeapYear,
  isSameLocalDate,
  type LocalDate,
  localDateAt,
  localDateFromEpochDay,
  localDateOf,
  localDayLengthMinutes,
  type LocalMinuteResolution,
  minuteOfDayAt,
  mondayWeekIndexOf,
  monthIndexOf,
  nthWeekdayOfMonth,
  type NthWeekdayOrdinal,
  offsetMinutesAt,
  parseLocalDate,
  type PerformedAtOutcome,
  startOfLocalDay,
  startOfMondayWeek,
  type TimeZone,
  type Weekday,
  weekdayOf,
  weeksBetween,
} from '@modules/rules';

const NEW_YORK = 'America/New_York';
const BERLIN = 'Europe/Berlin';
const LORD_HOWE = 'Australia/Lord_Howe';
const KOLKATA = 'Asia/Kolkata';

const date = (iso: string): LocalDate => {
  const parsed = parseLocalDate(iso);
  if (!parsed) throw new TypeError(`fixture is not an ISO date: ${iso}`);
  return parsed;
};

const minutes = (hour: number, minute = 0): number => hour * 60 + minute;

describe('calendar primitives', () => {
  describe('isLeapYear', () => {
    const cases: readonly [year: number, leap: boolean][] = [
      [2023, false],
      [2024, true],
      [1900, false],
      [2000, true],
      [2100, false],
      [2400, true],
    ];

    for (const [year, leap] of cases) {
      it(`should report ${year} as ${leap ? 'a leap year' : 'a common year'}`, () => {
        expect(isLeapYear(year)).toBe(leap);
      });
    }
  });

  describe('daysInMonth', () => {
    const cases: readonly [year: number, month: number, length: number][] = [
      [2024, 1, 31],
      [2024, 2, 29],
      [2023, 2, 28],
      [1900, 2, 28],
      [2000, 2, 29],
      [2024, 4, 30],
      [2024, 12, 31],
    ];

    for (const [year, month, length] of cases) {
      it(`should report ${length} days in ${year}-${month}`, () => {
        expect(daysInMonth(year, month)).toBe(length);
      });
    }
  });

  describe('clampToMonthEnd', () => {
    const cases: readonly [label: string, year: number, month: number, day: number, expected: string][] = [
      ['the 31st in a 30-day month', 2024, 4, 31, '2024-04-30'],
      ['the 31st in February of a leap year', 2024, 2, 31, '2024-02-29'],
      ['the 31st in February of a common year', 2023, 2, 31, '2023-02-28'],
      ['the 29th in February of a common year', 2025, 2, 29, '2025-02-28'],
      ['a day that already fits', 2024, 6, 15, '2024-06-15'],
    ];

    for (const [label, year, month, day, expected] of cases) {
      it(`should clamp ${label} to ${expected}`, () => {
        expect(formatLocalDate(clampToMonthEnd(year, month, day))).toBe(expected);
      });
    }
  });

  describe('parseLocalDate', () => {
    it('should round-trip an ISO date', () => {
      expect(formatLocalDate(date('2024-02-29'))).toBe('2024-02-29');
    });

    const rejected = ['2024-2-29', '2023-02-29', '2024-13-01', '2024-00-10', '2024-04-31', 'not-a-date', ''];
    for (const value of rejected) {
      it(`should reject ${JSON.stringify(value)}`, () => {
        expect(parseLocalDate(value)).toBeNull();
      });
    }
  });

  describe('epoch day round-trip', () => {
    const cases = ['1970-01-01', '2024-02-29', '2024-12-31', '2100-03-01', '1999-12-31'];
    for (const iso of cases) {
      it(`should round-trip ${iso} through its epoch day`, () => {
        expect(formatLocalDate(localDateFromEpochDay(epochDayOf(date(iso))))).toBe(iso);
      });
    }

    it('should place the epoch at day zero', () => {
      expect(epochDayOf(date('1970-01-01'))).toBe(0);
    });
  });

  describe('addDays and daysBetween', () => {
    const cases: readonly [from: string, days: number, to: string][] = [
      ['2024-02-28', 1, '2024-02-29'],
      ['2023-02-28', 1, '2023-03-01'],
      ['2024-12-31', 1, '2025-01-01'],
      ['2024-01-01', -1, '2023-12-31'],
      ['2024-03-09', 366, '2025-03-10'],
    ];

    for (const [from, days, to] of cases) {
      it(`should move ${from} by ${days} days to ${to}`, () => {
        expect(formatLocalDate(addDays(date(from), days))).toBe(to);
        expect(daysBetween(date(from), date(to))).toBe(days);
      });
    }
  });

  describe('addMonths', () => {
    const cases: readonly [from: string, months: number, to: string][] = [
      ['2024-01-31', 1, '2024-02-29'],
      ['2023-01-31', 1, '2023-02-28'],
      ['2024-01-31', 3, '2024-04-30'],
      ['2024-12-15', 1, '2025-01-15'],
      ['2024-01-15', -1, '2023-12-15'],
      ['2024-01-15', -13, '2022-12-15'],
    ];

    for (const [from, months, to] of cases) {
      it(`should move ${from} by ${months} months to ${to}`, () => {
        expect(formatLocalDate(addMonths(date(from), months))).toBe(to);
      });
    }
  });

  describe('comparison helpers', () => {
    it('should order dates by their epoch day', () => {
      expect(compareLocalDates(date('2024-01-01'), date('2024-01-02'))).toBeLessThan(0);
      expect(compareLocalDates(date('2024-01-02'), date('2024-01-01'))).toBeGreaterThan(0);
      expect(compareLocalDates(date('2024-01-01'), date('2024-01-01'))).toBe(0);
    });

    it('should compare dates structurally', () => {
      expect(isSameLocalDate(date('2024-01-01'), localDateOf(2024, 1, 1))).toBe(true);
      expect(isSameLocalDate(date('2024-01-01'), date('2024-01-02'))).toBe(false);
    });

    it('should index months monotonically across a year boundary', () => {
      expect(monthIndexOf(date('2025-01-01')) - monthIndexOf(date('2024-12-01'))).toBe(1);
    });
  });
});

describe('Monday-anchored week indexing', () => {
  describe('weekdayOf', () => {
    const cases: readonly [iso: string, weekday: Weekday][] = [
      ['2024-01-01', 1],
      ['2024-01-04', 4],
      ['2024-01-07', 7],
      ['1970-01-01', 4],
      ['1969-12-29', 1],
    ];

    for (const [iso, weekday] of cases) {
      it(`should read ${iso} as ISO weekday ${weekday}`, () => {
        expect(weekdayOf(date(iso))).toBe(weekday);
      });
    }
  });

  describe('startOfMondayWeek', () => {
    const cases: readonly [iso: string, monday: string][] = [
      ['2024-01-01', '2024-01-01'],
      ['2024-01-07', '2024-01-01'],
      ['2025-01-01', '2024-12-30'],
      ['2021-01-03', '2020-12-28'],
    ];

    for (const [iso, monday] of cases) {
      it(`should anchor ${iso} to the Monday of ${monday}`, () => {
        expect(formatLocalDate(startOfMondayWeek(date(iso)))).toBe(monday);
      });
    }
  });

  describe('weeksBetween across year boundaries', () => {
    const cases: readonly [label: string, from: string, to: string, weeks: number][] = [
      ['a Sunday and the Monday after it', '2024-12-29', '2024-12-30', 1],
      ['two dates in the same Monday week spanning new year', '2024-12-30', '2025-01-05', 0],
      ['the new-year week and the week after', '2025-01-05', '2025-01-06', 1],
      ['a full year of weeks', '2024-01-01', '2024-12-30', 52],
      ['a backwards span', '2025-01-06', '2024-12-30', -1],
    ];

    for (const [label, from, to, weeks] of cases) {
      it(`should count ${weeks} weeks between ${label}`, () => {
        expect(weeksBetween(date(from), date(to))).toBe(weeks);
      });
    }
  });

  it('should keep the week index monotonic in step with Mondays', () => {
    const start = date('2024-11-01');
    for (let offset = 0; offset < 120; offset++) {
      const current = addDays(start, offset);
      expect(mondayWeekIndexOf(current)).toBe(mondayWeekIndexOf(startOfMondayWeek(current)));
      expect(weeksBetween(startOfMondayWeek(current), current)).toBe(0);
    }
  });
});

describe('nthWeekdayOfMonth', () => {
  const cases: readonly [label: string, year: number, month: number, weekday: Weekday, ordinal: NthWeekdayOrdinal, expected: string][] = [
    ['the 1st Monday of March 2024', 2024, 3, 1, 1, '2024-03-04'],
    ['the 3rd Monday of March 2024', 2024, 3, 1, 3, '2024-03-18'],
    ['the 4th Friday of March 2024', 2024, 3, 5, 4, '2024-03-22'],
    ['the last Friday of March 2024', 2024, 3, 5, 'last', '2024-03-29'],
    ['the last Thursday of February 2024', 2024, 2, 4, 'last', '2024-02-29'],
    ['the last Thursday of February 2023', 2023, 2, 4, 'last', '2023-02-23'],
    ['the 1st Sunday of a month starting on Sunday', 2024, 9, 7, 1, '2024-09-01'],
    ['the last Sunday of a month ending on Sunday', 2024, 9, 7, 'last', '2024-09-29'],
    ['the last Tuesday of December 2024', 2024, 12, 2, 'last', '2024-12-31'],
  ];

  for (const [label, year, month, weekday, ordinal, expected] of cases) {
    it(`should resolve ${label} to ${expected}`, () => {
      expect(formatLocalDate(nthWeekdayOfMonth(year, month, weekday, ordinal))).toBe(expected);
    });
  }

  it('should never let the 4th weekday leave its month', () => {
    for (let month = 1; month <= 12; month++) {
      for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
        expect(nthWeekdayOfMonth(2024, month, weekday, 4).month).toBe(month);
        expect(nthWeekdayOfMonth(2024, month, weekday, 'last').month).toBe(month);
      }
    }
  });
});

describe('zoned derivations', () => {
  describe('localDateAt and minuteOfDayAt', () => {
    const cases: readonly [label: string, instant: number, timeZone: TimeZone, expected: string, minuteOfDay: number][] = [
      ['UTC midnight in New York', Date.UTC(2024, 0, 1, 0, 0), NEW_YORK, '2023-12-31', minutes(19)],
      ['UTC midnight in Berlin', Date.UTC(2024, 0, 1, 0, 0), BERLIN, '2024-01-01', minutes(1)],
      ['a half-hour zone', Date.UTC(2024, 0, 1, 0, 0), KOLKATA, '2024-01-01', minutes(5, 30)],
      ['the Lord Howe half-hour offset', Date.UTC(2024, 5, 1, 0, 0), LORD_HOWE, '2024-06-01', minutes(10, 30)],
      ['the last minute of a New York day', Date.UTC(2024, 6, 2, 3, 59), NEW_YORK, '2024-07-01', 1439],
    ];

    for (const [label, instant, timeZone, expected, minuteOfDay] of cases) {
      it(`should derive ${expected} ${minuteOfDay} for ${label}`, () => {
        expect(formatLocalDate(localDateAt(instant, timeZone))).toBe(expected);
        expect(minuteOfDayAt(instant, timeZone)).toBe(minuteOfDay);
      });
    }
  });

  describe('offsetMinutesAt', () => {
    const cases: readonly [timeZone: TimeZone, instant: number, offset: number][] = [
      [NEW_YORK, Date.UTC(2024, 0, 15), -300],
      [NEW_YORK, Date.UTC(2024, 6, 15), -240],
      [BERLIN, Date.UTC(2024, 0, 15), 60],
      [BERLIN, Date.UTC(2024, 6, 15), 120],
      [LORD_HOWE, Date.UTC(2024, 5, 15), 630],
      [LORD_HOWE, Date.UTC(2024, 11, 15), 660],
      [KOLKATA, Date.UTC(2024, 5, 15), 330],
    ];

    for (const [timeZone, instant, offset] of cases) {
      it(`should read ${offset} minutes for ${timeZone} at ${new Date(instant).toISOString()}`, () => {
        expect(offsetMinutesAt(instant, timeZone)).toBe(offset);
      });
    }
  });
});

describe('DST-aware local days', () => {
  describe('localDayLengthMinutes', () => {
    const cases: readonly [timeZone: TimeZone, iso: string, length: number][] = [
      [NEW_YORK, '2024-03-09', 1440],
      [NEW_YORK, '2024-03-10', 1380],
      [NEW_YORK, '2024-03-11', 1440],
      [NEW_YORK, '2024-11-03', 1500],
      [BERLIN, '2024-03-31', 1380],
      [BERLIN, '2024-10-27', 1500],
      [BERLIN, '2024-06-01', 1440],
      [LORD_HOWE, '2024-10-06', 1410],
      [LORD_HOWE, '2024-04-07', 1470],
      [LORD_HOWE, '2024-06-01', 1440],
      [KOLKATA, '2024-03-10', 1440],
      [KOLKATA, '2024-11-03', 1440],
    ];

    for (const [timeZone, iso, length] of cases) {
      it(`should measure ${length} minutes for ${iso} in ${timeZone}`, () => {
        expect(localDayLengthMinutes(date(iso), timeZone)).toBe(length);
      });
    }
  });

  it('should start every local day at the instant whose local minute-of-day is zero', () => {
    const zones: readonly TimeZone[] = [NEW_YORK, BERLIN, LORD_HOWE, KOLKATA];
    for (const timeZone of zones) {
      for (let offset = 0; offset < 400; offset += 7) {
        const day = addDays(date('2024-01-01'), offset);
        const start = startOfLocalDay(day, timeZone);
        expect(formatLocalDate(localDateAt(start, timeZone))).toBe(formatLocalDate(day));
        expect(minuteOfDayAt(start, timeZone)).toBe(0);
        expect(minuteOfDayAt(start - 1, timeZone)).not.toBe(0);
      }
    }
  });

  describe('instantAtLocalMinute across transitions', () => {
    const cases: readonly [label: string, timeZone: TimeZone, iso: string, minuteOfDay: number, resolution: LocalMinuteResolution, resolvedMinute: number][] = [
      ['a wall time before the New York spring-forward gap', NEW_YORK, '2024-03-10', minutes(1, 30), 'exact', minutes(1, 30)],
      ['the first minute of the New York spring-forward gap', NEW_YORK, '2024-03-10', minutes(2), 'gap_shifted', minutes(3)],
      ['a wall time inside the New York spring-forward gap', NEW_YORK, '2024-03-10', minutes(2, 30), 'gap_shifted', minutes(3)],
      ['the first minute after the New York spring-forward gap', NEW_YORK, '2024-03-10', minutes(3), 'exact', minutes(3)],
      ['a repeated New York fall-back wall time', NEW_YORK, '2024-11-03', minutes(1, 30), 'ambiguous_earlier', minutes(1, 30)],
      ['a wall time inside the Berlin spring-forward gap', BERLIN, '2024-03-31', minutes(2, 30), 'gap_shifted', minutes(3)],
      ['a repeated Berlin fall-back wall time', BERLIN, '2024-10-27', minutes(2, 30), 'ambiguous_earlier', minutes(2, 30)],
      ['a wall time inside the Lord Howe half-hour gap', LORD_HOWE, '2024-10-06', minutes(2, 15), 'gap_shifted', minutes(2, 30)],
      ['a repeated Lord Howe fall-back wall time', LORD_HOWE, '2024-04-07', minutes(1, 45), 'ambiguous_earlier', minutes(1, 45)],
      ['an ordinary wall time in a zone without DST', KOLKATA, '2024-03-10', minutes(2, 30), 'exact', minutes(2, 30)],
    ];

    for (const [label, timeZone, iso, minuteOfDay, resolution, resolvedMinute] of cases) {
      it(`should resolve ${label} as ${resolution}`, () => {
        const resolved = instantAtLocalMinute(date(iso), minuteOfDay, timeZone);
        expect(resolved.resolution).toBe(resolution);
        expect(resolved.minuteOfDay).toBe(resolvedMinute);
        expect(formatLocalDate(resolved.date)).toBe(iso);
        expect(minuteOfDayAt(resolved.instant, timeZone)).toBe(resolvedMinute);
      });
    }

    it('should pick the earlier of two repeated instants on a fall-back day', () => {
      const resolved = instantAtLocalMinute(date('2024-11-03'), minutes(1, 30), NEW_YORK);
      expect(offsetMinutesAt(resolved.instant, NEW_YORK)).toBe(-240);
      expect(minuteOfDayAt(resolved.instant + 60 * 60_000, NEW_YORK)).toBe(minutes(1, 30));
    });

    it('should resolve a gap wall time to the transition itself, never past it', () => {
      const resolved = instantAtLocalMinute(date('2024-03-10'), minutes(2, 30), NEW_YORK);
      expect(minuteOfDayAt(resolved.instant - 1, NEW_YORK)).toBe(minutes(1, 59));
    });

    it('should resolve a midnight that does not exist to the first minute that does', () => {
      const resolved = instantAtLocalMinute(date('2024-09-08'), 0, 'America/Santiago');
      expect(resolved.resolution).toBe('gap_shifted');
      expect(resolved.minuteOfDay).toBe(minutes(1));
    });

    it('should keep every resolved instant monotonic in the requested wall minute', () => {
      const zones: readonly [TimeZone, string][] = [
        [NEW_YORK, '2024-03-10'],
        [NEW_YORK, '2024-11-03'],
        [BERLIN, '2024-03-31'],
        [LORD_HOWE, '2024-10-06'],
      ];

      for (const [timeZone, iso] of zones) {
        let previous = Number.NEGATIVE_INFINITY;
        for (let minuteOfDay = 0; minuteOfDay < 1440; minuteOfDay++) {
          const { instant } = instantAtLocalMinute(date(iso), minuteOfDay, timeZone);
          expect(instant).toBeGreaterThanOrEqual(previous);
          previous = instant;
        }
      }
    });
  });
});

describe('clampPerformedAt', () => {
  const occurrenceDate = date('2024-06-10');
  const dayStart = startOfLocalDay(occurrenceDate, NEW_YORK);
  const serverNow = dayStart + minutes(20) * 60_000;

  const cases: readonly [label: string, performedAt: number, lastAckedSyncAt: number | null, expectedInstant: number, outcome: PerformedAtOutcome][] = [
    ['a claim inside the window', dayStart + minutes(9) * 60_000, null, dayStart + minutes(9) * 60_000, 'within_window'],
    ['a claim before the occurrence day', dayStart - 60_000, null, dayStart, 'clamped_to_window_start'],
    ['a claim before the last acknowledged sync', dayStart + minutes(1) * 60_000, dayStart + minutes(8) * 60_000, dayStart + minutes(8) * 60_000, 'clamped_to_window_start'],
    ['a claim in the future', serverNow + 60_000, null, serverNow, 'clamped_to_server_now'],
    ['a sync checkpoint older than the occurrence day', dayStart + 60_000, dayStart - minutes(600) * 60_000, dayStart + 60_000, 'within_window'],
    ['a window whose start would exceed server now', dayStart + minutes(30) * 60_000, serverNow + minutes(60) * 60_000, serverNow, 'clamped_to_server_now'],
    ['a claim exactly at the window start', dayStart, null, dayStart, 'within_window'],
    ['a claim exactly at server now', serverNow, null, serverNow, 'within_window'],
  ];

  for (const [label, performedAt, lastAckedSyncAt, expectedInstant, outcome] of cases) {
    it(`should resolve ${label} as ${outcome}`, () => {
      const clamped = clampPerformedAt({ performedAt, serverNow, lastAckedSyncAt, occurrenceDate, timeZone: NEW_YORK });
      expect(clamped.instant).toBe(expectedInstant);
      expect(clamped.outcome).toBe(outcome);
    });
  }

  it('should report the local fields and elapsed days of the clamped instant', () => {
    const laterDay = startOfLocalDay(date('2024-06-12'), NEW_YORK) + minutes(7, 15) * 60_000;
    const clamped = clampPerformedAt({ performedAt: laterDay, serverNow: laterDay, lastAckedSyncAt: null, occurrenceDate, timeZone: NEW_YORK });
    expect(formatLocalDate(clamped.date)).toBe('2024-06-12');
    expect(clamped.minuteOfDay).toBe(minutes(7, 15));
    expect(clamped.daysElapsed).toBe(2);
  });

  it('should anchor the window to the account timezone, not to UTC', () => {
    const berlinStart = startOfLocalDay(occurrenceDate, BERLIN);
    const clamped = clampPerformedAt({ performedAt: berlinStart - 60_000, serverNow, lastAckedSyncAt: null, occurrenceDate, timeZone: BERLIN });
    expect(clamped.instant).toBe(berlinStart);
    expect(clamped.outcome).toBe('clamped_to_window_start');
  });

  it('should never return an instant outside the window', () => {
    const claims = [dayStart - 86_400_000, dayStart, serverNow, serverNow + 86_400_000, 0];
    for (const performedAt of claims) {
      const clamped = clampPerformedAt({ performedAt, serverNow, lastAckedSyncAt: null, occurrenceDate, timeZone: NEW_YORK });
      expect(clamped.instant).toBeGreaterThanOrEqual(dayStart);
      expect(clamped.instant).toBeLessThanOrEqual(serverNow);
    }
  });
});
