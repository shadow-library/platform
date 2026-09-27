/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect } from './forge-actors';
import { assertSpendGuarded, ForgeDbError } from './forge-db';
import { type Draft, errorCode } from './forge-helpers';
import { readyFinalizeReview } from './forge-story';

/**
 * Defining types
 */

export type ReviewCategory = 'entity' | 'appearance' | 'character_state' | 'relationship' | 'promise' | 'knowledge' | 'milestone' | 'summary';

export type ReviewStatus = 'preparing' | 'ready' | 'failed' | 'applied' | 'reverted';

export type ReviewDecision = 'kept' | 'edited' | 'skipped';

export interface ReviewItemSeed {
  /** Unique within the review; decisions and assertions find the item by it. */
  key: string;
  category: ReviewCategory;
  triage: 'consequential' | 'routine';
  subjectKey: string;
  claim: string;
  proposed: Record<string, unknown>;
  decision?: ReviewDecision | null;
  reason?: string | null;
  flag?: 'missed_milestone' | 'unclaimed_milestone' | 'unplanned_disclosure' | null;
  dependents?: string[] | null;
}

export interface ReviewRowChange {
  readonly table: string;
  readonly match: Record<string, string | number>;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
}

export interface FinalizeReviewRow {
  readonly id: string;
  readonly status: ReviewStatus;
  readonly draftRevision: number;
  readonly applied: { itemId: string; changes: ReviewRowChange[] }[] | null;
}

export interface ChapterRow {
  readonly status: string;
  readonly locked: boolean;
  readonly continuityApplied: boolean;
  readonly needsRevalidation: boolean;
  readonly title: string | null;
  readonly content: string | null;
  readonly summary: string | null;
  readonly note: string | null;
  readonly continuityClaimedBy: string | null;
  readonly continuityClaimedAt: Date | null;
}

export interface FinalizationRun {
  readonly id: string;
  readonly status: string;
  readonly error: { code?: string; message?: string; node?: string } | null;
}

export interface FinalizeAnswer {
  readonly runId: string;
  readonly outcome: string;
  readonly status: string;
}

export interface ValidationIssueSeed {
  chapter: number;
  severity: 'error' | 'warning';
  description: string;
}

/**
 * Declaring the constants
 *
 * The finalize review as FX-13 arranges it: the approval's review job fails under the spend guard, and the model's reading of the approved
 * prose is stood in for by rows marked ready for exactly that text. Everything a model would have written — review items, judge findings,
 * a novel validation report — is a row here; every decision, finalize and revert goes through the API.
 */

/** A judge finding that holds the chapter until it is answered; the model call that would have found it is never made. */
export const BLOCKING_FINDING = 'e2e-blocking';

export function reviewPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/drafts/${chapter}/finalize-review${suffix}`;
}

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export async function expectRefusal(response: APIResponse, status: number, code: string, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
  expect(await errorCode(response), what).toBe(code);
}

export async function readinessCodes(ctx: APIRequestContext, projectId: string, chapter: number): Promise<string[]> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/drafts/${chapter}/finalize-readiness`);
  expect(response.status(), await response.text()).toBe(200);
  const readiness = (await response.json()) as { ready: boolean; blockers: { code: string }[] };
  expect(readiness.ready, 'readiness is ready exactly when nothing blocks').toBe(readiness.blockers.length === 0);
  return readiness.blockers.map(blocker => blocker.code);
}

/** Finalizes through the review route, which answers 200; a model-capable request, so the guard is asserted right before it. */
export async function finalizeThroughReviewRoute(ctx: APIRequestContext, projectId: string, chapter: number): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  return mutate(ctx, 'post', reviewPath(projectId, chapter, '/finalize'), { data: {} });
}

/** `POST /finalize`, the route a chapter approved before reviews existed takes. */
export async function finalizeRoute(ctx: APIRequestContext, projectId: string, chapter: number): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  return mutate(ctx, 'post', `/api/v1/projects/${projectId}/finalize`, { data: { chapter } });
}

/**
 * A run `POST /finalize` started. The route declares 200 and 409 without an `@HttpStatus`, so the router answers 201 (the fixme in
 * finalize.spec.ts holds the declared 200); either is accepted here so the run itself can be asserted.
 */
export async function expectFinalizeRun(response: APIResponse, what: string): Promise<FinalizeAnswer> {
  expect([200, 201], `${what} — body ${await response.text()}`).toContain(response.status());
  return (await response.json()) as FinalizeAnswer;
}

/** {@link readyFinalizeReview} with items of any category and decision, returning each item's id by its key. */
export async function readyReviewWithItems(
  projectId: string,
  draft: Pick<Draft, 'chapter' | 'revision' | 'body'>,
  items: readonly ReviewItemSeed[],
): Promise<Record<string, string>> {
  await readyFinalizeReview(projectId, draft);
  const review = await readReviewRow(projectId, draft.chapter);
  if (!review) throw new ForgeDbError(`no finalize review of chapter ${draft.chapter} on project ${projectId}`);
  return insertReviewItems(review.id, items);
}

async function insertReviewItems(reviewId: string, items: readonly ReviewItemSeed[]): Promise<Record<string, string>> {
  if (items.length === 0) return {};
  const sql = novelForgeDb();
  const rows = await sql<{ id: string; itemKey: string }[]>`
    INSERT INTO finalize_review_items ${sql(
      items.map((item, position) => ({
        review_id: reviewId,
        item_key: item.key,
        position,
        category: item.category,
        triage: item.triage,
        basis: 'observed',
        subject_key: item.subjectKey,
        claim: item.claim,
        proposed: sql.json(item.proposed as never),
        flag: item.flag ?? null,
        dependents: item.dependents ? sql.json(item.dependents as never) : null,
        decision: item.decision ?? null,
        reason: item.reason ?? null,
        decided_at: item.decision ? new Date() : null,
      })),
    )}
    RETURNING id::text, item_key AS "itemKey"
  `;
  return Object.fromEntries(rows.map(row => [row.itemKey, row.id]));
}

/** A ready review bound to the draft as it stands, inserted outright — as an approval whose review was read would have left it. */
export async function insertReadyReview(projectId: string, draft: Pick<Draft, 'id' | 'chapter' | 'revision' | 'body'>): Promise<string> {
  const [row] = await novelForgeDb()<{ id: string }[]>`
    INSERT INTO finalize_reviews (project_id, chapter, draft_id, draft_revision, source_hash, status)
    VALUES (${projectId}, ${draft.chapter}, ${draft.id}, ${draft.revision}, ${hashBody(draft.body ?? '')}, 'ready')
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`finalize review insert for chapter ${draft.chapter} returned no row`);
  return row.id;
}

export async function readReviewRow(projectId: string, chapter: number): Promise<FinalizeReviewRow | undefined> {
  const [row] = await novelForgeDb()<FinalizeReviewRow[]>`
    SELECT id::text, status, draft_revision AS "draftRevision", applied FROM finalize_reviews
    WHERE project_id = ${projectId} AND chapter = ${chapter} AND NOT bridge_only ORDER BY id DESC LIMIT 1
  `;
  return row;
}

export async function readItemDecisions(reviewId: string): Promise<Record<string, ReviewDecision | null>> {
  const rows = await novelForgeDb()<{ itemKey: string; decision: ReviewDecision | null }[]>`
    SELECT item_key AS "itemKey", decision FROM finalize_review_items WHERE review_id = ${reviewId} ORDER BY position
  `;
  return Object.fromEntries(rows.map(row => [row.itemKey, row.decision]));
}

export async function setReviewStatus(projectId: string, chapter: number, status: ReviewStatus): Promise<void> {
  const updated =
    await novelForgeDb()`UPDATE finalize_reviews SET status = ${status}, updated_at = now() WHERE project_id = ${projectId} AND chapter = ${chapter} AND NOT bridge_only`;
  if (updated.count === 0) throw new ForgeDbError(`no finalize review of chapter ${chapter} to set ${status}`);
}

/** Rebinds the review to other prose, as a review read from text that has since moved would stand. */
export async function moveReviewedText(projectId: string, chapter: number): Promise<void> {
  const updated =
    await novelForgeDb()`UPDATE finalize_reviews SET source_hash = ${hashBody('prose that is no longer on the page')} WHERE project_id = ${projectId} AND chapter = ${chapter}`;
  if (updated.count === 0) throw new ForgeDbError(`no finalize review of chapter ${chapter} to move`);
}

export async function restoreReviewedText(projectId: string, draft: Pick<Draft, 'chapter' | 'body'>): Promise<void> {
  await novelForgeDb()`UPDATE finalize_reviews SET source_hash = ${hashBody(draft.body ?? '')} WHERE project_id = ${projectId} AND chapter = ${draft.chapter}`;
}

/** A chapter approved before finalize reviews existed has none, which sends finalize down the direct continuity path. */
export async function deleteFinalizeReviews(projectId: string, chapter: number): Promise<void> {
  await novelForgeDb()`DELETE FROM finalize_reviews WHERE project_id = ${projectId} AND chapter = ${chapter}`;
}

/** A `judge` review with one open blocking finding, bound to the text it read. */
export async function insertBlockingJudgeReview(projectId: string, draft: Pick<Draft, 'chapter' | 'revision' | 'body'>): Promise<string> {
  const sql = novelForgeDb();
  const findings = [{ id: BLOCKING_FINDING, severity: 'blocking', category: 'continuity', text: 'e2e blocking finding', evidence: null, fingerprint: `fp-${BLOCKING_FINDING}` }];
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO chapter_reviews (project_id, chapter, draft_revision, body_hash, isolated, kind, disposition, findings, checked)
    VALUES (${projectId}, ${draft.chapter}, ${draft.revision}, ${hashBody(draft.body ?? '')}, false, 'judge', 'blocking', ${sql.json(findings as never)}, ${sql.json([] as never)})
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`judge review insert for chapter ${draft.chapter} returned no row`);
  return row.id;
}

/** A novel-scope report as a validation run persists it; `agoMs` orders it against others, since finalize reads only the latest. */
export async function insertNovelValidationReport(projectId: string, issues: readonly ValidationIssueSeed[], agoMs = 0): Promise<void> {
  const sql = novelForgeDb();
  const payload = { issues, summary: 'e2e-seeded validation', windowsRequested: 1, windowsSucceeded: 1, failedRanges: [] };
  await sql`
    INSERT INTO validation_reports (project_id, scope, issues, summary, payload, created_at)
    VALUES (${projectId}, 'novel', ${issues.length}, 'e2e-seeded validation', ${sql.json(payload as never)}, now() - ${`${agoMs} milliseconds`}::interval)
  `;
}

export async function readChapterRow(projectId: string, number: number): Promise<ChapterRow | undefined> {
  const [row] = await novelForgeDb()<ChapterRow[]>`
    SELECT status, locked, continuity_applied AS "continuityApplied", needs_revalidation AS "needsRevalidation", title, content, summary, note,
           continuity_claimed_by AS "continuityClaimedBy", continuity_claimed_at AS "continuityClaimedAt"
    FROM chapters WHERE project_id = ${projectId} AND number = ${number}
  `;
  return row;
}

export async function setNeedsRevalidation(projectId: string, number: number, flagged: boolean): Promise<void> {
  const updated = await novelForgeDb()`UPDATE chapters SET needs_revalidation = ${flagged} WHERE project_id = ${projectId} AND number = ${number}`;
  if (updated.count === 0) throw new ForgeDbError(`no chapter ${number} on project ${projectId} to flag`);
}

/**
 * Another run's continuity claim on the chapter, taken `agoMs` before now on the clock the server writes claims with — the app's, in UTC,
 * into a column without a time zone.
 */
export async function setContinuityClaim(projectId: string, number: number, runId: string, agoMs: number): Promise<void> {
  const updated = await novelForgeDb()`
    UPDATE chapters SET continuity_claimed_by = ${runId}, continuity_claimed_at = timezone('utc', now()) - ${`${agoMs} milliseconds`}::interval
    WHERE project_id = ${projectId} AND number = ${number}
  `;
  if (updated.count === 0) throw new ForgeDbError(`no chapter ${number} on project ${projectId} to claim`);
}

export async function readStoryCursor(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ cursor: number }[]>`SELECT story_current_chapter AS cursor FROM projects WHERE id = ${projectId}`;
  return row?.cursor ?? 0;
}

export async function listFinalizationRuns(projectId: string, chapter: number): Promise<FinalizationRun[]> {
  return novelForgeDb()<FinalizationRun[]>`
    SELECT id::text, status, error FROM workflow_runs
    WHERE project_id = ${projectId} AND graph = 'chapter-finalization' AND target = ${`chapter-${chapter}`} ORDER BY started_at
  `;
}

export async function countDraftRevisions(projectId: string, chapter: number): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM draft_revisions r JOIN drafts d ON d.id = r.draft_id WHERE d.project_id = ${projectId} AND d.chapter = ${chapter}
  `;
  return row?.count ?? 0;
}

export interface NovelValidationReport {
  readonly issues: number;
  readonly summary: string | null;
  readonly payload: { issues: unknown[]; summary: string; windowsRequested: number; windowsSucceeded: number; failedRanges: { from: number; to: number }[] };
}

export async function readNovelValidationReports(projectId: string): Promise<NovelValidationReport[]> {
  return novelForgeDb()<
    NovelValidationReport[]
  >`SELECT issues, summary, payload FROM validation_reports WHERE project_id = ${projectId} AND scope = 'novel' ORDER BY created_at, id`;
}
