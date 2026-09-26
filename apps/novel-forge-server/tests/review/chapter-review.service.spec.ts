import { describe, expect, it } from 'bun:test';

import { PRODUCTION_DEFAULTS } from '@modules/ai/defaults';
import { hashReviewedBody } from '@modules/review/review-findings';
import { schema } from '@server/database';

import { CHAPTER_BODY, type RecordedWrite, render, reviewDraft, reviewHarness } from './review-fixtures';

const CONTRADICTION = {
  verdict: 'contradiction',
  findings: [{ severity: 'hard', text: 'The harbour keeps ten lanterns in canon, but "There were ten last night" treats nine as normal.' }],
  readabilityCompliance: { compliant: true, issues: [] },
};
const TWO_CONTRADICTIONS = {
  ...CONTRADICTION,
  findings: [...CONTRADICTION.findings, { severity: 'hard', text: 'The harbour master cannot be at the customs door; he drowned in chapter 2.' }],
};
const LOCKED_FACT = {
  id: 31n,
  factKey: 'lamp_heir',
  text: 'Mara is the lamp-keeper’s heir.',
  revealChapter: 9,
  unlock: null,
  source: 'manual',
  terms: ['heir'],
  allowedClues: ['the lamp warms to her touch'],
  constraintNote: null,
  writerNote: null,
};

const statusOf = (write: RecordedWrite | undefined): unknown => (write?.values as { reviewStatus?: unknown } | undefined)?.reviewStatus;
const lifts = (writes: RecordedWrite[]) => writes.filter(write => statusOf(write) === 'needs_review');
const holds = (writes: RecordedWrite[]) => writes.filter(write => statusOf(write) !== undefined && statusOf(write) !== 'needs_review');

describe('ChapterReviewService.run', () => {
  it('should store the review against the draft revision and text it read', async () => {
    const run = reviewHarness();

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(run.writesTo(schema.chapterReviews, 'insert')[0]?.values).toMatchObject({
      projectId: 1n,
      chapter: 4,
      kind: 'judge',
      draftRevision: 2,
      bodyHash: hashReviewedBody(CHAPTER_BODY),
      isolated: false,
      disposition: 'clear',
      runId: 'run-1',
      costTier: 'balanced',
      contentMode: 'standard',
    });
    expect(review).toMatchObject({ disposition: 'clear', draftRevision: 2, stale: false, openFindings: 0 });
    expect(review.checked).toContain('continuity with the Story Bible');
  });

  it('should record the model the run actually called over the route it would resolve now', async () => {
    const run = reviewHarness({ recordedCall: { provider: 'openrouter', model: 'fallback/model', tier: 'economy', contentMode: 'standard' } });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(review).toMatchObject({ model: 'fallback/model', modelProvider: 'openrouter', costTier: 'economy' });
  });

  it('should hand the author the findings and the run id, never the prompt the judge read', async () => {
    const run = reviewHarness({ judgeAnswer: { verdict: 'consistent', findings: [{ severity: 'soft', text: 'The quay is unnamed.' }] } });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(JSON.stringify(review, (_, value) => (typeof value === 'bigint' ? String(value) : value))).not.toContain('CANON: the harbour keeps ten lanterns.');
    expect(review).not.toHaveProperty('bodyHash');
    expect(review.findings[0]).not.toHaveProperty('fingerprint');
  });

  it('should never write prose, whatever the verdict', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });

    await run.service.run(1n, 4, { kind: 'judge' });

    const draftWrites = run.writesTo(schema.drafts, 'update');
    expect(draftWrites.length).toBeGreaterThan(0);
    for (const write of draftWrites) expect(Object.keys(write.values as object)).not.toContainEqual(expect.stringMatching(/^(body|title|summary|state)$/));
  });

  it('should hold the chapter on an open blocking finding and revoke the reveals its approval carried', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(review).toMatchObject({ disposition: 'blocking', verdict: 'contradiction', openBlocking: 1 });
    const [verdict, held] = run.writesTo(schema.drafts, 'update');
    expect(verdict?.values).toMatchObject({ judge: 'contradiction' });
    const where = render(verdict?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."status" <> $3 and "drafts"."review_status" <> $4)');
    expect(where.params).toEqual([11n, 2, 'final', 'generating']);
    expect(render((held?.values as { reviewStatus: never }).reviewStatus).sql).toContain("'contradiction'::draft_review_status");
    expect(run.writesTo(schema.drafts, 'lock').length).toBe(1);
    expect(run.writesTo(schema.characterKnowledge, 'delete').length).toBe(1);
  });

  it('should leave an approval in place on a clean verdict and only lift a contradiction', async () => {
    const run = reviewHarness({ draft: reviewDraft({ reviewStatus: 'approved' }) });

    await run.service.run(1n, 4, { kind: 'judge' });

    const updates = run.writesTo(schema.drafts, 'update');
    expect(holds(updates)).toEqual([]);
    expect(render(lifts(updates)[0]?.where).sql).toContain('"drafts"."review_status" = $5');
    expect(render(lifts(updates)[0]?.where).params[4]).toBe('contradiction');
    expect(run.writesTo(schema.characterKnowledge)).toEqual([]);
  });

  it('should keep the review but leave the draft alone when the draft moved during the call', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION, draftMoved: true });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(review.disposition).toBe('blocking');
    expect(run.writesTo(schema.characterKnowledge)).toEqual([]);
  });

  it('should review a final chapter without touching its draft', async () => {
    const run = reviewHarness({ draft: reviewDraft({ status: 'final', revision: 5 }), judgeAnswer: CONTRADICTION });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(review).toMatchObject({ draftRevision: 5, disposition: 'blocking' });
    expect(run.writesTo(schema.drafts)).toEqual([]);
  });

  it('should review finalized prose that has no draft by its text alone', async () => {
    const run = reviewHarness({ draft: null, finalChapter: { content: CHAPTER_BODY, isolated: false } });

    const review = await run.service.run(1n, 4, { kind: 'readability' });

    expect(review).toMatchObject({ draftRevision: null, stale: false });
    expect(run.modelCalls).toEqual([]);
  });

  it('should refuse a chapter with no prose', async () => {
    const run = reviewHarness({ draft: null });

    await expect(run.service.run(1n, 4, { kind: 'mechanics' })).rejects.toMatchObject({ code: 'REV_006' });
  });

  it('should refuse a draft that is still being generated, before any model call', async () => {
    const run = reviewHarness({ draft: reviewDraft({ reviewStatus: 'generating' }) });

    await expect(run.service.run(1n, 4, { kind: 'judge' })).rejects.toMatchObject({ code: 'REV_007' });
    await expect(run.service.start(1n, 4, { kind: 'judge' })).rejects.toMatchObject({ code: 'REV_007' });
    expect(run.modelCalls).toEqual([]);
    expect(run.enqueued).toEqual([]);
  });

  it('should run mechanics and readability without a model call or a model route', async () => {
    const run = reviewHarness();

    const mechanics = await run.service.run(1n, 4, { kind: 'mechanics', costTier: 'performant' });
    const readability = await run.service.run(1n, 4, { kind: 'readability' });

    expect(run.modelCalls).toEqual([]);
    expect(mechanics).toMatchObject({ runId: null, model: null, costTier: null });
    expect(mechanics.findings.some(finding => finding.text.includes('words'))).toBe(true);
    expect(readability.findings[0]?.text).toContain('too short to measure');
  });

  it('should mark every kind of review of an isolated or unrestricted chapter as isolated', async () => {
    const isolated = reviewHarness({ draft: reviewDraft({ isolated: true }) });
    const unrestrictedPlan = reviewHarness({ brief: { chapter: 4, body: 'plan', contentMode: 'unrestricted' } });

    const mechanics = await isolated.service.run(1n, 4, { kind: 'mechanics' });
    const readability = await unrestrictedPlan.service.run(1n, 4, { kind: 'readability' });

    expect(mechanics.isolated).toBe(true);
    expect(readability.isolated).toBe(true);
  });

  it('should give the judge the plan and the ending contract and keep its compliance', async () => {
    const brief = { chapter: 4, body: 'Mara notices a lantern is missing.', pov: 'Mara', endingContract: null, contentMode: null };
    const run = reviewHarness({
      brief,
      judgeAnswer: {
        verdict: 'consistent',
        findings: [],
        briefCompliance: { compliant: false, issues: ['the missing lantern is never searched for'] },
        readabilityCompliance: { compliant: true, issues: [] },
      },
    });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(run.modelCalls[0]?.prompt).toContain('## BRIEF\nMara notices a lantern is missing.\n\nPOV: Mara');
    expect(review.briefCompliance).toEqual({ compliant: false, issues: ['the missing lantern is never searched for'] });
    expect(review.findings).toEqual([expect.objectContaining({ category: 'brief', severity: 'warning', remedy: null })]);
    expect(review.disposition).toBe('issues');
  });

  it('should give the judge the facts still locked from the reader at this chapter, with their allowed clues', async () => {
    const run = reviewHarness({ facts: [LOCKED_FACT] });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(run.modelCalls[0]?.prompt).toContain('### Locked from the reader');
    expect(run.modelCalls[0]?.prompt).toContain(
      '- [lamp_heir] Mara is the lamp-keeper’s heir.\n  Allowed clues (may be shown without the explanation): the lamp warms to her touch',
    );
    expect(run.modelCalls[0]?.prompt).not.toContain('### Hidden from the point-of-view cast');
    expect(review.checked).toContain('1 secret kept from the reader');
    expect(review.findings).toContainEqual(expect.objectContaining({ severity: 'note', text: expect.stringContaining('Secret-keeping beyond give-away words was not assessed') }));
  });

  it('should review an isolated chapter on the unrestricted route', async () => {
    const run = reviewHarness({ draft: reviewDraft({ isolated: true }) });

    const review = await run.service.run(1n, 4, { kind: 'editorial' });

    expect(run.policyBaselines).toEqual(['unrestricted']);
    expect(run.modelCalls[0]).toMatchObject({ role: 'review', contentMode: 'unrestricted' });
    expect(review.contentMode).toBe('unrestricted');
  });

  it('should refuse an isolated chapter whose unrestricted route resolves off the allowlist, without calling the model or storing a review', async () => {
    const run = reviewHarness({ draft: reviewDraft({ isolated: true }), unrestrictedModel: PRODUCTION_DEFAULTS.judge });

    await expect(run.service.run(1n, 4, { kind: 'judge' })).rejects.toMatchObject({ code: 'AI_003' });
    expect(run.modelCalls).toEqual([]);
    expect(run.reviews).toEqual([]);
  });

  it('should judge and review from the pack as it is when the writer’s required material is over its limits', async () => {
    const run = reviewHarness({ overCaps: true });

    await run.service.run(1n, 4, { kind: 'judge' });
    await run.service.run(1n, 4, { kind: 'editorial' });

    expect(run.modelCalls.map(call => call.role)).toEqual(['judge', 'review']);
  });

  it('should raise a standard chapter to unrestricted on request but never lower one', async () => {
    const raised = reviewHarness();
    const unrestrictedPlan = reviewHarness({ brief: { chapter: 4, body: 'plan', contentMode: 'unrestricted' } });

    await raised.service.run(1n, 4, { kind: 'judge', contentMode: 'unrestricted' });
    await unrestrictedPlan.service.run(1n, 4, { kind: 'judge', contentMode: 'standard' });

    expect(raised.modelCalls[0]?.contentMode).toBe('unrestricted');
    expect(unrestrictedPlan.modelCalls[0]?.contentMode).toBe('unrestricted');
  });

  it('should run the model calls at the requested cost tier and record it', async () => {
    const run = reviewHarness();

    const review = await run.service.run(1n, 4, { kind: 'judge', costTier: 'economy' });

    expect(run.modelCalls[0]?.costTier).toBe('economy');
    expect(review.costTier).toBe('economy');
  });

  it('should record a judge answer it cannot read as failed, not as clear', async () => {
    const run = reviewHarness({ judgeAnswer: 'I think the chapter is fine.' });

    const review = await run.service.run(1n, 4, { kind: 'judge' });

    expect(review).toMatchObject({ disposition: 'failed', verdict: 'evaluation_failed', checked: [] });
    expect(run.modelCalls.length).toBe(2);
  });
});

describe('ChapterReviewService.start', () => {
  it('should queue a model review as a job and hand back its job and run', async () => {
    const run = reviewHarness();

    const started = await run.service.start(1n, 4, { kind: 'judge', costTier: 'performant' });

    expect(started).toEqual({ queued: true, job: { jobId: 'job-1', runId: 'run-queued', kind: 'judge', status: 'pending' } });
    expect(run.enqueued).toEqual([[1n, 'review', 'chapter-4-judge', { chapter: 4, kind: 'judge', contentMode: undefined, costTier: 'performant' }]]);
    expect(run.modelCalls).toEqual([]);
  });

  it('should report the status of the job an enqueue deduplicated onto', async () => {
    const run = reviewHarness({ jobStatus: 'in_progress' });

    const started = await run.service.start(1n, 4, { kind: 'editorial' });

    expect(started).toMatchObject({ queued: true, job: { status: 'in_progress' } });
  });

  it('should refuse an off-allowlist unrestricted route before queuing anything', async () => {
    const run = reviewHarness({ draft: reviewDraft({ isolated: true }), unrestrictedModel: PRODUCTION_DEFAULTS.judge });

    await expect(run.service.start(1n, 4, { kind: 'judge' })).rejects.toMatchObject({ code: 'AI_003' });
    expect(run.enqueued).toEqual([]);
  });

  it('should answer a deterministic review at once', async () => {
    const run = reviewHarness();

    const started = await run.service.start(1n, 4, { kind: 'readability' });

    expect(started.queued).toBe(false);
    expect(run.enqueued).toEqual([]);
  });
});

describe('ChapterReviewService review job', () => {
  const job = (attempts: number) => ({ id: 'job-1', projectId: 1n, kind: 'review', attempts, payload: { chapter: 4, kind: 'judge' } });

  it('should settle a retried job as done without a second review when its earlier attempt already stored one', async () => {
    const run = reviewHarness({ priorRun: { id: 'run-1' } });
    await run.service.run(1n, 4, { kind: 'judge' });

    await run.runRegisteredJob(job(1));

    expect(run.reviews.length).toBe(1);
    expect(run.modelCalls.length).toBe(1);
    expect(run.settledRuns).toEqual([['job-1', 'completed']]);
  });

  it('should review on a retry whose earlier attempt stored nothing', async () => {
    const run = reviewHarness({ priorRun: { id: 'run-0' } });

    await run.runRegisteredJob(job(1));

    expect(run.reviews.length).toBe(1);
  });

  it('should review on a first attempt without looking for an earlier one', async () => {
    const run = reviewHarness({ priorRun: { id: 'run-1' } });
    await run.service.run(1n, 4, { kind: 'judge' });

    await run.runRegisteredJob(job(0));

    expect(run.reviews.length).toBe(2);
  });
});

describe('ChapterReviewService staleness', () => {
  it('should mark a review stale once the chapter moves past the revision it read', async () => {
    const run = reviewHarness();
    await run.service.run(1n, 4, { kind: 'mechanics' });

    run.editDraft(3);
    const listed = await run.service.list(1n, 4);

    expect(listed.currentRevision).toBe(3);
    expect(listed.latest).toEqual([expect.objectContaining({ kind: 'mechanics', draftRevision: 2, stale: true })]);
  });

  it('should list the newest review of each kind and the whole history', async () => {
    const run = reviewHarness();
    await run.service.run(1n, 4, { kind: 'readability' });
    await run.service.run(1n, 4, { kind: 'mechanics' });
    await run.service.run(1n, 4, { kind: 'readability' });

    const listed = await run.service.list(1n, 4);

    expect(listed.latest.map(review => review.kind)).toEqual(['mechanics', 'readability']);
    expect(listed.latest[1]?.id).toBe(run.reviews[0]?.id as bigint);
    expect(listed.history.length).toBe(3);
  });
});

describe('ChapterReviewService.remedy', () => {
  it('should remember a dismissal and not raise the finding again on the same revision', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });
    const first = await run.service.run(1n, 4, { kind: 'judge' });

    const dismissed = await run.service.remedy(1n, 4, first.id, 'f1', { action: 'dismissed', reason: 'The tenth lantern was sold in chapter 2.' });
    const again = await run.service.run(1n, 4, { kind: 'judge' });

    expect(dismissed.findings[0]?.remedy).toMatchObject({ action: 'dismissed', reason: 'The tenth lantern was sold in chapter 2.' });
    expect(run.modelCalls[1]?.prompt).toContain('## ALREADY SETTLED BY THE AUTHOR');
    expect(run.modelCalls[1]?.prompt).toContain('(the author: The tenth lantern was sold in chapter 2.)');
    expect(again.findings[0]?.remedy).toMatchObject({ action: 'dismissed' });
    expect(again).toMatchObject({ openFindings: 0, openBlocking: 0 });
    expect(run.writesTo(schema.characterKnowledge, 'delete').length).toBe(1);
  });

  it('should lift the contradiction only once every blocking finding is overridden', async () => {
    const run = reviewHarness({ judgeAnswer: TWO_CONTRADICTIONS });
    const review = await run.service.run(1n, 4, { kind: 'judge' });

    await run.service.remedy(1n, 4, review.id, 'f1', { action: 'overridden', reason: 'Intended.' });
    const afterFirst = lifts(run.writesTo(schema.drafts, 'update')).length;
    await run.service.remedy(1n, 4, review.id, 'f2', { action: 'overridden', reason: 'He survived.' });

    expect(afterFirst).toBe(0);
    const [lift] = lifts(run.writesTo(schema.drafts, 'update'));
    expect(render(lift?.where).params).toEqual([11n, 2, 'final', 'generating', 'contradiction']);
    expect(run.writesTo(schema.drafts, 'lock').length).toBe(3);
  });

  it('should gate on the latest judge review only, so an answer to an older one changes nothing', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });
    const older = await run.service.run(1n, 4, { kind: 'judge' });
    await run.service.run(1n, 4, { kind: 'judge' });
    const before = run.writesTo(schema.drafts, 'update').length;

    await run.service.remedy(1n, 4, older.id, 'f1', { action: 'overridden', reason: 'Intended.' });

    expect(run.writesTo(schema.drafts, 'update').length).toBe(before);
  });

  it('should keep the contradiction while the author only plans to fix it', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });
    const review = await run.service.run(1n, 4, { kind: 'judge' });

    const answered = await run.service.remedy(1n, 4, review.id, 'f1', { action: 'fixing_myself' });

    expect(answered).toMatchObject({ openBlocking: 1 });
    expect(answered.findings[0]?.remedy?.action).toBe('fixing_myself');
    expect(lifts(run.writesTo(schema.drafts, 'update'))).toEqual([]);
  });

  it('should lift a contradiction whose remaining open findings are only warnings', async () => {
    const run = reviewHarness({
      draft: reviewDraft({ reviewStatus: 'contradiction' }),
      judgeAnswer: { ...CONTRADICTION, verdict: 'consistent', findings: [{ severity: 'soft', text: 'The quay is unnamed.' }] },
    });

    await run.service.run(1n, 4, { kind: 'judge' });

    expect(lifts(run.writesTo(schema.drafts, 'update')).length).toBe(1);
    expect(holds(run.writesTo(schema.drafts, 'update'))).toEqual([]);
  });

  it.each([
    ['a dismissal without a reason', { action: 'dismissed' as const, reason: '  ' }, 'REV_004'],
    ['an override of a finding that does not block', { action: 'overridden' as const }, 'REV_005'],
  ])('should refuse %s', async (_, request, code) => {
    const run = reviewHarness({ judgeAnswer: { ...CONTRADICTION, findings: [{ severity: 'soft', text: 'The quay is described twice.' }], verdict: 'consistent' } });
    const review = await run.service.run(1n, 4, { kind: 'judge' });

    await expect(run.service.remedy(1n, 4, review.id, 'f1', request)).rejects.toMatchObject({ code });
  });

  it('should refuse to answer a finding about text that has since changed', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });
    const review = await run.service.run(1n, 4, { kind: 'judge' });

    run.editDraft(3);

    await expect(run.service.remedy(1n, 4, review.id, 'f1', { action: 'dismissed', reason: 'fine' })).rejects.toMatchObject({ code: 'REV_003' });
  });

  it('should refuse a finding the review does not have', async () => {
    const run = reviewHarness();
    const review = await run.service.run(1n, 4, { kind: 'mechanics' });

    await expect(run.service.remedy(1n, 4, review.id, 'f99', { action: 'fixing_myself' })).rejects.toMatchObject({ code: 'REV_002' });
  });
});

describe('ChapterReviewService.clearRemedy', () => {
  it('should reopen the finding, hold the chapter again and stop the answer carrying to the next run', async () => {
    const run = reviewHarness({ judgeAnswer: CONTRADICTION });
    const review = await run.service.run(1n, 4, { kind: 'judge' });
    await run.service.remedy(1n, 4, review.id, 'f1', { action: 'overridden', reason: 'Intended.' });
    const heldBefore = holds(run.writesTo(schema.drafts, 'update')).length;

    const cleared = await run.service.clearRemedy(1n, 4, review.id, 'f1');
    const again = await run.service.run(1n, 4, { kind: 'judge' });

    expect(cleared).toMatchObject({ openBlocking: 1 });
    expect(cleared.findings[0]?.remedy).toBeNull();
    expect(holds(run.writesTo(schema.drafts, 'update')).length).toBeGreaterThan(heldBefore);
    expect(run.modelCalls[1]?.prompt).not.toContain('## ALREADY SETTLED BY THE AUTHOR');
    expect(again.findings[0]?.remedy).toBeNull();
  });
});
