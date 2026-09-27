/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import { errorCode, saveChapter, startNextChapter, writeChapterByHand } from './forge-helpers';
import { createGuardedProject, pollJobStatus } from './forge-story';

/**
 * Defining types
 */

interface ReviewFinding {
  readonly id: string;
  readonly severity: string;
  readonly remedy?: { action: string; reason: string | null } | null;
}

interface ChapterReview {
  readonly id: string;
  readonly kind: string;
  readonly disposition: string;
  readonly draftRevision: number | null;
  readonly stale: boolean;
  readonly openFindings: number;
  readonly openBlocking: number;
  readonly findings: ReviewFinding[];
}

/**
 * Declaring the constants
 *
 * Chapter reviews as the mechanics/readability checks and the judge gate see them: the deterministic kinds answer synchronously and for
 * free, the judge kind is a model job that fails under the fail-pin, and an open blocking judge finding holds the chapter as a
 * `contradiction` — which the author answers by dismissing, overriding or promising to fix it by hand — never by spending a model call.
 */

async function expectRefused(response: APIResponse, status: number, code: string, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
  expect(await errorCode(response), what).toBe(code);
}

function reviewsPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/chapters/${chapter}/reviews${suffix}`;
}

function remedyPath(projectId: string, chapter: number, reviewId: string, findingId: string): string {
  return `${reviewsPath(projectId, chapter)}/${reviewId}/findings/${findingId}/remedy`;
}

/** DB-inserts a `judge` review with hand-crafted findings, bound to the chapter's current draft text — the model call NF2-REV-01 never spends. */
async function insertJudgeReview(projectId: string, chapter: number, revision: number, body: string, findings: { id: string; severity: string }[]): Promise<string> {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const rows = findings.map(finding => ({
    id: finding.id,
    severity: finding.severity,
    category: 'continuity',
    text: `e2e finding ${finding.id}`,
    evidence: null,
    fingerprint: `e2e-${finding.id}`,
  }));
  const disposition = findings.some(finding => finding.severity === 'blocking') ? 'blocking' : findings.length > 0 ? 'issues' : 'clear';
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO chapter_reviews (project_id, chapter, draft_revision, body_hash, isolated, kind, disposition, findings, checked)
    VALUES (${projectId}, ${chapter}, ${revision}, ${bodyHash}, false, 'judge', ${disposition}, ${sql.json(rows as never)}, ${sql.json([] as never)})
    RETURNING id::text
  `;
  expect(row, 'the judge review row was inserted').toBeDefined();
  return row!.id;
}

test.describe('novel-forge deterministic reviews', () => {
  test('should refuse mechanics on an empty or a generating draft, then run it synchronously once the chapter has prose', async ({ forge }) => {
    const owner = await forge.actor({ label: 'review-mechanics' });
    const projectId = await createGuardedProject(forge, owner, 'review-mechanics');

    const empty = await startNextChapter(owner.ctx, projectId);
    expect(empty.body ?? '').toBe('');
    await expectRefused(await mutate(owner.ctx, 'post', reviewsPath(projectId, 1), { data: { kind: 'mechanics' } }), 400, 'REV_006', 'reviewing an empty draft');

    const written = await saveChapter(owner.ctx, projectId, empty, { title: 'Draft', body: 'The lamplighter counted the links twice before dawn broke over the quiet street.' });
    await novelForgeDb()`UPDATE drafts SET review_status = 'generating' WHERE id = ${written.id}`;
    await expectRefused(await mutate(owner.ctx, 'post', reviewsPath(projectId, 1), { data: { kind: 'mechanics' } }), 409, 'REV_007', 'reviewing a chapter still generating');

    await novelForgeDb()`UPDATE drafts SET review_status = 'needs_review' WHERE id = ${written.id}`;
    const run = await mutate(owner.ctx, 'post', reviewsPath(projectId, 1), { data: { kind: 'mechanics' } });
    expect(run.status(), await run.text()).toBe(201);
    const review = (await run.json()) as ChapterReview;
    expect(review).toMatchObject({ kind: 'mechanics', draftRevision: written.revision, stale: false });
    expect(['clear', 'issues', 'blocking']).toContain(review.disposition);

    const listed = (await (await owner.ctx.get(reviewsPath(projectId, 1))).json()) as { latest: ChapterReview[] };
    expect(listed.latest.map(item => item.kind)).toContain('mechanics');
  });

  test('should queue a judge review as a job that fails under the fail-pin with no model spend', async ({ forge }) => {
    const owner = await forge.actor({ label: 'review-judge-job' });
    const projectId = await createGuardedProject(forge, owner, 'review-judge-job');
    await writeChapterByHand(owner.ctx, projectId, {
      title: 'Draft',
      body: 'The lamplighter counted the links twice before dawn broke over the quiet street.',
    });

    await assertSpendGuarded(projectId);
    const queued = await mutate(owner.ctx, 'post', reviewsPath(projectId, 1), { data: { kind: 'judge' } });
    expect(queued.status(), await queued.text()).toBe(202);
    const job = (await queued.json()) as { jobId: string; runId: string; kind: string; status: string };
    expect(job).toMatchObject({ kind: 'judge' });

    const settled = await pollJobStatus(job.jobId);
    expect(settled.status).toBe('failed');
    expect(await listDispatchedModelCalls(projectId), 'the judge job never dispatched a real call').toEqual([]);
  });
});

test.describe('novel-forge judge gate and remedies', () => {
  test('should gate the chapter as a contradiction on an open blocking finding, and answer it with fixing_myself, dismiss and override', async ({ forge }) => {
    const owner = await forge.actor({ label: 'review-gate' });
    const projectId = await createGuardedProject(forge, owner, 'review-gate');
    const draft = await writeChapterByHand(owner.ctx, projectId, {
      title: 'Draft',
      body: 'The lamplighter counted the links twice before dawn broke over the quiet street.',
    });

    const reviewId = await insertJudgeReview(projectId, 1, draft.revision, draft.body ?? '', [
      { id: 'f1', severity: 'blocking' },
      { id: 'f2', severity: 'warning' },
    ]);

    // fixing_myself is the author saying they will fix it by hand — review-findings.ts:330 keeps it open, so the gate stays shut.
    const fixing = await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'f1'), { data: { action: 'fixing_myself' } });
    expect(fixing.status(), await fixing.text()).toBe(200);
    const afterFixing = (await fixing.json()) as ChapterReview;
    expect(afterFixing.openFindings).toBe(2);
    expect(afterFixing.openBlocking).toBe(1);
    expect(afterFixing.findings.find(finding => finding.id === 'f1')?.remedy).toMatchObject({ action: 'fixing_myself' });

    const held = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1`);
    expect((await held.json()) as { reviewStatus: string }).toMatchObject({ reviewStatus: 'contradiction' });
    const readiness = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1/finalize-readiness`)).json()) as { blockers: { code: string }[] };
    expect(readiness.blockers.map(blocker => blocker.code)).toContain('FIN_004');

    await expectRefused(
      await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'f1'), { data: { action: 'dismissed' } }),
      400,
      'REV_004',
      'dismissing without a reason',
    );
    await expectRefused(
      await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'f2'), { data: { action: 'overridden' } }),
      400,
      'REV_005',
      'overriding a non-blocking finding',
    );
    await expectRefused(
      await mutate(owner.ctx, 'post', remedyPath(projectId, 1, '999999999', 'f1'), { data: { action: 'dismissed', reason: 'checked by hand' } }),
      404,
      'REV_001',
      'remedying an unknown review',
    );
    await expectRefused(
      await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'ghost'), { data: { action: 'dismissed', reason: 'checked by hand' } }),
      404,
      'REV_002',
      'remedying an unknown finding',
    );

    const dismissed = await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'f1'), { data: { action: 'dismissed', reason: 'checked by hand, not a real leak' } });
    expect(dismissed.status(), await dismissed.text()).toBe(200);
    expect((await dismissed.json()) as ChapterReview).toMatchObject({ openFindings: 1, openBlocking: 0 });
    const lifted = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1`);
    expect((await lifted.json()) as { reviewStatus: string }).toMatchObject({ reviewStatus: 'needs_review' });
    const liftedReadiness = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1/finalize-readiness`)).json()) as { blockers: { code: string }[] };
    expect(liftedReadiness.blockers.map(blocker => blocker.code)).not.toContain('FIN_004');

    // Withdrawing the answer reopens f1, which is blocking again, so the gate shuts once more.
    const cleared = await mutate(owner.ctx, 'delete', remedyPath(projectId, 1, reviewId, 'f1'));
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect((await cleared.json()) as ChapterReview).toMatchObject({ openFindings: 2, openBlocking: 1 });
    const reheld = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1`);
    expect((await reheld.json()) as { reviewStatus: string }).toMatchObject({ reviewStatus: 'contradiction' });

    const moved = await saveChapter(
      owner.ctx,
      projectId,
      { ...draft, body: `${draft.body}\n\nA second line moves the text.` },
      {
        title: draft.title ?? undefined,
        body: `${draft.body}\n\nA second line moves the text.`,
      },
    );
    expect(moved.revision).toBeGreaterThan(draft.revision);
    const staleRead = await owner.ctx.get(`/api/v1/projects/${projectId}/chapters/1/reviews/${reviewId}`);
    expect((await staleRead.json()) as ChapterReview, 'staleness is computed on read, from the text as it stands now').toMatchObject({ stale: true });
    await expectRefused(
      await mutate(owner.ctx, 'post', remedyPath(projectId, 1, reviewId, 'f2'), { data: { action: 'dismissed', reason: 'the text moved' } }),
      409,
      'REV_003',
      'remedying a review after the text moved',
    );
  });
});
