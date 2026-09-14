import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_CATEGORIES,
  type CaptureContext,
  type CaptureDraft,
  type CaptureKind,
  type CaptureParse,
  type CaptureTarget,
  lbToKg,
  parseCapture,
  type WeightEntry,
} from '@/lib/data';

const DATE = '2026-08-22';

function target(questId: string, questName: string): CaptureTarget {
  return { occurrenceId: `${questId}:${DATE}`, questId, questName, statAffinity: 'mind' };
}

const context: CaptureContext = {
  date: DATE,
  money: { homeCurrency: 'EUR', currencies: ['EUR'], categories: BUILT_IN_CATEGORIES },
  weight: { status: 'known', today: null },
  occurrences: [target('read-pages', 'Read 20 pages'), target('morning-run', 'Morning run — 5 km')],
};

function draftOf(parse: CaptureParse): CaptureDraft {
  if (parse.status !== 'draft') throw new TypeError(`expected a draft, got ${parse.status}`);
  return parse.draft;
}

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
    expect(draftOf(parseCapture(text, context)).kind).toBe(kind);
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
    expect(parseCapture('done meditate', context)).toEqual({ status: 'unrecognised', problem: { kind: 'no-quest' } });
  });

  it('should match done commands by quest name', () => {
    const lines = ['done Read 20 pages', 'completed read 20 pages', 'done read', 'complete Morning run — 5 km', 'done morning run'];
    const occurrenceIds = lines.map(line => draftOf(parseCapture(line, context)).action);
    expect(occurrenceIds).toEqual([
      { domain: 'quest', command: { type: 'quest.complete', occurrenceId: `read-pages:${DATE}` } },
      { domain: 'quest', command: { type: 'quest.complete', occurrenceId: `read-pages:${DATE}` } },
      { domain: 'quest', command: { type: 'quest.complete', occurrenceId: `read-pages:${DATE}` } },
      { domain: 'quest', command: { type: 'quest.complete', occurrenceId: `morning-run:${DATE}` } },
      { domain: 'quest', command: { type: 'quest.complete', occurrenceId: `morning-run:${DATE}` } },
    ]);
  });

  it('should keep numbers that belong to the quest name', () => {
    const long = target('quest-35', 'Quest number 35 with a moderately long name to wrap');
    const five = target('quest-5', 'Quest number 5');

    expect(draftOf(parseCapture('done quest number 5', { ...context, occurrences: [long, five] })).fields[0]?.value).toBe('Quest number 5');

    const onlyLong = parseCapture('quest 5', { ...context, occurrences: [long] });
    const kinds = onlyLong.status === 'ambiguous' ? onlyLong.candidates.map(candidate => candidate.kind) : [draftOf(onlyLong).kind];
    expect(kinds).not.toContain('quest-action');
    expect(parseCapture('done quest 5', { ...context, occurrences: [long] })).toEqual({ status: 'unrecognised', problem: { kind: 'no-quest' } });
  });

  it('should offer a quest whose name has no number when a word and a number match it', () => {
    const stretch = target('evening-stretch', 'Evening stretch');
    const parse = parseCapture('stretch 10', { ...context, occurrences: [stretch] });

    expect(parse.status).toBe('ambiguous');
    if (parse.status === 'ambiguous')
      expect(parse.candidates.map(candidate => candidate.action.command)).toContainEqual({ type: 'quest.complete', occurrenceId: stretch.occurrenceId });
    expect(draftOf(parseCapture('stretch 10 minutes', { ...context, occurrences: [stretch] })).kind).toBe('expense');
  });

  it('should read a typed prefix before any number in the line', () => {
    expect(draftOf(parseCapture('sq walked 8000 steps', context)).kind).toBe('side-quest');
    expect(draftOf(parseCapture('j 78 kg and feeling heavy', context)).kind).toBe('journal');
  });

  it('should create the same expense the entry form creates, in the guessed category', () => {
    const draft = draftOf(parseCapture('coffee 3.50', context));
    expect(draft.action).toEqual({
      domain: 'finance',
      command: { type: 'expense.create', draft: { amountText: '3.50', currency: 'EUR', categoryId: 'food', occurredOnDate: DATE, note: 'coffee' } },
    });
    expect(draft.fields.find(field => field.label === 'Category')).toEqual({ label: 'Category', value: 'Food', guessed: true });
  });

  it('should not claim a category when the note matches none', () => {
    const draft = draftOf(parseCapture('bike lock 12', context));
    expect(draft.fields.find(field => field.label === 'Category')).toEqual({ label: 'Category', value: 'Uncategorised' });
    expect(draft.action.command).toMatchObject({ draft: { categoryId: 'uncat' } });
  });

  it('should not guess an archived category', () => {
    const categories = BUILT_IN_CATEGORIES.map(category => (category.id === 'food' ? { ...category, archived: true } : category));
    const draft = draftOf(parseCapture('coffee 3.50', { ...context, money: { homeCurrency: 'EUR', currencies: ['EUR'], categories } }));
    expect(draft.action.command).toMatchObject({ draft: { categoryId: 'uncat' } });
    expect(draft.fields.find(field => field.label === 'Category')?.value).toBe('Uncategorised');
  });

  it('should record an amount in the account’s home currency', () => {
    const draft = draftOf(parseCapture('ramen 1200', { ...context, money: { homeCurrency: 'JPY', currencies: ['JPY'], categories: BUILT_IN_CATEGORIES } }));
    expect(draft.action.command).toMatchObject({ type: 'expense.create', draft: { amountText: '1200', currency: 'JPY' } });
    expect(draft.fields[0]?.value).toBe('¥1,200');
  });

  it('should read a typed currency symbol as one of the account’s own currencies', () => {
    const withDollars = { ...context, money: { homeCurrency: 'EUR' as const, currencies: ['EUR' as const, 'USD' as const], categories: BUILT_IN_CATEGORIES } };
    expect(draftOf(parseCapture('$5 lunch', withDollars)).action.command).toMatchObject({ draft: { amountText: '5', currency: 'USD', note: 'lunch' } });
    const canadian = { ...context, money: { homeCurrency: 'CAD' as const, currencies: ['CAD' as const], categories: BUILT_IN_CATEGORIES } };
    expect(draftOf(parseCapture('$5 lunch', canadian)).action.command).toMatchObject({ draft: { currency: 'CAD' } });
  });

  it('should refuse a currency symbol the account does not use rather than guess one', () => {
    expect(parseCapture('$5 lunch', context)).toEqual({ status: 'unrecognised', problem: { kind: 'currency-not-enabled', symbol: '$', homeCurrency: 'EUR' } });
  });

  it('should not read an amount until the account’s Money settings are known', () => {
    expect(parseCapture('coffee 3.50', { ...context, money: null })).toEqual({ status: 'unrecognised', problem: { kind: 'money-unavailable' } });
  });

  it('should dispatch a complete command when a quest name matches', () => {
    expect(draftOf(parseCapture('done read', context)).action).toEqual({ domain: 'quest', command: { type: 'quest.complete', occurrenceId: `read-pages:${DATE}` } });
  });

  describe('amount selection', () => {
    const expenses: [string, string, string][] = [
      ['coffee 3.50', '3.50', 'coffee'],
      ['€4.20 lunch', '4.20', 'lunch'],
      ['e2e coffee 1787599032026 3.50', '3.50', 'e2e coffee 1787599032026'],
      ['2e5 experiment 12.00', '12.00', '2e5 experiment'],
      ['transfer DE89370400440532013000 25.00', '25.00', 'transfer DE89370400440532013000'],
      ['coffee 3.50 tip 1.00', '3.50', 'coffee tip 1.00'],
      ['lunch 12 with mark', '12', 'lunch with mark'],
      ['taxi 18 €', '18', 'taxi'],
    ];

    it.each(expenses)('should read %s as %s with the note kept intact', (text, amountText, note) => {
      expect(draftOf(parseCapture(text, context)).action.command).toMatchObject({ type: 'expense.create', draft: { amountText, currency: 'EUR', note } });
    });

    it('should never read a millisecond timestamp as an amount', () => {
      expect(draftOf(parseCapture('e2e coffee 1787599032026', context)).kind).toBe('journal');
    });
  });

  it('should convert a weight in pounds to kilograms and keep the unit in the preview', () => {
    const draft = draftOf(parseCapture('172.5 lb', context));
    expect(draft.action).toEqual({ domain: 'quick-log', command: { type: 'weight.save', date: DATE, kg: lbToKg(172.5), confirmedReplacement: false } });
    expect(draft.fields[0]?.value).toBe('172.5 lb');
  });

  it('should warn about an earlier weight only when one exists', () => {
    expect(draftOf(parseCapture('78.4 kg', context)).warning).toBeNull();

    const earlier: WeightEntry = { id: 'w1', date: DATE, kg: 79.1, loggedAt: `${DATE}T07:00:00Z`, rewarded: true };
    const draft = draftOf(parseCapture('78.4 kg', { ...context, weight: { status: 'known', today: earlier } }));
    expect(draft.warning).toContain('Today already has 79.1 kg');
    expect(draft.action.command).toMatchObject({ type: 'weight.save', kg: 78.4, confirmedReplacement: true });
  });

  it('should wait for today’s weight before offering to save one', () => {
    expect(parseCapture('78.4 kg', { ...context, weight: { status: 'loading' } })).toEqual({ status: 'waiting', on: 'weight' });
  });

  it('should not read an implausible weight or sleep as an entry', () => {
    expect(parseCapture('1440 kg', context)).toEqual({ status: 'unrecognised', problem: { kind: 'weight-out-of-range' } });
    expect(parseCapture('slept 99', context)).toEqual({ status: 'unrecognised', problem: { kind: 'sleep-out-of-range' } });
  });

  it('should save metrics in their storage units against the capture date', () => {
    expect(draftOf(parseCapture('1.4 l', context)).action).toEqual({ domain: 'quick-log', command: { type: 'health.save', key: 'water', date: DATE, value: 1400 } });
    expect(draftOf(parseCapture('8k steps', context)).action.command).toMatchObject({ key: 'steps', value: 8000 });
  });

  it('should log a side quest against the day it was captured', () => {
    expect(draftOf(parseCapture('sq fixed the bike light', context)).action).toEqual({
      domain: 'quick-log',
      command: { type: 'sidequest.log', draft: { date: DATE, name: 'fixed the bike light', statAffinity: 'discipline' } },
    });
  });
});
