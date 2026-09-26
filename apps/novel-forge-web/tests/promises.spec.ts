import { describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PromisesTable, ThreadsList } from '../src/features/story-bible/ThreadsView';
import { type PromiseItemResponse } from '../src/lib/apis/api-types.gen';
import { lastMoved, payoffLabels, type PayoffLookup, promiseGroupKey, promiseGroups, quietestPromise, statusChips } from '../src/lib/promises';

function promise(key: string, overrides: Partial<PromiseItemResponse> = {}): PromiseItemResponse {
  return { kind: 'thread', key, label: key, status: 'open', intentionallyOpen: false, due: 'not_due', ...overrides };
}

const lookup: PayoffLookup = {
  milestones: new Map([['reads_rook_line', { milestoneKey: 'reads_rook_line', label: 'She reads the Rook line to the council', state: 'open' }]]),
  volumes: new Map([['v2', { volumeKey: 'v2', ordinal: 2, title: 'The payment', state: 'not_started' }]]),
};

const items = [
  promise('quiet'),
  promise('paid', { status: 'closed', closedChapter: 9 }),
  promise('late', { due: 'overdue' }),
  promise('waiting', { intentionallyOpen: true }),
  promise('gone', { status: 'dropped' }),
  promise('now', { due: 'due', kind: 'mystery', status: 'open' }),
  promise('solved', { kind: 'mystery', status: 'resolved', resolvedChapter: 12 }),
];

describe('promiseGroups', () => {
  it('should put overdue first, then due, then open, dormant, paid off and dropped', () => {
    expect(promiseGroups(items).map(group => [group.key, group.items.map(item => item.key)])).toEqual([
      ['overdue', ['late']],
      ['due', ['now']],
      ['open', ['quiet']],
      ['dormant', ['waiting']],
      ['paid', ['paid', 'solved']],
      ['dropped', ['gone']],
    ]);
  });

  it('should rank due above dormant, and a settled promise by its status alone', () => {
    expect(promiseGroupKey(promise('x', { intentionallyOpen: true, due: 'overdue' }))).toBe('overdue');
    expect(promiseGroupKey(promise('x', { status: 'dropped', due: 'overdue' }))).toBe('dropped');
    expect(promiseGroups([])).toEqual([]);
  });
});

describe('payoffLabels', () => {
  it('should name every target, and read none as someday', () => {
    expect(payoffLabels(promise('x', { payoffMilestoneKey: 'reads_rook_line', payoffVolumeKey: 'v2', payoffWindow: 40 }), lookup)).toEqual([
      'Milestone: She reads the Rook line to the council',
      'Volume 2 · The payment',
      'By ch 40',
    ]);
    expect(payoffLabels(promise('x', { payoffMilestoneKey: 'gone', payoffVolumeKey: 'v9' }), lookup)).toEqual(['Milestone: gone', 'Volume v9']);
    expect(payoffLabels(promise('x'), lookup)).toEqual(['Someday']);
  });
});

describe('statusChips', () => {
  it('should mark dormant, due, overdue, paid off and dropped apart', () => {
    expect(statusChips(promise('x')).map(chip => chip.text)).toEqual(['Open']);
    expect(statusChips(promise('x', { intentionallyOpen: true })).map(chip => chip.text)).toEqual(['Dormant on purpose']);
    expect(statusChips(promise('x', { due: 'overdue' }))).toEqual([
      { text: 'Open', intent: 'accent' },
      { text: 'Overdue', intent: 'danger' },
    ]);
    expect(statusChips(promise('x', { due: 'due' })).map(chip => chip.text)).toEqual(['Open', 'Due']);
    expect(statusChips(promise('x', { status: 'resolved', resolvedChapter: 12 })).map(chip => chip.text)).toEqual(['Paid off ch 12']);
    expect(statusChips(promise('x', { status: 'closed' })).map(chip => chip.text)).toEqual(['Paid off']);
    expect(statusChips(promise('x', { status: 'dropped' })).map(chip => chip.text)).toEqual(['Dropped']);
  });
});

describe('quietestPromise', () => {
  it('should pick the open promise quiet longest, counted as the server’s dormant report counts it', () => {
    const quiet = [promise('a', { openedChapter: 1 }), promise('b', { openedChapter: 1, lastAdvancedChapter: 5 }), promise('c', { openedChapter: 2, intentionallyOpen: true })];
    expect(quietestPromise(quiet, 9)).toMatchObject({ item: { key: 'a' }, since: 1, chapters: 7 });
    expect(quietestPromise(quiet, 8)).toBeUndefined();
    expect(quietestPromise([promise('d', { openedChapter: 1, status: 'dropped' })], 30)).toBeUndefined();
    expect(quietestPromise(quiet, undefined)).toBeUndefined();
    expect(lastMoved(promise('e'))).toBeUndefined();
  });
});

describe('promises markup', () => {
  it('should order the table overdue first and show payoff and status chips', () => {
    const html = renderToStaticMarkup(createElement(PromisesTable, { items, lookup }));
    expect(html.indexOf('late')).toBeLessThan(html.indexOf('now'));
    expect(html.indexOf('now')).toBeLessThan(html.indexOf('quiet'));
    expect(html).toContain('Someday');
    expect(html).toContain('Dormant on purpose');
    expect(html).toContain('Dropped');
  });

  it('should show loading, error and empty states in the list', () => {
    const render = (element: ReturnType<typeof createElement>): string => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));
    expect(render(createElement(ThreadsList, { promises: { status: 'loading' } }))).toContain('Loading promises');
    expect(render(createElement(ThreadsList, { promises: { status: 'error', message: 'x', onRetry: () => undefined } }))).toContain('Couldn’t load promises');
    expect(render(createElement(ThreadsList, { promises: { status: 'ready', items: [], total: 0 } }))).toContain('No promises yet');
    expect(render(createElement(ThreadsList, { promises: { status: 'ready', items, total: items.length } }))).toContain('Overdue · 1');
  });
});
