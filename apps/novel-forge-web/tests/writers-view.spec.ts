import { describe, expect, it } from 'bun:test';

import { type WriterSnapshotSummaryResponse } from '../src/lib/apis';
import { attemptWhat, keptBackView, snapshotMeta, writingRuns } from '../src/lib/writers-view';

function snapshot(overrides: Partial<WriterSnapshotSummaryResponse>): WriterSnapshotSummaryResponse {
  return {
    id: 's1',
    chapter: 4,
    draftRevision: 0,
    attempt: 1,
    role: 'draft',
    promptKey: 'chapter-writer',
    promptVersion: '3',
    modelRoute: {},
    isolated: false,
    createdAt: '2026-09-25T14:00:00Z',
    ...overrides,
  };
}

describe('writingRuns', () => {
  it('should group a draft and its repair as one run, newest run first, attempts in order', () => {
    const runs = writingRuns([
      snapshot({ id: 'repair', attempt: 2, role: 'repair', createdAt: '2026-09-25T14:02:00Z' }),
      snapshot({ id: 'draft', attempt: 1 }),
      snapshot({ id: 'passage', draftRevision: 2, role: 'passage', createdAt: '2026-09-26T09:00:00Z' }),
    ]);
    expect(runs.map(run => [run.label, run.attempts.map(attempt => attempt.id)])).toEqual([
      ['Passage rewrite · version 2', ['passage']],
      ['First draft · version 0', ['draft', 'repair']],
    ]);
  });

  it('should keep separate passage rewrites of the same version apart', () => {
    const runs = writingRuns([
      snapshot({ id: 'a', draftRevision: 2, role: 'passage' }),
      snapshot({ id: 'b', draftRevision: 2, role: 'passage', createdAt: '2026-09-25T15:00:00Z' }),
    ]);
    expect(runs).toHaveLength(2);
  });
});

describe('attemptWhat', () => {
  it('should say a repaired first draft was repaired, and the repair became the chapter', () => {
    expect(attemptWhat({ role: 'draft', attempt: 1 }, 2)).toBe('First draft. A check found a problem, so it was repaired.');
    expect(attemptWhat({ role: 'repair', attempt: 2 }, 2)).toBe('The repair: the earlier attempt’s draft plus the check’s note — this became the chapter.');
    expect(attemptWhat({ role: 'draft', attempt: 1 }, 1)).toBe('First draft, written from the plan.');
  });
});

describe('keptBackView', () => {
  it('should list what secrecy withheld and what was cut for space', () => {
    expect(keptBackView({ withheldForSecrecy: { plan: 1, bible_page: 3, prose: 0 }, omittedForBudget: [{ key: 'fact:ledger', reason: 'budget', tokens: 120 }, 'junk'] })).toEqual({
      secrecy: ['1 passage withheld from the plan', '3 passages withheld from Story Bible pages'],
      budget: ['fact:ledger'],
    });
  });

  it('should read an absent or malformed record as nothing kept back', () => {
    expect(keptBackView(null)).toEqual({ secrecy: [], budget: [] });
    expect(keptBackView({ withheldForSecrecy: 'no', omittedForBudget: null })).toEqual({ secrecy: [], budget: [] });
  });
});

describe('snapshotMeta', () => {
  it('should say it is what was sent at writing time, not rebuilt', () => {
    expect(snapshotMeta({ attempt: 2, planRevision: 3, createdAt: 'when' }, 2, () => '25 Sep, 14:02')).toBe(
      'Stored at writing time · attempt 2 of 2 · plan version 3 · Story Bible as of 25 Sep, 14:02. Exactly what was sent — not rebuilt from today’s Story Bible.',
    );
  });
});
