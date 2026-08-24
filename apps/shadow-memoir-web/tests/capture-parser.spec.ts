import { describe, expect, it } from 'vitest';

import { type CaptureContext, type CaptureKind, parseCapture } from '@/lib/data';

const context: CaptureContext = {
  date: '2026-08-22',
  currency: 'EUR',
  occurrences: [
    { occurrenceId: 'read-pages:2026-08-22', questId: 'read-pages', questName: 'Read 20 pages', statAffinity: 'mind' },
    { occurrenceId: 'morning-run:2026-08-22', questId: 'morning-run', questName: 'Morning run — 5 km', statAffinity: 'body' },
  ],
};

describe('parseCapture', () => {
  const cases: [string, CaptureKind][] = [
    ['coffee 3.50', 'expense'],
    ['€4.20 lunch', 'expense'],
    ['8000 steps', 'metric'],
    ['1.4 l', 'metric'],
    ['slept 7.5', 'metric'],
    ['620 kcal', 'metric'],
    ['78.4 kg', 'weight'],
    ['weight 78.4 kg', 'weight'],
    ['j had a good morning', 'journal'],
    ['sq fixed the bike light', 'side-quest'],
    ['done read', 'quest-action'],
    ['Read 20 pages', 'quest-action'],
    ['thinking about the week ahead', 'journal'],
  ];

  it.each(cases)('should read %s as a %s draft', (text, kind) => {
    const parse = parseCapture(text, context);
    expect(parse.status).toBe('draft');
    if (parse.status === 'draft') expect(parse.draft.kind).toBe(kind);
  });

  it('should stay idle on an empty line', () => {
    expect(parseCapture('   ', context).status).toBe('idle');
  });

  it('should offer both readings when a word and a number match a quest', () => {
    const parse = parseCapture('read 20', context);
    expect(parse.status).toBe('ambiguous');
    if (parse.status === 'ambiguous') expect(parse.candidates.map(candidate => candidate.kind)).toEqual(['quest-action', 'side-quest']);
  });

  it('should not guess a quest that is not scheduled today', () => {
    expect(parseCapture('done meditate', context).status).toBe('unrecognised');
  });

  it('should dispatch an expense command with the amount in minor units', () => {
    const parse = parseCapture('coffee 3.50', context);
    expect(parse.status).toBe('draft');
    if (parse.status !== 'draft') return;
    expect(parse.draft.command).toEqual({ type: 'expense.record', amountMinor: 350, currency: 'EUR', note: 'coffee' });
  });

  it('should guess a food category from the note and say that it guessed', () => {
    const parse = parseCapture('coffee 3.50', context);
    if (parse.status !== 'draft') throw new Error('expected a draft');
    const category = parse.draft.fields.find(field => field.label === 'Category');
    expect(category?.value).toBe('Food');
    expect(category?.guessed).toBe(true);
  });

  it('should dispatch a complete command when a quest name matches', () => {
    const parse = parseCapture('done read', context);
    if (parse.status !== 'draft') throw new Error('expected a draft');
    expect(parse.draft.command).toEqual({ type: 'quest.complete', occurrenceId: 'read-pages:2026-08-22' });
  });

  describe('amount selection', () => {
    const expenses: [string, number, string][] = [
      ['coffee 3.50', 350, 'coffee'],
      ['€4.20 lunch', 420, 'lunch'],
      ['e2e coffee 1787599032026 3.50', 350, 'e2e coffee 1787599032026'],
      ['2e5 experiment 12.00', 1200, '2e5 experiment'],
      ['transfer DE89370400440532013000 25.00', 2500, 'transfer DE89370400440532013000'],
      ['coffee 3.50 tip 1.00', 350, 'coffee tip 1.00'],
      ['lunch 12 with mark', 1200, 'lunch with mark'],
      ['taxi 18 €', 1800, 'taxi'],
    ];

    it.each(expenses)('should read %s as %d minor units with the note kept intact', (text, amountMinor, note) => {
      const parse = parseCapture(text, context);
      expect(parse.status).toBe('draft');
      if (parse.status !== 'draft') return;
      expect(parse.draft.command).toEqual({ type: 'expense.record', amountMinor, currency: 'EUR', note });
    });

    it('should never read a millisecond timestamp as an amount', () => {
      const parse = parseCapture('e2e coffee 1787599032026', context);
      if (parse.status !== 'draft') throw new Error('expected a draft');
      expect(parse.draft.kind).toBe('journal');
    });
  });

  it('should keep the weight unit the owner typed', () => {
    const parse = parseCapture('172.5 lb', context);
    if (parse.status !== 'draft') throw new Error('expected a draft');
    expect(parse.draft.command).toEqual({ type: 'weight.record', value: 172.5, unit: 'lb' });
  });
});
