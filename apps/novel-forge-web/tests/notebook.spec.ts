import { describe, expect, it } from 'bun:test';

import { groupEntriesByKind, isWithdrawable, LEDGER_STATUS_LABELS, ledgerTopicLabel, newLedgerEntryIds, notebookCounts } from '../src/features/notebook/notebook';
import { type LedgerEntryResponse } from '../src/lib/apis';

function entry(id: string, overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id,
    projectId: 'p1',
    kind: 'decision',
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
    ideaId: null,
    rejectionScope: null,
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

describe('groupEntriesByKind', () => {
  it('should order the groups decisions, directions, not this, later, system notes', () => {
    const groups = groupEntriesByKind([
      entry('backlog-1', { kind: 'backlog' }),
      entry('rejected-1', { kind: 'rejected' }),
      entry('system-1', { kind: 'system' }),
      entry('direction-1', { kind: 'direction' }),
      entry('decision-1', { kind: 'decision' }),
    ]);

    expect(groups.map(group => group.label)).toEqual(['Decisions', 'Directions', 'Not this', 'Later', 'System notes']);
  });

  it('should keep each group newest first', () => {
    const groups = groupEntriesByKind([
      entry('old', { kind: 'decision', createdAt: '2026-01-01T00:00:00.000Z' }),
      entry('newest', { kind: 'decision', createdAt: '2026-01-03T00:00:00.000Z' }),
      entry('middle', { kind: 'decision', createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(groups[0]?.entries.map(item => item.id)).toEqual(['newest', 'middle', 'old']);
  });

  it('should skip a kind with no entries', () => {
    const groups = groupEntriesByKind([entry('a', { kind: 'system' })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('System notes');
  });

  it('should return no groups for an empty ledger', () => {
    expect(groupEntriesByKind([])).toEqual([]);
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
    expect(ledgerTopicLabel('start.brief')).toBe('Your starting text');
  });

  it('should turn an unnamed key into words rather than show the slug', () => {
    expect(ledgerTopicLabel('world.rules')).toBe('World rules');
    expect(ledgerTopicLabel('check.pacing-1')).toBe('Check pacing 1');
  });

  it('should name the organise sub-topics', () => {
    expect(ledgerTopicLabel('organise.ruled_out')).toBe('Suggestions you turned down');
    expect(ledgerTopicLabel('organise')).toBe('Your notes, organised');
  });
});

describe('LEDGER_STATUS_LABELS', () => {
  it('should say what a retired entry is in words, not in the enum', () => {
    expect(LEDGER_STATUS_LABELS.superseded).toBe('Replaced');
    expect(LEDGER_STATUS_LABELS.withdrawn).toBe('Withdrawn');
  });
});
