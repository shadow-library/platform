import { describe, expect, it } from 'vitest';

import { convertMlToLitres, formatCount, formatEnum, formatLocalDate, formatLocalTime, formatRelativeDay, timeZoneOptions } from '@/lib/format';

import { withTimeZone } from './setup';

describe('formatLocalTime', () => {
  it('should format a UTC timestamp in the owner’s time zone', () =>
    withTimeZone('Europe/Oslo', () => {
      expect(formatLocalTime('2026-09-13T09:12:00.000Z')).toBe('11:12');
      expect(formatLocalTime('2026-09-13T23:00:00.000Z')).toBe('01:00');
    }));

  it('should render 24-hour, not 12-hour, regardless of locale', () => withTimeZone('Europe/Oslo', () => expect(formatLocalTime('2026-09-13T00:41:00.000Z')).toBe('02:41')));

  it('should return an empty string for a null, undefined or invalid value', () =>
    withTimeZone('Europe/Oslo', () => {
      expect(formatLocalTime(null)).toBe('');
      expect(formatLocalTime(undefined)).toBe('');
      expect(formatLocalTime('not a date')).toBe('');
    }));
});

describe('formatLocalDate', () => {
  it('should read day, short month, year by default', () =>
    withTimeZone('Europe/Oslo', () => {
      expect(formatLocalDate('2026-05-17T09:00:00.000Z')).toBe('17 May 2026');
      expect(formatLocalDate('2026-09-07T09:00:00.000Z')).toBe('7 Sep 2026');
    }));

  it('should not parse a YYYY-MM-DD date as UTC midnight and shift it a day', () => withTimeZone('Europe/Oslo', () => expect(formatLocalDate('2026-05-17')).toBe('17 May 2026')));

  it('should convert a UTC instant to the day it falls on locally, even across midnight', () =>
    withTimeZone('Europe/Oslo', () => expect(formatLocalDate('2026-09-13T23:30:00.000Z')).toBe('14 Sep 2026')));

  it('should support a long month with no year', () =>
    withTimeZone('Europe/Oslo', () => expect(formatLocalDate('2026-09-07T22:41:00.000Z', { month: 'long', year: false })).toBe('8 September')));

  it('should return an empty string for a null, undefined or invalid value', () =>
    withTimeZone('Europe/Oslo', () => {
      expect(formatLocalDate(null)).toBe('');
      expect(formatLocalDate(undefined)).toBe('');
      expect(formatLocalDate('not a date')).toBe('');
    }));
});

describe('formatRelativeDay', () => {
  it('should say Today and Yesterday next to the day key, and fall back to the formatted date otherwise', () => {
    expect(formatRelativeDay('2026-09-13', '2026-09-13')).toBe('Today');
    expect(formatRelativeDay('2026-09-12', '2026-09-13')).toBe('Yesterday');
    expect(formatRelativeDay('2026-09-01', '2026-09-13')).toBe('1 Sep 2026');
  });
});

describe('convertMlToLitres', () => {
  it('should convert water from millilitres to litres', () => {
    expect(convertMlToLitres(1400)).toBe(1.4);
    expect(convertMlToLitres(0)).toBe(0);
  });
});

describe('formatCount', () => {
  it('should pluralise counts', () => {
    expect(formatCount(1, 'meal', 'meals')).toBe('1 meal');
    expect(formatCount(0, 'meal', 'meals')).toBe('0 meals');
    expect(formatCount(4, 'meal', 'meals')).toBe('4 meals');
  });
});

describe('formatEnum', () => {
  it('should use the mapped label when one exists', () => {
    expect(formatEnum('active', { active: 'Active', lapsed: 'Lapsed' })).toBe('Active');
  });

  it('should de-slug and title-case an unmapped value', () => {
    expect(formatEnum('blobs_deleted')).toBe('Blobs Deleted');
  });
});

describe('timeZoneOptions', () => {
  it('should always include the browser zone and a given saved zone', () =>
    withTimeZone('Europe/Oslo', () => {
      const options = timeZoneOptions('Pacific/Auckland');
      expect(options.some(option => option.value === 'Europe/Oslo')).toBe(true);
      expect(options.some(option => option.value === 'Pacific/Auckland')).toBe(true);
    }));
});
