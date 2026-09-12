import { describe, expect, it } from 'bun:test';

import { anySeedBeingNamed, firstTitle, isBeingNamed } from '../src/lib/idea-title';

describe('firstTitle', () => {
  it('should prefer the first non-blank candidate', () => {
    expect(firstTitle(['The Villain Who Won’t Fall', 'A working title', undefined], 'Untitled idea')).toBe('The Villain Who Won’t Fall');
  });

  it('should fall through blank and whitespace-only candidates', () => {
    expect(firstTitle([undefined, null, '   ', 'A working title'], 'Untitled idea')).toBe('A working title');
  });

  it('should trim the winning candidate', () => {
    expect(firstTitle(['  Padded title  '], 'Untitled idea')).toBe('Padded title');
  });

  it('should return the fallback when every candidate is blank', () => {
    expect(firstTitle([undefined, null, '  '], 'Untitled idea')).toBe('Untitled idea');
  });
});

describe('isBeingNamed', () => {
  const now = new Date('2026-01-01T00:10:00.000Z');

  it('should be true for a nameless seed with a spark, created moments ago', () => {
    expect(isBeingNamed({ name: null, sparkExcerpt: 'A villain gets a system.', createdAt: '2026-01-01T00:09:00.000Z' }, now)).toBe(true);
  });

  it('should be false once the seed has a name', () => {
    expect(isBeingNamed({ name: 'The Villain', sparkExcerpt: 'A villain gets a system.', createdAt: '2026-01-01T00:09:00.000Z' }, now)).toBe(false);
  });

  it('should be false without a spark excerpt to name from', () => {
    expect(isBeingNamed({ name: null, sparkExcerpt: null, createdAt: '2026-01-01T00:09:00.000Z' }, now)).toBe(false);
  });

  it('should be false once the 2-minute naming window has passed', () => {
    expect(isBeingNamed({ name: null, sparkExcerpt: 'A villain gets a system.', createdAt: '2026-01-01T00:07:59.000Z' }, now)).toBe(false);
  });
});

describe('anySeedBeingNamed', () => {
  const now = new Date('2026-01-01T00:10:00.000Z');

  it('should be true when at least one seed on the page is being named', () => {
    const seeds = [
      { name: 'Named already', sparkExcerpt: 'x', createdAt: '2026-01-01T00:09:00.000Z' },
      { name: null, sparkExcerpt: 'A fresh spark.', createdAt: '2026-01-01T00:09:30.000Z' },
    ];
    expect(anySeedBeingNamed(seeds, now)).toBe(true);
  });

  it('should be false when no seed on the page is being named', () => {
    const seeds = [{ name: 'Named already', sparkExcerpt: 'x', createdAt: '2026-01-01T00:09:00.000Z' }];
    expect(anySeedBeingNamed(seeds, now)).toBe(false);
  });
});
