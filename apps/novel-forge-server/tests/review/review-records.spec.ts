import { describe, expect, it } from 'bun:test';

import { hashReviewedBody, settleFindings } from '@modules/review/review-findings';
import { APPROVAL_OVERRIDE_REASON, recordGenerationJudge } from '@modules/review/review-records';
import { schema } from '@server/database';

import { draftRow, fakeGenerationDb, knowledgeFixture, makeGenerationService } from '../generation/generation-fixtures';

const BODY = 'The keeper counts the ships.';
const PASS = {
  verdict: 'contradiction',
  findings: [
    { severity: 'hard' as const, text: 'The keeper is blind in canon, yet counts by sight.' },
    { severity: 'soft' as const, text: 'brief: the ships never arrive' },
  ],
};

function recordingDb(options: { body?: string; existing?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    query: {
      drafts: { findFirst: async () => ({ revision: 6, body: options.body ?? BODY, isolated: false }) },
      chapterReviews: { findFirst: async () => (options.existing ? { id: 1n } : undefined) },
      modelCalls: { findFirst: async () => ({ provider: 'openrouter', model: 'judge/model', tier: 'balanced', contentMode: 'standard' }) },
    },
    insert: () => ({ values: async (values: Record<string, unknown>) => void inserts.push(values) }),
  };
  return { db, inserts };
}

const RECORD = { projectId: 1n, chapter: 4, draftId: 11n, runId: 'run-9', body: BODY, pass: PASS };

describe('recordGenerationJudge', () => {
  it('should store the run’s terminal judge pass as a review of the revision it produced', async () => {
    const { db, inserts } = recordingDb();

    await recordGenerationJudge(db as never, RECORD);

    expect(inserts).toEqual([
      expect.objectContaining({
        chapter: 4,
        kind: 'judge',
        draftRevision: 6,
        bodyHash: hashReviewedBody(BODY),
        runId: 'run-9',
        verdict: 'contradiction',
        disposition: 'blocking',
        model: 'judge/model',
        isolated: false,
      }),
    ]);
    expect((inserts[0]?.['findings'] as { category: string }[]).map(finding => finding.category)).toEqual(['continuity', 'brief']);
  });

  it('should store nothing when the draft no longer holds the prose that pass judged', async () => {
    const { db, inserts } = recordingDb({ body: 'Someone edited it.' });

    await recordGenerationJudge(db as never, RECORD);

    expect(inserts).toEqual([]);
  });

  it('should store nothing twice when a replayed run finishes again', async () => {
    const { db, inserts } = recordingDb({ existing: true });

    await recordGenerationJudge(db as never, RECORD);

    expect(inserts).toEqual([]);
  });
});

describe('GenerationService.approveDraft over open review findings', () => {
  const latest = (remedies: object[] = []) => {
    const findings = settleFindings('judge', BODY, [
      { severity: 'blocking', category: 'continuity', text: 'The keeper is blind in canon.' },
      { severity: 'warning', category: 'brief', text: 'The ships never arrive.' },
      { severity: 'blocking', category: 'knowledge', text: 'Gives away [lamp_heir].' },
    ]);
    return { id: 70n, kind: 'judge', draftRevision: 2, bodyHash: hashReviewedBody(BODY), findings, remedies };
  };
  const approve = async (review: unknown) => {
    const fake = fakeGenerationDb({
      draftReads: [draftRow({ body: BODY })],
      draftWriteResult: [draftRow({ body: BODY })],
      knowledge: knowledgeFixture(),
      latestJudgeReview: review,
    });
    const approved = await makeGenerationService(fake.db).approveDraft(1n, 4, { revision: 2 });
    return { approved, remedies: fake.writesTo(schema.chapterReviewRemedies) };
  };

  it('should record each open blocking finding as overridden by the approval and say how many', async () => {
    const { approved, remedies } = await approve(latest([{ findingId: 'f3', action: 'dismissed' }]));

    expect(approved.overriddenFindings).toBe(1);
    expect(remedies).toEqual([
      expect.objectContaining({ kind: 'upsert', values: [expect.objectContaining({ reviewId: 70n, findingId: 'f1', action: 'overridden', reason: APPROVAL_OVERRIDE_REASON })] }),
    ]);
  });

  it('should override nothing when the review read other text or there is none', async () => {
    const stale = await approve({ ...latest(), bodyHash: hashReviewedBody('older text') });
    const none = await approve(undefined);

    expect([stale.approved.overriddenFindings, none.approved.overriddenFindings]).toEqual([0, 0]);
    expect([...stale.remedies, ...none.remedies]).toEqual([]);
  });
});
