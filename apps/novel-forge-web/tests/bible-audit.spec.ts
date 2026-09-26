import { describe, expect, it } from 'bun:test';

import { type BibleAuditFindingResponse, type BibleAuditReportResponse, type GenerationJobItem, type ListBibleAuditsResponse } from '../src/lib/apis/api-types.gen';
import {
  auditDecisionLabel,
  auditGroupLabel,
  auditKeptFindingsCount,
  auditOpenCount,
  auditOpKept,
  auditPollState,
  auditProposalIntent,
  auditProposalLabel,
  auditReadOnly,
  auditRestageable,
  auditStageLabel,
  clearKey,
  findAdoptableAuditJob,
  findAuditJob,
  findAuditReport,
  findAuditReportByProposal,
  findingDecidable,
  findingDecisionValue,
  groupAuditFindings,
  humanizeAuditRef,
} from '../src/lib/bible-audit';

function finding(overrides: Partial<BibleAuditFindingResponse> & Pick<BibleAuditFindingResponse, 'id' | 'group'>): BibleAuditFindingResponse {
  return { ref: 'entity:hollis_vane', text: 'His age contradicts chapter 2.', evidence: [], opIndexes: [0], ...overrides };
}

function report(overrides: Partial<BibleAuditReportResponse> = {}): BibleAuditReportResponse {
  return {
    id: 'r1',
    summary: 'Nothing found.',
    checked: {
      passes: { coverage: 'ran', contradictions: 'ran' },
      documents: { count: 1, sections: [], clipped: 0, omitted: 0 },
      entities: { count: 1, byType: {}, omitted: 0 },
      facts: { count: 0, omitted: 0 },
      chaptersWithoutSummary: [],
      chaptersIsolated: [],
      chaptersOmitted: 0,
      copy: 'Checked: 1 page, 1 character.',
    },
    findings: [],
    openFindings: 0,
    selection: [],
    runId: 'run-1',
    createdAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

function job(overrides: Partial<GenerationJobItem> & Pick<GenerationJobItem, 'id' | 'status'>): GenerationJobItem {
  return {
    projectId: 'p1',
    kind: 'audit',
    target: 'bible-audit',
    attempts: 1,
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
    usage: { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, estimatedCostUsd: 0, byCostSource: [] },
    ...overrides,
  };
}

describe('groupAuditFindings', () => {
  it('should order groups contradictions, add, revise, remove and drop empty groups', () => {
    const findings = [
      finding({ id: 'a1', group: 'add' }),
      finding({ id: 'c1', group: 'contradiction' }),
      finding({ id: 'r1', group: 'revise' }),
      finding({ id: 'c2', group: 'contradiction' }),
    ];
    expect(groupAuditFindings(findings).map(group => [group.group, group.findings.map(f => f.id)])).toEqual([
      ['contradiction', ['c1', 'c2']],
      ['add', ['a1']],
      ['revise', ['r1']],
    ]);
  });

  it('should return nothing for an empty report', () => {
    expect(groupAuditFindings([])).toEqual([]);
  });
});

describe('auditGroupLabel', () => {
  it('should label every group', () => {
    expect(auditGroupLabel('contradiction')).toBe('Contradictions');
    expect(auditGroupLabel('add')).toBe('Add');
    expect(auditGroupLabel('revise')).toBe('Revise');
    expect(auditGroupLabel('remove')).toBe('Remove');
  });
});

describe('findingDecidable', () => {
  it('should be decidable only when the card carries ops for it', () => {
    expect(findingDecidable({ opIndexes: [0, 1] })).toBe(true);
    expect(findingDecidable({ opIndexes: [] })).toBe(false);
  });
});

describe('findingDecisionValue', () => {
  it('should read an undecided finding as kept, since the report counts it in', () => {
    expect(findingDecisionValue({ decision: null })).toBe('kept');
    expect(findingDecisionValue({ decision: undefined })).toBe('kept');
  });

  it('should read the author’s own decision', () => {
    expect(findingDecisionValue({ decision: { decision: 'skipped', updatedAt: '2026-09-26T10:00:00.000Z' } })).toBe('skipped');
  });
});

describe('auditDecisionLabel', () => {
  it('should label both decisions', () => {
    expect(auditDecisionLabel('kept')).toBe('Kept');
    expect(auditDecisionLabel('skipped')).toBe('Skipped');
  });
});

describe('auditOpenCount', () => {
  it('should exclude flagged-only findings (no ops) from the open count', () => {
    const findings = [
      finding({ id: 'a1', group: 'add', opIndexes: [0] }),
      finding({ id: 'c1', group: 'contradiction', opIndexes: [] }),
      finding({ id: 'r1', group: 'revise', opIndexes: [1], decision: { decision: 'kept', updatedAt: '2026-09-26T10:00:00.000Z' } }),
    ];
    expect(auditOpenCount({ findings })).toBe(1);
  });
});

describe('auditKeptFindingsCount', () => {
  it('should count decidable findings still kept, not the ops they carry', () => {
    const findings = [
      finding({ id: 'a1', group: 'add', opIndexes: [0, 1] }),
      finding({ id: 'r1', group: 'revise', opIndexes: [2], decision: { decision: 'skipped', updatedAt: '2026-09-26T10:00:00.000Z' } }),
      finding({ id: 'c1', group: 'contradiction', opIndexes: [] }),
    ];
    expect(auditKeptFindingsCount({ findings })).toBe(1);
  });
});

describe('auditStageLabel', () => {
  it('should count findings, not ops, and open the Review Queue rather than applying', () => {
    expect(auditStageLabel(0)).toBe('Review 0 kept findings');
    expect(auditStageLabel(1)).toBe('Review 1 kept finding');
    expect(auditStageLabel(3)).toBe('Review 3 kept findings');
  });
});

describe('auditProposalLabel / auditProposalIntent', () => {
  it('should label and colour every proposal status', () => {
    expect(auditProposalLabel('pending')).toBe('Pending');
    expect(auditProposalIntent('pending')).toBe('info');
    expect(auditProposalLabel('applied')).toBe('Applied');
    expect(auditProposalIntent('applied')).toBe('success');
    expect(auditProposalIntent('conflicted')).toBe('danger');
  });
});

describe('auditReadOnly', () => {
  it('should stay editable with no proposal, or a pending one', () => {
    expect(auditReadOnly({ proposalId: null, proposalStatus: null })).toBe(false);
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'pending' })).toBe(false);
  });

  it('should be read-only only for the server’s settled statuses: applied, reverted, conflicted', () => {
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'applied' })).toBe(true);
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'reverted' })).toBe(true);
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'conflicted' })).toBe(true);
  });

  it('should stay editable for discarded and superseded — keeping a finding restages the card', () => {
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'discarded' })).toBe(false);
    expect(auditReadOnly({ proposalId: 'p1', proposalStatus: 'superseded' })).toBe(false);
  });
});

describe('auditRestageable', () => {
  it('should flag only discarded and superseded', () => {
    expect(auditRestageable({ proposalId: 'p1', proposalStatus: 'discarded' })).toBe(true);
    expect(auditRestageable({ proposalId: 'p1', proposalStatus: 'superseded' })).toBe(true);
    expect(auditRestageable({ proposalId: 'p1', proposalStatus: 'pending' })).toBe(false);
    expect(auditRestageable({ proposalId: 'p1', proposalStatus: 'applied' })).toBe(false);
  });
});

describe('auditOpKept', () => {
  it('should read an op as kept when its index is in the report’s selection', () => {
    expect(auditOpKept(report({ selection: [0, 2] }), 0)).toBe(true);
    expect(auditOpKept(report({ selection: [0, 2] }), 1)).toBe(false);
  });

  it('should read every op as kept while no report has loaded yet', () => {
    expect(auditOpKept(undefined, 5)).toBe(true);
  });
});

describe('clearKey', () => {
  it('should remove one key immutably', () => {
    const original = { a: 1, b: 2 };
    const next = clearKey(original, 'a');
    expect(next).toEqual({ b: 2 });
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it('should return the same reference when the key is absent, so callers can skip a pointless re-render', () => {
    const original = { a: 1 };
    expect(clearKey(original, 'missing')).toBe(original);
  });
});

describe('findAuditReportByProposal', () => {
  it('should match a report to the proposal card it staged', () => {
    const list: ListBibleAuditsResponse = { items: [report({ id: 'r1', proposalId: 'p1' }), report({ id: 'r2', proposalId: 'p2' })] };
    expect(findAuditReportByProposal(list, 'p2')?.id).toBe('r2');
    expect(findAuditReportByProposal(list, 'p9')).toBeUndefined();
    expect(findAuditReportByProposal(undefined, 'p1')).toBeUndefined();
  });
});

describe('humanizeAuditRef', () => {
  const names = new Map([['hollis_vane', 'Hollis Vane']]);
  const docTitles = new Map([['world/lantern-isles', 'The Lantern Isles']]);

  it('should resolve an entity ref to its name', () => {
    expect(humanizeAuditRef('entity:hollis_vane', names, docTitles)).toBe('Hollis Vane');
  });

  it('should resolve a doc ref to its title', () => {
    expect(humanizeAuditRef('doc:world/lantern-isles', names, docTitles)).toBe('The Lantern Isles');
  });

  it('should format a chapter ref by number', () => {
    expect(humanizeAuditRef('chapter:2', names, docTitles)).toBe('Chapter 2');
  });

  it('should fall back to the raw ref when nothing resolves it', () => {
    expect(humanizeAuditRef('entity:unknown_key', names, docTitles)).toBe('entity:unknown_key');
    expect(humanizeAuditRef('fact:some_secret', names, docTitles)).toBe('fact:some_secret');
    expect(humanizeAuditRef('not-addressed', names, docTitles)).toBe('not-addressed');
  });
});

describe('findAuditJob', () => {
  it('should find the audit job by id and ignore other kinds', () => {
    const jobs = [job({ id: 'j1', status: 'in_progress' }), { ...job({ id: 'j2', status: 'pending' }), kind: 'review' } as GenerationJobItem];
    expect(findAuditJob(jobs, 'j1')?.id).toBe('j1');
    expect(findAuditJob(jobs, 'j2')).toBeUndefined();
    expect(findAuditJob(undefined, 'j1')).toBeUndefined();
  });
});

describe('findAdoptableAuditJob', () => {
  it('should pick the newest active audit job and ignore other kinds and settled ones', () => {
    const jobs = [
      job({ id: 'old', status: 'in_progress', createdAt: '2026-09-26T09:00:00.000Z' }),
      job({ id: 'new', status: 'pending', createdAt: '2026-09-26T10:00:00.000Z' }),
      job({ id: 'done', status: 'done', createdAt: '2026-09-26T11:00:00.000Z' }),
      { ...job({ id: 'other-kind', status: 'in_progress' }), kind: 'review' } as GenerationJobItem,
    ];
    expect(findAdoptableAuditJob(jobs)?.id).toBe('new');
  });

  it('should find nothing when no audit job is active', () => {
    expect(findAdoptableAuditJob([job({ id: 'j1', status: 'done' })])).toBeUndefined();
    expect(findAdoptableAuditJob(undefined)).toBeUndefined();
  });
});

describe('findAuditReport', () => {
  it('should match a report to the run that produced it', () => {
    const list: ListBibleAuditsResponse = { items: [report()] };
    expect(findAuditReport(list, 'run-1')?.id).toBe('r1');
    expect(findAuditReport(list, 'run-2')).toBeUndefined();
    expect(findAuditReport(undefined, 'run-1')).toBeUndefined();
  });
});

describe('auditPollState', () => {
  it('should say nothing is running with no tracked audit', () => {
    expect(auditPollState(undefined, undefined, undefined)).toEqual({ running: false });
  });

  it('should be running while the job is pending or in progress, even before it appears in the job list', () => {
    expect(auditPollState(undefined, undefined, { jobId: 'j1', runId: 'run-1' })).toEqual({ running: true });
    expect(auditPollState([job({ id: 'j1', status: 'pending' })], undefined, { jobId: 'j1', runId: 'run-1' })).toEqual({ running: true });
    expect(auditPollState([job({ id: 'j1', status: 'in_progress' })], undefined, { jobId: 'j1', runId: 'run-1' })).toEqual({ running: true });
  });

  it('should keep running once the job is done but its report has not landed yet — never reading that gap as cancelled', () => {
    const state = auditPollState([job({ id: 'j1', status: 'done' })], undefined, { jobId: 'j1', runId: 'run-1' });
    expect(state).toEqual({ running: true });
  });

  it('should surface the report once it appears, by run id', () => {
    const list: ListBibleAuditsResponse = { items: [report({ runId: 'run-1' })] };
    const state = auditPollState([job({ id: 'j1', status: 'done' })], list, { jobId: 'j1', runId: 'run-1' });
    expect(state.running).toBe(false);
    expect(state.report?.runId).toBe('run-1');
  });

  it('should surface the newest report once it appears, for an adopted job with no known run id', () => {
    const list: ListBibleAuditsResponse = { items: [report({ id: 'newest', createdAt: '2026-09-26T10:05:00.000Z' })] };
    const state = auditPollState([job({ id: 'j1', status: 'done' })], list, { jobId: 'j1', runId: null, since: '2026-09-26T10:00:00.000Z' });
    expect(state.report?.id).toBe('newest');
  });

  it('should not adopt a report older than the tracked job’s start, for an adopted job', () => {
    const list: ListBibleAuditsResponse = { items: [report({ id: 'stale', createdAt: '2026-09-26T09:00:00.000Z' })] };
    const state = auditPollState([job({ id: 'j1', status: 'done' })], list, { jobId: 'j1', runId: null, since: '2026-09-26T10:00:00.000Z' });
    expect(state.report).toBeUndefined();
    expect(state.running).toBe(true);
  });

  it('should report failure only for failed or cancelled, never for done', () => {
    expect(auditPollState([job({ id: 'j1', status: 'failed', lastError: 'boom' })], undefined, { jobId: 'j1', runId: 'run-1' })).toEqual({ running: false, failure: 'boom' });
    expect(auditPollState([job({ id: 'j1', status: 'cancelled' })], undefined, { jobId: 'j1', runId: 'run-1' })).toEqual({
      running: false,
      failure: 'The bible audit was cancelled.',
    });
  });

  it('should give a fallback message for a failed job with no recorded error', () => {
    expect(auditPollState([job({ id: 'j1', status: 'failed' })], undefined, { jobId: 'j1', runId: 'run-1' }).failure).toBe('The bible audit stopped before it finished.');
  });
});
