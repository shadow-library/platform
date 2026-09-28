/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb, pollUntil } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { assertSpendGuarded, FAIL_PIN_MODEL, listDispatchedModelCalls, readProjectRow } from './forge-db';
import { CHAPTER_ONE, CHAPTER_TWO, createEntity, type Draft, readDraft, readFinalizeReview, saveChapter, writeChapterByHand } from './forge-helpers';
import {
  BLOCKING_FINDING,
  countDraftRevisions,
  deleteFinalizeReviews,
  expectFinalizeRun,
  type FinalizeAnswer,
  finalizeRoute,
  finalizeThroughReviewRoute,
  insertBlockingJudgeReview,
  insertNovelValidationReport,
  insertReadyReview,
  listFinalizationRuns,
  moveReviewedText,
  readChapterRow,
  readinessCodes,
  readItemDecisions,
  readNovelValidationReports,
  readReviewRow,
  readStoryCursor,
  readyReviewWithItems,
  restoreReviewedText,
  reviewPath,
  setContinuityClaim,
  setNeedsRevalidation,
  setReviewStatus,
} from './forge-review';
import { markDraftIsolated } from './forge-rows';
import {
  approveAsRead,
  createGuardedProject,
  finalizeChapterNoReview,
  insertFinalDraft,
  readFinalizeReviewStatus,
  readStaleDraft,
  writeBibleDoc,
  writeBrief,
  writeFact,
} from './forge-story';

/**
 * Defining types
 */

interface ReviewView {
  readonly status: string;
  readonly open: { consequential: number; routine: number };
  readonly autoKeep: string[];
  readonly revertedAt: string | null;
}

interface ThreadRow {
  readonly summary: string | null;
  readonly openedChapter: number | null;
  readonly lastAdvancedChapter: number | null;
}

/**
 * Declaring the constants
 *
 * Finalize as `finalize-refusals.ts` gates it and as the review path commits it, with no model call anywhere: every project is quota-pinned
 * and fail-pinned, each approval's finalize-review job fails under that guard, and the reading it would have produced is arranged as rows
 * (`forge-review.ts`). The direct continuity path — a chapter with no review — does reach for the continuity model, which the quota pin
 * refuses before any dispatch, so it half-finalizes exactly as a failed extraction would.
 */

const REFUSAL_STATUS: Record<string, number> = {
  DRF_002: 400,
  DRF_004: 400,
  DRF_007: 400,
  FIN_001: 400,
  FIN_002: 400,
  FIN_003: 400,
  FIN_004: 400,
  CHP_005: 400,
  CHP_010: 400,
  FRV_002: 409,
  FRV_003: 409,
  FRV_004: 409,
  FRV_005: 400,
  FRV_006: 400,
  PLN_004: 409,
};

const SECRET = 'wall_is_alive';

const THIRD_CHAPTER = { title: 'The Survey', body: 'Tamsin walked the district with her chain and found the wall breathing against her palm.' };

/** Past the five-minute continuity lease, so another run may take the claim over. */
const STALE_CLAIM_MS = 6 * 60_000;

/** Every refusal still standing, in the order readiness lists them; finalize must refuse with the first and start no run. */
async function expectRefusedInOrder(owner: ForgeActor, projectId: string, chapter: number, blockers: readonly string[]): Promise<void> {
  expect(await readinessCodes(owner.ctx, projectId, chapter), `readiness of chapter ${chapter}`).toEqual(blockers);
  const [first] = blockers;
  if (!first) return;
  await expectCode(
    await finalizeThroughReviewRoute(owner.ctx, projectId, chapter),
    REFUSAL_STATUS[first] ?? 0,
    first,
    `finalizing chapter ${chapter} with ${blockers.join(', ')} standing`,
  );
}

/** A plan whose knowledge contract teaches `factKey` — written straight to the row, since the plan route refuses one that reveals a locked fact. */
async function insertRevealingPlan(projectId: string, chapter: number, factKey: string): Promise<void> {
  const sql = novelForgeDb();
  const contract = { pov: ['mira'], learns: [{ entityKey: 'mira', factKey }] };
  await sql`INSERT INTO briefs (project_id, chapter, body, knowledge_contract) VALUES (${projectId}, ${chapter}, 'Mira learns what the wall is.', ${sql.json(contract as never)})`;
}

async function setDraftApproved(projectId: string, chapter: number): Promise<void> {
  await novelForgeDb()`UPDATE drafts SET review_status = 'approved', approved_revision = revision WHERE project_id = ${projectId} AND chapter = ${chapter}`;
}

async function waitForFailedReview(projectId: string, chapter: number): Promise<void> {
  const status = await pollUntil(
    () => readFinalizeReviewStatus(projectId, chapter),
    current => current === 'failed',
    { timeoutMs: 30_000, intervalMs: 500 },
  );
  expect(status, `the finalize review of chapter ${chapter} fails under the spend guard`).toBe('failed');
}

async function readThread(projectId: string, threadKey: string): Promise<ThreadRow | undefined> {
  const [row] = await novelForgeDb()<ThreadRow[]>`
    SELECT summary, opened_chapter AS "openedChapter", last_advanced_chapter AS "lastAdvancedChapter" FROM plot_threads WHERE project_id = ${projectId} AND thread_key = ${threadKey}
  `;
  return row;
}

async function countMysteries(projectId: string, mysteryKey: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM mysteries WHERE project_id = ${projectId} AND mystery_key = ${mysteryKey}`;
  return row?.count ?? 0;
}

function decide(ctx: APIRequestContext, projectId: string, chapter: number, itemId: string, data: Record<string, unknown>): ReturnType<typeof mutate> {
  return mutate(ctx, 'post', reviewPath(projectId, chapter, `/items/${itemId}/decision`), { data });
}

function threadItem(
  key: string,
  triage: 'consequential' | 'routine',
  threadKey: string,
  summary: string,
  decision: 'kept' | null = null,
): Parameters<typeof readyReviewWithItems>[2][number] {
  return {
    key,
    category: 'promise',
    triage,
    subjectKey: threadKey,
    claim: `Opens the thread ${threadKey}`,
    proposed: { category: 'promise', thread: { threadKey, status: 'open', summary } },
    decision,
  };
}

async function approvedWithFailedReview(owner: ForgeActor, projectId: string, draft: Draft): Promise<Draft> {
  const approved = await approveAsRead(owner.ctx, projectId, draft);
  await waitForFailedReview(projectId, draft.chapter);
  return approved;
}

test.describe('novel-forge finalize refusals', () => {
  test('should list every refusal in the order finalize raises them, refuse with the first without starting a run, and finalize once none is left', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-order' });
    const projectId = await createGuardedProject(forge, owner, 'fin-order');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    await writeFact(owner.ctx, projectId, SECRET, { text: 'The wall of the moving district is alive.', revealChapter: 9 });

    await finalizeChapterNoReview(owner.ctx, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    const second = await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);
    const third = await writeChapterByHand(owner.ctx, projectId, THIRD_CHAPTER);
    const judgeReviewId = await insertBlockingJudgeReview(projectId, third);
    await insertRevealingPlan(projectId, 3, SECRET);
    await writeBibleDoc(owner.ctx, projectId, 'world', 'river-city', '# River City\nThe district moves one street east every night.');
    expect((await readChapterRow(projectId, 1))?.needsRevalidation, 'a Story Bible edit flags the finalized chapter for re-validation').toBe(true);
    await insertNovelValidationReport(projectId, [{ chapter: 3, severity: 'error', description: 'The wall breathes before anyone could know it lives.' }], 60_000);
    await saveChapter(owner.ctx, projectId, second, { ...CHAPTER_TWO, body: `${CHAPTER_TWO.body}\n\nShe kept the writ anyway.` });
    expect((await readStaleDraft(owner.ctx, projectId, 3)).staleReason, 'editing chapter 2 leaves chapter 3 stale').not.toBeNull();

    const blockers = ['DRF_004', 'DRF_007', 'FIN_004', 'CHP_010', 'PLN_004', 'FIN_001', 'FIN_002', 'FIN_003'];
    await expectRefusedInOrder(owner, projectId, 3, blockers);

    const dismissed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/3/reviews/${judgeReviewId}/findings/${BLOCKING_FINDING}/remedy`, {
      data: { action: 'dismissed', reason: 'The breathing is a metaphor here.' },
    });
    expect(dismissed.status(), await dismissed.text()).toBe(200);
    await expectRefusedInOrder(owner, projectId, 3, ['DRF_004', 'DRF_007', 'CHP_010', 'PLN_004', 'FIN_001', 'FIN_002', 'FIN_003']);

    const summarised = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/chapters/3/summary`, { data: { summary: 'Tamsin finds the wall breathing.' } });
    expect(summarised.status(), await summarised.text()).toBe(200);
    await expectRefusedInOrder(owner, projectId, 3, ['DRF_004', 'DRF_007', 'PLN_004', 'FIN_001', 'FIN_002', 'FIN_003']);

    await writeFact(owner.ctx, projectId, SECRET, { text: 'The wall of the moving district is alive.', revealChapter: 3 });
    await expectRefusedInOrder(owner, projectId, 3, ['DRF_004', 'DRF_007', 'FIN_001', 'FIN_002', 'FIN_003']);

    const current = await readDraft(owner.ctx, projectId, 3);
    const resaved = await saveChapter(owner.ctx, projectId, current, { ...THIRD_CHAPTER, body: `${THIRD_CHAPTER.body} It was warm.`, summary: current.summary ?? undefined });
    await expectRefusedInOrder(owner, projectId, 3, ['DRF_004', 'FIN_001', 'FIN_002', 'FIN_003']);

    const approved = await approvedWithFailedReview(owner, projectId, resaved);
    await expectRefusedInOrder(owner, projectId, 3, ['FRV_003', 'FIN_001', 'FIN_002', 'FIN_003']);
    await readyReviewWithItems(projectId, approved, []);
    await expectRefusedInOrder(owner, projectId, 3, ['FIN_001', 'FIN_002', 'FIN_003']);

    // Nothing model-free clears the flag: only a validation window a model call covered successfully does (novel-validation.graph.ts:224-235).
    await setNeedsRevalidation(projectId, 1, false);
    await expectRefusedInOrder(owner, projectId, 3, ['FIN_001', 'FIN_003']);
    await finalizeChapterNoReview(owner.ctx, projectId, await readDraft(owner.ctx, projectId, 2));
    await expectRefusedInOrder(owner, projectId, 3, ['FIN_003']);
    await insertNovelValidationReport(projectId, []);
    await expectRefusedInOrder(owner, projectId, 3, []);
    expect(await listFinalizationRuns(projectId, 3), 'no refusal started a finalization run').toEqual([]);

    const finalized = await finalizeThroughReviewRoute(owner.ctx, projectId, 3);
    expect(finalized.status(), await finalized.text()).toBe(200);
    expect(await readDraft(owner.ctx, projectId, 3)).toMatchObject({ status: 'final', revision: approved.revision });
    expect((await listFinalizationRuns(projectId, 3)).map(run => run.status)).toEqual(['completed']);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should gate an approved chapter on its finalize review: preparing, failed, read from other prose, unanswered, or stranding a reveal', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-review-gates' });
    const projectId = await createGuardedProject(forge, owner, 'fin-review-gates');
    const draft = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await expectCode(await readFinalizeReview(owner.ctx, projectId, 1), 404, 'FRV_001', 'reading the review of a chapter never approved');

    const approved = await approvedWithFailedReview(owner, projectId, draft);
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_003']);
    await expectCode(await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/keep-routine')), 409, 'FRV_003', 'answering a review whose reading failed');

    await assertSpendGuarded(projectId);
    const prepared = await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/prepare'));
    expect(prepared.status(), `preparing the failed review again — body ${await prepared.text()}`).toBe(200);
    expect(['preparing', 'failed'], 'the review is read again, and fails under the guard again').toContain(((await prepared.json()) as ReviewView).status);
    await waitForFailedReview(projectId, 1);

    const ids = await readyReviewWithItems(projectId, approved, [
      threadItem('thread-open', 'routine', 'e2e-open-thread', 'The wall moves east.'),
      {
        key: 'milestone-skipped',
        category: 'milestone',
        triage: 'consequential',
        subjectKey: 'e2e-oath',
        claim: 'Not reached: the oath',
        proposed: { category: 'milestone', milestoneKey: 'e2e-oath', reached: true },
        decision: 'skipped',
        reason: 'The oath waits for chapter two.',
        dependents: ['e2e-secret'],
      },
    ]);
    await setReviewStatus(projectId, 1, 'preparing');
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_002']);
    await setReviewStatus(projectId, 1, 'failed');
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_003']);
    await setReviewStatus(projectId, 1, 'ready');
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_005']);
    await moveReviewedText(projectId, 1);
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_004']);
    await restoreReviewedText(projectId, approved);

    const keptRoutine = await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/keep-routine'));
    expect(keptRoutine.status(), await keptRoutine.text()).toBe(200);
    expect(((await keptRoutine.json()) as ReviewView).open).toEqual({ consequential: 0, routine: 0 });
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_006']);

    const kept = await decide(owner.ctx, projectId, 1, ids['milestone-skipped'] ?? '', { decision: 'kept' });
    expect(kept.status(), await kept.text()).toBe(200);
    await expectRefusedInOrder(owner, projectId, 1, []);
    const finalized = await finalizeThroughReviewRoute(owner.ctx, projectId, 1);
    expect(finalized.status(), await finalized.text()).toBe(200);
    expect((await readReviewRow(projectId, 1))?.status).toBe('applied');
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should ask an isolated chapter for its summary and continuation state rather than a plain summary', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-isolated' });
    const projectId = await createGuardedProject(forge, owner, 'fin-isolated');
    await writeChapterByHand(owner.ctx, projectId, { title: CHAPTER_ONE.title, body: CHAPTER_ONE.body });
    await markDraftIsolated(projectId, 1);
    await expectRefusedInOrder(owner, projectId, 1, ['DRF_004', 'CHP_005']);

    const summarised = await saveChapter(owner.ctx, projectId, await readDraft(owner.ctx, projectId, 1), { ...CHAPTER_ONE });
    await setDraftApproved(projectId, 1);
    await expectRefusedInOrder(owner, projectId, 1, ['CHP_005']);

    const response = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/drafts/1`, {
      data: { baseDraftId: summarised.id, baseRevision: summarised.revision, baseSaveSeq: summarised.saveSeq, ...CHAPTER_ONE, state: { handoff: 'Tamsin at the wall at noon.' } },
    });
    expect(response.status(), `a hand save carrying the continuation state — body ${await response.text()}`).toBe(200);
    expect(await readinessCodes(owner.ctx, projectId, 1), 'with summary and state the isolated chapter only needs its approval').toEqual(['DRF_004']);
    expect((await readDraft(owner.ctx, projectId, 1)).isolated).toBe(true);
  });
});

test.describe('novel-forge finalize through a ready review', () => {
  test('should apply only the kept updates, commit the chapter with no model call, and find nothing left to do on a replay', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-review-path' });
    const projectId = await createGuardedProject(forge, owner, 'fin-review-path');
    const approved = await approvedWithFailedReview(owner, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    const ids = await readyReviewWithItems(projectId, approved, [
      threadItem('thread-kept', 'routine', 'e2e-kept-thread', 'The wall moves east every night.'),
      {
        key: 'mystery-skipped',
        category: 'promise',
        triage: 'consequential',
        subjectKey: 'e2e-skipped-mystery',
        claim: 'Opens the mystery of who moves the wall',
        proposed: { category: 'promise', mystery: { mysteryKey: 'e2e-skipped-mystery', status: 'open', question: 'Who moves the wall?' } },
      },
      threadItem('thread-edited', 'consequential', 'e2e-edited-thread', 'Odo wants the district sealed.'),
    ]);
    await expectRefusedInOrder(owner, projectId, 1, ['FRV_005']);

    await expectCode(await decide(owner.ctx, projectId, 1, ids['mystery-skipped'] ?? '', { decision: 'skipped' }), 400, 'FRV_010', 'skipping without a reason');
    await expectCode(await decide(owner.ctx, projectId, 1, '999999999', { decision: 'kept' }), 404, 'FRV_008', 'deciding an update that is not in the review');
    await expectCode(
      await decide(owner.ctx, projectId, 1, ids['thread-edited'] ?? '', { decision: 'edited', edited: { threadKey: 'e2e-other-thread' } }),
      400,
      'FRV_009',
      'an edit that changes the record the update is about',
    );
    expect(Object.values(await readItemDecisions((await readReviewRow(projectId, 1))?.id ?? '')), 'every refused decision left the items open').toEqual([null, null, null]);

    const keptRoutine = await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/keep-routine'));
    expect(keptRoutine.status(), await keptRoutine.text()).toBe(200);
    expect(((await keptRoutine.json()) as ReviewView).open).toEqual({ consequential: 2, routine: 0 });
    const skipped = await decide(owner.ctx, projectId, 1, ids['mystery-skipped'] ?? '', { decision: 'skipped', reason: 'Too early to name the mystery.' });
    expect(skipped.status(), await skipped.text()).toBe(200);
    const edited = await decide(owner.ctx, projectId, 1, ids['thread-edited'] ?? '', { decision: 'edited', edited: { summary: 'Odo wants the district sealed tonight.' } });
    expect(edited.status(), await edited.text()).toBe(200);
    expect(await readThread(projectId, 'e2e-kept-thread'), 'nothing is applied before finalize').toBeUndefined();

    const finalized = await finalizeThroughReviewRoute(owner.ctx, projectId, 1);
    expect(finalized.status(), await finalized.text()).toBe(200);
    expect(await finalized.json()).toMatchObject({ status: 'completed', outcome: 'completed' });
    expect(await readDraft(owner.ctx, projectId, 1)).toMatchObject({ status: 'final', reviewStatus: 'final', revision: approved.revision });
    expect(await readChapterRow(projectId, 1)).toMatchObject({ status: 'done', locked: true, continuityApplied: true, continuityClaimedBy: null });
    expect(await readStoryCursor(projectId), 'the story cursor advanced to the chapter').toBe(1);
    expect(await readThread(projectId, 'e2e-kept-thread'), 'the kept update applied as proposed').toMatchObject({ openedChapter: 1, lastAdvancedChapter: 1 });
    expect((await readThread(projectId, 'e2e-edited-thread'))?.summary, 'the edited update applied with the edit').toBe('Odo wants the district sealed tonight.');
    expect(await countMysteries(projectId, 'e2e-skipped-mystery'), 'the skipped update was never applied').toBe(0);
    const review = await readReviewRow(projectId, 1);
    expect(review?.status).toBe('applied');
    expect(review?.applied?.map(item => item.itemId).sort(), 'the applied log covers the kept and edited updates only').toEqual([ids['thread-kept'], ids['thread-edited']].sort());
    expect(
      review?.applied?.flatMap(item => item.changes.map(change => ({ table: change.table, before: change.before }))),
      'each logged row records it did not exist before',
    ).toEqual([
      { table: 'plot_threads', before: null },
      { table: 'plot_threads', before: null },
    ]);
    expect(await listDispatchedModelCalls(projectId), 'the review path finalizes without a model call').toEqual([]);

    await expectCode(await decide(owner.ctx, projectId, 1, ids['mystery-skipped'] ?? '', { decision: 'kept' }), 409, 'FRV_011', 'deciding on an applied review');
    await expectCode(await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/keep-routine')), 409, 'FRV_011', 'keeping routine updates on an applied review');

    const revisions = await countDraftRevisions(projectId, 1);
    await expectRefusedInOrder(owner, projectId, 1, ['DRF_002']);
    expect(await listFinalizationRuns(projectId, 1), 'the replay started no second run').toHaveLength(1);
    expect(await countDraftRevisions(projectId, 1), 'and wrote no revision').toBe(revisions);
    expect(await readStoryCursor(projectId)).toBe(1);
  });

  test('should merge the auto-keep categories into the project config beside the model pins', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-autokeep' });
    const projectId = await createGuardedProject(forge, owner, 'fin-autokeep');
    const path = `/api/v1/projects/${projectId}/finalize-review/settings`;

    const saved = await mutate(owner.ctx, 'put', path, { data: { autoKeep: ['promise', 'appearance', 'promise'] } });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(await saved.json(), 'a category named twice is kept once').toEqual({ autoKeep: ['promise', 'appearance'] });
    const refused = await mutate(owner.ctx, 'put', path, { data: { autoKeep: ['everything'] } });
    await expectCode(refused, 422, 'VALIDATION_ERROR', 'an unknown category');

    expect((await readProjectRow(projectId))?.config?.models?.['continuity'], 'the model pins survive the merge').toEqual(FAIL_PIN_MODEL);
    await assertSpendGuarded(projectId);
  });

  test('should store the auto-keep categories as the array it answered with', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-autokeep-stored' });
    const projectId = await createGuardedProject(forge, owner, 'fin-autokeep-stored');
    const saved = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/finalize-review/settings`, { data: { autoKeep: ['promise', 'appearance'] } });
    expect(saved.status(), await saved.text()).toBe(200);

    const project = await readProjectRow(projectId);
    expect((project?.config as { finalizeReview?: { autoKeep?: unknown } } | null)?.finalizeReview?.autoKeep).toEqual(['promise', 'appearance']);
  });
});

test.describe('novel-forge finalize on the direct continuity path', () => {
  test('should half-finalize when extraction is refused, release the claim, respect a live claim, take over a stale one and resume through a review', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-direct' });
    const projectId = await createGuardedProject(forge, owner, 'fin-direct');
    await approvedWithFailedReview(owner, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    await deleteFinalizeReviews(projectId, 1);
    await expectRefusedInOrder(owner, projectId, 1, []);

    const first = await expectFinalizeRun(await finalizeRoute(owner.ctx, projectId, 1), 'finalizing on the direct path');
    expect(first, 'a failed graph still answers with its run').toMatchObject({ status: 'failed', outcome: 'failed' });
    const final = await readDraft(owner.ctx, projectId, 1);
    expect(final.status, 'the prose committed before extraction was refused').toBe('final');
    expect(await readChapterRow(projectId, 1)).toMatchObject({ status: 'done', locked: true, continuityApplied: false, continuityClaimedBy: null, continuityClaimedAt: null });
    expect(await readStoryCursor(projectId), 'the cursor waits for continuity').toBe(0);
    const [refusedRun] = await listFinalizationRuns(projectId, 1);
    expect(refusedRun?.error?.code, 'extraction was refused before any dispatch').toBe('AI_008');
    expect(await readinessCodes(owner.ctx, projectId, 1), 'a half-finalized chapter is ready to resume').toEqual([]);

    const retry = await expectFinalizeRun(await finalizeRoute(owner.ctx, projectId, 1), 'retrying at once');
    expect(retry.status).toBe('failed');
    expect((await listFinalizationRuns(projectId, 1)).at(-1)?.error?.code, 'the released claim did not block the retry').toBe('AI_008');

    await setContinuityClaim(projectId, 1, 'e2e-other-run', 0);
    const blocked = await expectFinalizeRun(await finalizeRoute(owner.ctx, projectId, 1), 'finalizing under a live claim');
    expect(blocked.status).toBe('failed');
    expect((await listFinalizationRuns(projectId, 1)).at(-1)?.error?.message).toContain('already in progress');
    expect((await readChapterRow(projectId, 1))?.continuityClaimedBy, 'the live claim is left to its holder').toBe('e2e-other-run');

    await setContinuityClaim(projectId, 1, 'e2e-other-run', STALE_CLAIM_MS);
    const takenOver = await expectFinalizeRun(await finalizeRoute(owner.ctx, projectId, 1), 'finalizing past a stale claim');
    expect(takenOver.status).toBe('failed');
    expect((await listFinalizationRuns(projectId, 1)).at(-1)?.error?.code, 'the stale claim was taken over and extraction reached again').toBe('AI_008');
    expect(await readChapterRow(projectId, 1)).toMatchObject({ continuityClaimedBy: null, continuityClaimedAt: null, continuityApplied: false });

    await insertReadyReview(projectId, final);
    const resumed = await finalizeThroughReviewRoute(owner.ctx, projectId, 1);
    expect(resumed.status(), await resumed.text()).toBe(200);
    expect(await resumed.json()).toMatchObject({ status: 'completed' });
    expect(await readChapterRow(projectId, 1)).toMatchObject({ continuityApplied: true });
    expect(await readStoryCursor(projectId)).toBe(1);
    expect((await readDraft(owner.ctx, projectId, 1)).revision, 'the resume committed no new prose').toBe(final.revision);
    await expectRefusedInOrder(owner, projectId, 1, ['DRF_002']);
    expect((await listFinalizationRuns(projectId, 1)).map(run => run.status)).toEqual(['failed', 'failed', 'failed', 'failed', 'completed']);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  // generation.controller.ts:222-224 declares 200 and 409 with no @HttpStatus, so fastify-router.ts:322-327 answers this POST with 201.
  test.fixme('should answer a finalize with the 200 it declares', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-status' });
    const projectId = await createGuardedProject(forge, owner, 'fin-status');
    await approvedWithFailedReview(owner, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    await deleteFinalizeReviews(projectId, 1);

    await assertSpendGuarded(projectId);
    const response = await finalizeRoute(owner.ctx, projectId, 1);
    expect(response.status(), await response.text()).toBe(200);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});

test.describe('novel-forge finalize review revert', () => {
  test('should undo the kept updates as one unit, only for the latest final chapter and only while their rows are unchanged', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-revert' });
    const projectId = await createGuardedProject(forge, owner, 'fin-revert');
    const approved = await approvedWithFailedReview(owner, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    await readyReviewWithItems(projectId, approved, [threadItem('thread', 'routine', 'e2e-revert-thread', 'The wall moves east.', 'kept')]);
    const finalized = await finalizeThroughReviewRoute(owner.ctx, projectId, 1);
    expect(finalized.status(), await finalized.text()).toBe(200);
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);
    const applied = await readThread(projectId, 'e2e-revert-thread');
    expect(applied, 'finalize applied the kept thread').toBeDefined();
    const revert = (chapter: number): ReturnType<typeof mutate> => mutate(owner.ctx, 'post', reviewPath(projectId, chapter, '/revert'));

    await expectCode(await revert(2), 409, 'FRV_012', 'reverting a chapter with nothing applied');
    await novelForgeDb()`INSERT INTO chapters (project_id, number, content, status, locked) VALUES (${projectId}, 2, 'A later final chapter.', 'done', true)`;
    await expectCode(await revert(1), 409, 'FRV_012', 'reverting a chapter that is no longer the latest final one');
    await novelForgeDb()`DELETE FROM chapters WHERE project_id = ${projectId} AND number = 2`;

    await novelForgeDb()`UPDATE plot_threads SET summary = 'The author rewrote this since.' WHERE project_id = ${projectId} AND thread_key = 'e2e-revert-thread'`;
    await expectCode(await revert(1), 409, 'FRV_007', 'reverting over a row changed since it was applied');
    expect((await readReviewRow(projectId, 1))?.status, 'the refused revert left the review applied').toBe('applied');
    await novelForgeDb()`UPDATE plot_threads SET summary = ${applied?.summary ?? null} WHERE project_id = ${projectId} AND thread_key = 'e2e-revert-thread'`;

    const reverted = await revert(1);
    expect(reverted.status(), await reverted.text()).toBe(200);
    expect((await reverted.json()) as ReviewView).toMatchObject({ status: 'reverted', revertedAt: expect.any(String) });
    expect(await readThread(projectId, 'e2e-revert-thread'), 'the thread the review created is gone').toBeUndefined();
    expect((await readStaleDraft(owner.ctx, projectId, 2)).staleReason, 'the later draft was written against the undone updates').toBe(
      'the Story Bible updates of chapter 1 were undone',
    );
    expect((await readDraft(owner.ctx, projectId, 1)).status, 'the prose stays final').toBe('final');
    await expectCode(await revert(1), 409, 'FRV_012', 'reverting the same review twice');
  });

  test('should refuse a revert that would un-reach a milestone one of the chapter’s reveals depends on', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-revert-reveal' });
    const projectId = await createGuardedProject(forge, owner, 'fin-revert-reveal');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    await writeFact(owner.ctx, projectId, SECRET, { text: 'The wall of the moving district is alive.', revealChapter: null, unlock: { all: [{ milestone: 'oath_sworn' }] } });
    const milestone = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/milestones`, { data: { milestoneKey: 'oath_sworn', label: 'Mira swears the oath' } });
    expect(milestone.status(), await milestone.text()).toBe(201);
    await writeBrief(owner.ctx, projectId, 1, {
      body: 'Mira swears the oath and learns the wall is alive.',
      pov: 'mira',
      claimedMilestones: ['oath_sworn'],
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: SECRET }] },
    });
    const approved = await approvedWithFailedReview(
      owner,
      projectId,
      await writeChapterByHand(owner.ctx, projectId, { ...CHAPTER_ONE, body: 'Mira swore the oath, and the wall breathed.' }),
    );
    await readyReviewWithItems(projectId, approved, [
      {
        key: 'oath',
        category: 'milestone',
        triage: 'consequential',
        subjectKey: 'oath_sworn',
        claim: 'Reached: Mira swears the oath',
        proposed: { category: 'milestone', milestoneKey: 'oath_sworn', reached: true },
        decision: 'kept',
      },
    ]);
    const finalized = await finalizeThroughReviewRoute(owner.ctx, projectId, 1);
    expect(finalized.status(), await finalized.text()).toBe(200);

    await expectCode(await mutate(owner.ctx, 'post', reviewPath(projectId, 1, '/revert')), 409, 'FRV_013', 'un-reaching the milestone the chapter’s reveal needs');
    const [row] = await novelForgeDb()<{ state: string; reachedChapter: number | null }[]>`
      SELECT state, reached_chapter AS "reachedChapter" FROM milestones WHERE project_id = ${projectId} AND milestone_key = 'oath_sworn'
    `;
    expect(row, 'the refused revert left the milestone reached').toEqual({ state: 'reached', reachedChapter: 1 });
    expect((await readReviewRow(projectId, 1))?.status).toBe('applied');
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});

test.describe('novel-forge novel validation', () => {
  test('should persist one report per run, and keep every re-validation flag when no window could be validated', async ({ forge }) => {
    const owner = await forge.actor({ label: 'fin-validate' });
    const projectId = await createGuardedProject(forge, owner, 'fin-validate');
    const validate = async (): Promise<FinalizeAnswer> => {
      await assertSpendGuarded(projectId);
      const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/validate`);
      expect(response.status(), await response.text()).toBe(200);
      return (await response.json()) as FinalizeAnswer;
    };

    expect(await validate(), 'with nothing finalized there is no window to validate').toMatchObject({ status: 'completed' });
    expect(await readNovelValidationReports(projectId)).toEqual([
      { issues: 0, summary: 'No issues found.', payload: { issues: [], summary: 'No issues found.', windowsRequested: 0, windowsSucceeded: 0, failedRanges: [] } },
    ]);

    await insertFinalDraft(projectId, 1);
    await insertFinalDraft(projectId, 2);
    await writeBibleDoc(owner.ctx, projectId, 'world', 'river-city', '# River City\nThe district moves one street east every night.');
    await writeChapterByHand(owner.ctx, projectId, { ...THIRD_CHAPTER, summary: 'Tamsin finds the wall breathing.' });
    expect(await readinessCodes(owner.ctx, projectId, 3)).toEqual(['DRF_004', 'FIN_002']);

    expect(await validate(), 'a window that failed is not a failed run').toMatchObject({ status: 'completed' });
    const [, failed] = await readNovelValidationReports(projectId);
    expect(failed).toEqual({
      issues: 0,
      summary: 'No windows could be validated this run (0/1 succeeded).',
      payload: {
        issues: [],
        summary: 'No windows could be validated this run (0/1 succeeded).',
        windowsRequested: 1,
        windowsSucceeded: 0,
        failedRanges: [{ from: 1, to: 2 }],
      },
    });
    expect((await readChapterRow(projectId, 1))?.needsRevalidation, 'a failed window keeps the flag').toBe(true);
    expect((await readChapterRow(projectId, 2))?.needsRevalidation).toBe(true);
    expect(await readinessCodes(owner.ctx, projectId, 3), 'so the validation the refusal asks for cannot lift FIN_002 without a model').toEqual(['DRF_004', 'FIN_002']);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});
