import { describe, expect, it } from 'bun:test';

import { computeDormantThreads, DORMANT_THREAD_THRESHOLD_CHAPTERS, renderDormantThreads } from '@modules/ai/context/dormant-threads';
import { type Story } from '@server/database';

function thread(overrides: Partial<Story.PlotThread> = {}): Story.PlotThread {
  return {
    id: 1n,
    projectId: 1n,
    threadKey: 'the-ledger',
    status: 'open',
    openedChapter: 1,
    closedChapter: null,
    summary: 'Who has the ledger.',
    owner: null,
    payoff: null,
    lastAdvancedChapter: null,
    payoffWindow: null,
    intentionallyOpen: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Story.PlotThread;
}

function mystery(overrides: Partial<Story.Mystery> = {}): Story.Mystery {
  return {
    id: 1n,
    projectId: 1n,
    mysteryKey: 'who-took-it',
    question: 'Who took the ledger?',
    status: 'open',
    openedChapter: 1,
    resolvedChapter: null,
    knownTo: null,
    truthFactKey: null,
    lastAdvancedChapter: null,
    payoffWindow: null,
    intentionallyOpen: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Story.Mystery;
}

describe('computeDormantThreads', () => {
  it('should not flag a thread advanced recently', () => {
    const entries = computeDormantThreads([thread({ lastAdvancedChapter: 10 })], [], 12);
    expect(entries).toEqual([]);
  });

  it('should flag a thread not advanced past the dormancy threshold', () => {
    const currentChapter = 1 + DORMANT_THREAD_THRESHOLD_CHAPTERS + 1;
    const entries = computeDormantThreads([thread({ lastAdvancedChapter: 1 })], [], currentChapter);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'thread', key: 'the-ledger', reason: 'dormant' });
  });

  it('should fall back to openedChapter when lastAdvancedChapter was never set', () => {
    const currentChapter = 1 + DORMANT_THREAD_THRESHOLD_CHAPTERS + 1;
    const entries = computeDormantThreads([thread({ openedChapter: 1, lastAdvancedChapter: null })], [], currentChapter);
    expect(entries).toHaveLength(1);
  });

  it('should never flag an intentionally open thread regardless of staleness', () => {
    const entries = computeDormantThreads([thread({ lastAdvancedChapter: 1, intentionallyOpen: true })], [], 100);
    expect(entries).toEqual([]);
  });

  it('should never flag a closed thread', () => {
    const entries = computeDormantThreads([thread({ status: 'closed', lastAdvancedChapter: 1 })], [], 100);
    expect(entries).toEqual([]);
  });

  it('should flag a thread past its payoffWindow as overdue even if recently advanced', () => {
    const entries = computeDormantThreads([thread({ lastAdvancedChapter: 9, payoffWindow: 5 })], [], 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ reason: 'overdue', payoffWindow: 5 });
  });

  it('should apply the same rules to mysteries', () => {
    const currentChapter = 1 + DORMANT_THREAD_THRESHOLD_CHAPTERS + 1;
    const entries = computeDormantThreads([], [mystery({ lastAdvancedChapter: 1 })], currentChapter);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'mystery', key: 'who-took-it', reason: 'dormant' });
  });

  it('should return an empty list for no input', () => {
    expect(computeDormantThreads([], [], 50)).toEqual([]);
  });
});

describe('renderDormantThreads', () => {
  it('should render an empty string for no entries', () => {
    expect(renderDormantThreads([])).toBe('');
  });

  it('should render dormant and overdue entries distinctly', () => {
    const text = renderDormantThreads([
      { kind: 'thread', key: 'the-ledger', label: 'Who has the ledger.', reason: 'dormant', lastAdvancedChapter: 1, payoffWindow: null },
      { kind: 'mystery', key: 'who-took-it', label: 'Who took the ledger?', reason: 'overdue', lastAdvancedChapter: 9, payoffWindow: 5 },
    ]);
    expect(text).toContain('Thread **the-ledger** — DORMANT');
    expect(text).toContain('Mystery **who-took-it** — OVERDUE');
    expect(text).toContain('payoff window (ch 5)');
  });
});
