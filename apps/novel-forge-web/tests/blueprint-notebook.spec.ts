import { describe, expect, it } from 'bun:test';

import { groupEntriesByPhase, isWithdrawable, LEDGER_STATUS_LABELS, ledgerTopicLabel, newLedgerEntryIds, notebookCounts } from '../src/features/blueprint/notebook';
import { type LedgerEntryResponse } from '../src/lib/apis';

function entry(id: string, overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id,
    projectId: 'p1',
    kind: 'decision',
    phase: 'idea',
    topic: 'premise',
    statement: `statement ${id}`,
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: null,
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('notebookCounts', () => {
  it('should count a system detail as a decision', () => {
    const counts = notebookCounts([
      entry('a'),
      entry('b', { kind: 'system' }),
      entry('c', { kind: 'direction' }),
      entry('d', { kind: 'rejected' }),
      entry('e', { kind: 'backlog' }),
    ]);

    expect(counts).toEqual({ decided: 2, directions: 1, rejected: 1, backlog: 1, total: 5 });
  });

  it('should count nothing for an empty ledger', () => {
    expect(notebookCounts([])).toEqual({ decided: 0, directions: 0, rejected: 0, backlog: 0, total: 0 });
  });
});

describe('groupEntriesByPhase', () => {
  it('should lead with the phase holding the newest entry and keep each group newest first', () => {
    const groups = groupEntriesByPhase([
      entry('old', { phase: 'idea', createdAt: '2026-01-01T00:00:00.000Z' }),
      entry('newest', { phase: 'heart', createdAt: '2026-01-03T00:00:00.000Z' }),
      entry('middle', { phase: 'idea', createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(groups.map(group => group.label)).toEqual(['Heart', 'Idea']);
    expect(groups[1]?.entries.map(item => item.id)).toEqual(['middle', 'old']);
  });

  it('should collect entries with no phase under one heading', () => {
    const groups = groupEntriesByPhase([entry('gate', { phase: null, kind: 'system', topic: 'gate' })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Across the novel');
  });

  it('should return no groups for an empty ledger', () => {
    expect(groupEntriesByPhase([])).toEqual([]);
  });
});

describe('newLedgerEntryIds', () => {
  it('should mark nothing new on the first look, when everything is already history', () => {
    expect(newLedgerEntryIds([entry('a'), entry('b')], null)).toEqual([]);
  });

  it('should mark only the entries that arrived since the last look', () => {
    expect(newLedgerEntryIds([entry('a'), entry('b')], new Set(['a']))).toEqual(['b']);
  });

  it('should mark nothing when the ledger has not moved', () => {
    expect(newLedgerEntryIds([entry('a')], new Set(['a']))).toEqual([]);
  });
});

describe('isWithdrawable', () => {
  it('should let the author retire what they wrote themselves', () => {
    expect(isWithdrawable(entry('a', { kind: 'direction' }))).toBe(true);
    expect(isWithdrawable(entry('b', { kind: 'rejected' }))).toBe(true);
    expect(isWithdrawable(entry('c', { kind: 'backlog' }))).toBe(true);
  });

  it('should refuse a decision or a system detail, which are changed by revisiting their step', () => {
    expect(isWithdrawable(entry('a', { kind: 'decision' }))).toBe(false);
    expect(isWithdrawable(entry('b', { kind: 'system' }))).toBe(false);
  });

  it('should refuse an entry that is already retired', () => {
    expect(isWithdrawable(entry('a', { kind: 'direction', status: 'withdrawn' }))).toBe(false);
  });
});

describe('ledgerTopicLabel', () => {
  it('should name the topics the author meets most', () => {
    expect(ledgerTopicLabel('promise')).toBe('Reader promise');
    expect(ledgerTopicLabel('start')).toBe('Starting point');
  });

  it('should turn an unnamed key into words rather than show the slug', () => {
    expect(ledgerTopicLabel('world.rules')).toBe('World rules');
    expect(ledgerTopicLabel('check.pacing-1')).toBe('Check pacing 1');
  });
});

describe('LEDGER_STATUS_LABELS', () => {
  it('should say what a retired entry is in words, not in the enum', () => {
    expect(LEDGER_STATUS_LABELS.superseded).toBe('Replaced');
    expect(LEDGER_STATUS_LABELS.withdrawn).toBe('Withdrawn');
  });
});
