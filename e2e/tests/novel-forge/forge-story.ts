/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb, pollUntil } from '../../lib';
import { type ForgeActor, type ForgeHarness } from './forge-actors';
import { assertSpendGuarded, failPin } from './forge-db';
import { approveChapter, type Draft, type EntitySeed, expectStatus, readDraft, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

export type VolumeState = 'not_started' | 'active' | 'goal_met';

export type KnowledgeStatus = 'provisional' | 'committed';

export type FactSource = 'brief' | 'manual' | 'import' | 'seed' | 'generated';

export type PreviewPurpose = 'generation' | 'outline' | 'chat' | 'premise' | 'audit';

export interface UnlockCondition {
  all: ({ milestone: string } | { volume: string } | { chapter: number } | { ending: true })[];
}

export interface FactBody {
  text: string;
  subjects?: string[];
  constraintNote?: string;
  writerNote?: string;
  terms?: string[];
  revealChapter?: number | null;
  unlock?: UnlockCondition | null;
  allowedClues?: string[] | null;
}

export interface KnowledgeContract {
  pov: string[];
  learns?: { entityKey: string; factKey: string }[];
}

export interface EndingContract {
  hookType: 'cliffhanger' | 'revelation' | 'quiet_dread' | 'promise' | 'turn' | 'closure_with_momentum' | 'earned_rest';
  emotionalBeat: string;
  openQuestion: string;
  handoffState: string;
  mustNotResolve?: string[];
}

export interface BriefBody {
  body: string;
  title?: string;
  pov?: string;
  knowledgeContract?: KnowledgeContract;
  endingContract?: EndingContract | null;
  claimedMilestones?: string[] | null;
  isEnding?: boolean;
}

export interface PackSection {
  readonly key: string;
  readonly tier: string;
  readonly segment: string;
  readonly tokens: number;
  readonly truncated: boolean;
}

export interface ContextPreview {
  readonly purpose: string;
  readonly sections: PackSection[];
  readonly unresolvedRefs: string[];
  readonly omitted: { key: string; reason: string }[];
  readonly renderedStable: string;
  readonly renderedVolatile: string;
  readonly rendered: string;
}

export interface ChapterSeed {
  number: number;
  title?: string | null;
  summary?: string | null;
  content?: string;
  isolated?: boolean;
  volumeKey?: string | null;
}

export interface VolumeSeed {
  volumeKey: string;
  ordinal: number;
  title?: string;
  objective?: string | null;
  body?: string | null;
  state?: VolumeState;
}

export interface PromiseSeed {
  key: string;
  label: string;
  payoffWindow?: number | null;
  payoffMilestoneKey?: string | null;
  payoffVolumeKey?: string | null;
  /** How long ago the row was made; the promise list orders ties by it. */
  ageMs?: number;
}

export interface MysterySeed extends PromiseSeed {
  truthFactKey?: string | null;
}

export interface KnowledgeRow {
  readonly entityKey: string;
  readonly learnedInChapter: number;
  readonly source: FactSource;
  readonly status: KnowledgeStatus;
  readonly draftRevision: number | null;
}

export interface FactRow {
  readonly revealChapter: number | null;
  readonly plannedChapter: number | null;
  readonly disclosedInChapter: number | null;
}

export interface ContextPackRow {
  readonly purpose: string;
  readonly chapter: number | null;
  readonly rendered: string;
}

export interface FinalizeReviewItemSeed {
  category: 'milestone';
  subjectKey: string;
  claim: string;
  proposed: Record<string, unknown>;
  decision: 'kept' | 'skipped';
}

/**
 * Declaring the constants
 *
 * The story model as the chapter writer, the planner and the chat read it: canon facts, plans, entities, pages and volumes are written
 * through the API wherever a route exists, and only the rows no model-free route writes — a plan's cited refs, volumes, threads and
 * mysteries, finalized chapters, world facts — are arranged in the database. Every project here is fail-pinned and its owner quota-pinned,
 * even where the route only assembles context, and each context read asserts the guard right before it goes out.
 */

export const WITHHELD = '[withheld]';

/** How long an approval's finalize-review job takes to fail under the quota pin, with room for a busy executor. */
const REVIEW_SETTLE_MS = 30_000;

function ago(ms: number | undefined): string {
  return `${Math.max(0, Math.round(ms ?? 0))} milliseconds`;
}

/** A standard project owned by `owner`, fail-pinned on every role and with its owner stood at the AI call ceiling. */
export async function createGuardedProject(forge: ForgeHarness, owner: ForgeActor, label: string, data: Record<string, unknown> = {}): Promise<string> {
  const created = await mutate(owner.ctx, 'post', '/api/v1/projects', {
    data: { name: `e2e-forge-${label}-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', ...data },
  });
  expect(created.status(), await created.text()).toBe(201);
  const projectId = ((await created.json()) as { id: string }).id;
  await failPin(projectId);
  await forge.quotaPin(projectId);
  return projectId;
}

export function putFact(ctx: APIRequestContext, projectId: string, factKey: string, body: FactBody): Promise<APIResponse> {
  return mutate(ctx, 'put', `/api/v1/projects/${projectId}/facts/${factKey}`, { data: body });
}

export async function writeFact(ctx: APIRequestContext, projectId: string, factKey: string, body: FactBody): Promise<void> {
  const response = await putFact(ctx, projectId, factKey, body);
  expect(response.status(), `writing fact ${factKey} — body ${await response.text()}`).toBe(200);
}

export function putBrief(ctx: APIRequestContext, projectId: string, chapter: number, body: BriefBody): Promise<APIResponse> {
  return mutate(ctx, 'put', `/api/v1/projects/${projectId}/briefs/${chapter}`, { data: body });
}

export async function writeBrief(ctx: APIRequestContext, projectId: string, chapter: number, body: BriefBody): Promise<void> {
  const response = await putBrief(ctx, projectId, chapter, body);
  expect(response.status(), `writing the plan for chapter ${chapter} — body ${await response.text()}`).toBe(200);
}

export async function writeBibleDoc(ctx: APIRequestContext, projectId: string, section: string, slug: string, body: string): Promise<void> {
  const response = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/bible/${section}/${slug}`, { data: { body } });
  expect(response.status(), `writing page ${section}/${slug} — body ${await response.text()}`).toBe(200);
}

/** The refs a planner would have cited for the chapter; no hand-edit route writes them. */
export async function setBriefRefs(projectId: string, chapter: number, refs: readonly string[]): Promise<void> {
  const sql = novelForgeDb();
  const updated = await sql`UPDATE briefs SET context_refs = ${sql.json([...refs] as never)} WHERE project_id = ${projectId} AND chapter = ${chapter}`;
  expect(updated.count, `a plan for chapter ${chapter} to cite refs from`).toBe(1);
}

export async function setBriefVolume(projectId: string, chapter: number, volumeKey: string): Promise<void> {
  const updated = await novelForgeDb()`UPDATE briefs SET volume_key = ${volumeKey} WHERE project_id = ${projectId} AND chapter = ${chapter}`;
  expect(updated.count, `a plan for chapter ${chapter} to place in ${volumeKey}`).toBe(1);
}

/** The plan's contracts as stored, which `GET /briefs/:n` does not return the knowledge contract of. */
export async function readBriefContracts(projectId: string, chapter: number): Promise<{ knowledgeContract: unknown; endingContract: unknown } | undefined> {
  const [row] = await novelForgeDb()<{ knowledgeContract: unknown; endingContract: unknown }[]>`
    SELECT knowledge_contract AS "knowledgeContract", ending_contract AS "endingContract" FROM briefs WHERE project_id = ${projectId} AND chapter = ${chapter}
  `;
  return row;
}

export async function readBriefStale(projectId: string, chapter: number): Promise<string | null | undefined> {
  const [row] = await novelForgeDb()<{ staleReason: string | null }[]>`SELECT stale_reason AS "staleReason" FROM briefs WHERE project_id = ${projectId} AND chapter = ${chapter}`;
  return row?.staleReason;
}

/** The context pack a model call would read. Only `generation` is a dry run; the other purposes persist a `context_packs` row, keyed by content. */
export async function previewContext(ctx: APIRequestContext, projectId: string, purpose: PreviewPurpose, query: Record<string, string | number> = {}): Promise<ContextPreview> {
  const response = await readPreview(ctx, projectId, purpose, query);
  expect(response.status(), `previewing the ${purpose} pack — body ${await response.text()}`).toBe(200);
  return (await response.json()) as ContextPreview;
}

export async function readPreview(ctx: APIRequestContext, projectId: string, purpose: string, query: Record<string, string | number> = {}): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  const params = new URLSearchParams({ purpose, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
  return ctx.get(`/api/v1/projects/${projectId}/context/preview?${params.toString()}`);
}

export function writerPack(ctx: APIRequestContext, projectId: string, chapter: number): Promise<ContextPreview> {
  return previewContext(ctx, projectId, 'generation', { chapter });
}

export async function writerPrompt(ctx: APIRequestContext, projectId: string, chapter: number): Promise<string> {
  await assertSpendGuarded(projectId);
  const response = await ctx.get(`/api/v1/projects/${projectId}/drafts/${chapter}/prompt`);
  expect(response.status(), `reading the chapter ${chapter} writer prompt — body ${await response.text()}`).toBe(200);
  return ((await response.json()) as { markdown: string }).markdown;
}

/** Approves the revision read and confirms it from the draft. */
export async function approveAsRead(ctx: APIRequestContext, projectId: string, draft: Draft): Promise<Draft> {
  await assertSpendGuarded(projectId);
  await expectStatus(await approveChapter(ctx, projectId, draft), 200, `approving chapter ${draft.chapter}`);
  const approved = await readDraft(ctx, projectId, draft.chapter);
  expect(approved, `the approval of chapter ${draft.chapter} committed`).toMatchObject({ reviewStatus: 'approved', approvedRevision: draft.revision });
  return approved;
}

/**
 * Finalizes a chapter with no model call: approves the read revision, waits for its finalize-review job to fail under the fail-pin, marks the
 * review ready with no items, and finalizes through it. Real application logic throughout — only the model's finalize-review read is stood in
 * for by {@link readyFinalizeReview}. Callers only need "this chapter is final"; the finalize-review mechanics belong to batch 5.
 */
export async function finalizeChapterNoReview(ctx: APIRequestContext, projectId: string, draft: Draft): Promise<Draft> {
  const approved = await approveAsRead(ctx, projectId, draft);
  await readyFinalizeReview(projectId, approved);
  await assertSpendGuarded(projectId);
  const finalized = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/${approved.chapter}/finalize-review/finalize`, { data: {} });
  expect(finalized.status(), `finalizing chapter ${approved.chapter} — body ${await finalized.text()}`).toBe(200);
  return readDraft(ctx, projectId, approved.chapter);
}

/**
 * A `drafts` row at `status: 'final'` alongside its matching finalized `chapters` row, for tests that need "this chapter is already final" as a
 * precondition without paying for a real finalize (used repeatedly across the chapter-lifecycle specs). Bypasses the app entirely — it arranges
 * a state the finalize pipeline would leave, it does not assert that the pipeline produces it.
 */
export async function insertFinalDraft(projectId: string, chapter: number, body = `Chapter ${chapter}, finalized by arrangement.`): Promise<void> {
  await insertFinalChapters(projectId, [{ number: chapter, content: body, summary: 'Finalized by arrangement.' }]);
  await novelForgeDb()`
    INSERT INTO drafts (project_id, chapter, status, revision, save_seq, approved_revision, summary, body, generator, isolated, review_status)
    VALUES (${projectId}, ${chapter}, 'final', 1, 1, 1, 'Finalized by arrangement.', ${body}, 'human', false, 'final')
  `;
}

/** A pending `continuity_proposals` row for a chapter, for tests that only need one to exist (no route creates one directly). */
export async function insertContinuityProposal(projectId: string, chapter: number): Promise<void> {
  const sql = novelForgeDb();
  await sql`
    INSERT INTO continuity_proposals (project_id, chapter, status, proposal)
    VALUES (${projectId}, ${chapter}, 'pending', ${sql.json({ relationships: [] } as never)})
  `;
}

export function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

export async function insertEntities(projectId: string, seeds: readonly EntitySeed[]): Promise<void> {
  if (seeds.length === 0) return;
  const sql = novelForgeDb();
  const rows = seeds.map(seed => ({
    project_id: projectId,
    entity_key: seed.entityKey,
    type: seed.type ?? 'character',
    name: seed.name,
    significance: seed.significance ?? null,
    body: seed.body ?? null,
  }));
  await sql`INSERT INTO entities ${sql(rows)}`;
}

/** Chapters as a finished import leaves them: done and locked, which also moves the plan frontier past them. */
export async function insertFinalChapters(projectId: string, seeds: readonly ChapterSeed[]): Promise<void> {
  if (seeds.length === 0) return;
  const sql = novelForgeDb();
  const rows = seeds.map(seed => {
    const content = seed.content ?? `Chapter ${seed.number} prose, as finalized.`;
    return {
      project_id: projectId,
      number: seed.number,
      title: seed.title ?? null,
      content,
      summary: seed.summary ?? null,
      word_count: content.split(/\s+/).filter(Boolean).length,
      status: 'done',
      generator: 'human',
      isolated: seed.isolated ?? false,
      locked: true,
      continuity_applied: true,
      volume_key: seed.volumeKey ?? null,
    };
  });
  await sql`INSERT INTO chapters ${sql(rows)}`;
}

export async function insertVolumes(projectId: string, seeds: readonly VolumeSeed[]): Promise<void> {
  if (seeds.length === 0) return;
  const sql = novelForgeDb();
  const rows = seeds.map(seed => ({
    project_id: projectId,
    volume_key: seed.volumeKey,
    ordinal: seed.ordinal,
    title: seed.title ?? null,
    objective: seed.objective ?? null,
    body: seed.body ?? null,
    state: seed.state ?? 'not_started',
  }));
  await sql`INSERT INTO volumes ${sql(rows)}`;
}

export async function insertWorldFacts(projectId: string, seeds: readonly { category: string; key: string; value: string }[]): Promise<void> {
  if (seeds.length === 0) return;
  const sql = novelForgeDb();
  await sql`INSERT INTO world_facts ${sql(seeds.map(seed => ({ project_id: projectId, ...seed })))}`;
}

export async function insertThread(projectId: string, seed: PromiseSeed): Promise<void> {
  await novelForgeDb()`
    INSERT INTO plot_threads (project_id, thread_key, status, opened_chapter, summary, payoff_window, payoff_milestone_key, payoff_volume_key, created_at, updated_at)
    VALUES (
      ${projectId}, ${seed.key}, 'open', 1, ${seed.label}, ${seed.payoffWindow ?? null}, ${seed.payoffMilestoneKey ?? null}, ${seed.payoffVolumeKey ?? null},
      now() - ${ago(seed.ageMs)}::interval, now() - ${ago(seed.ageMs)}::interval
    )
  `;
}

export async function insertMystery(projectId: string, seed: MysterySeed): Promise<void> {
  await novelForgeDb()`
    INSERT INTO mysteries (project_id, mystery_key, question, status, opened_chapter, truth_fact_key, payoff_window, payoff_milestone_key, payoff_volume_key, created_at, updated_at)
    VALUES (
      ${projectId}, ${seed.key}, ${seed.label}, 'open', 1, ${seed.truthFactKey ?? null}, ${seed.payoffWindow ?? null}, ${seed.payoffMilestoneKey ?? null},
      ${seed.payoffVolumeKey ?? null}, now() - ${ago(seed.ageMs)}::interval, now() - ${ago(seed.ageMs)}::interval
    )
  `;
}

export async function readKnowledge(projectId: string, factKey: string): Promise<KnowledgeRow[]> {
  return novelForgeDb()<KnowledgeRow[]>`
    SELECT e.entity_key AS "entityKey", k.learned_in_chapter AS "learnedInChapter", k.source, k.status, k.draft_revision AS "draftRevision"
    FROM character_knowledge k JOIN canon_facts f ON f.id = k.fact_id JOIN entities e ON e.id = k.entity_id
    WHERE k.project_id = ${projectId} AND f.fact_key = ${factKey}
    ORDER BY e.entity_key
  `;
}

export async function countKnowledge(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM character_knowledge WHERE project_id = ${projectId}`;
  return row?.count ?? 0;
}

export async function readFactRow(projectId: string, factKey: string): Promise<FactRow | undefined> {
  const [row] = await novelForgeDb()<FactRow[]>`
    SELECT reveal_chapter AS "revealChapter", planned_chapter AS "plannedChapter", disclosed_in_chapter AS "disclosedInChapter"
    FROM canon_facts WHERE project_id = ${projectId} AND fact_key = ${factKey}
  `;
  return row;
}

export async function readContextPacks(projectId: string): Promise<ContextPackRow[]> {
  return novelForgeDb()<ContextPackRow[]>`SELECT purpose, chapter, rendered FROM context_packs WHERE project_id = ${projectId} ORDER BY id`;
}

export async function readFinalizeReviewStatus(projectId: string, chapter: number): Promise<string | undefined> {
  const [row] = await novelForgeDb()<{ status: string }[]>`
    SELECT status FROM finalize_reviews WHERE project_id = ${projectId} AND chapter = ${chapter} AND NOT bridge_only ORDER BY id DESC LIMIT 1
  `;
  return row?.status;
}

/**
 * Stands in for the model's finalize-review read: waits for the approval's review job to fail under the spend guard (a review still
 * preparing would overwrite a ready one), then marks the review ready for exactly the approved prose, carrying `items` already decided.
 */
export async function readyFinalizeReview(projectId: string, draft: Pick<Draft, 'chapter' | 'revision' | 'body'>, items: readonly FinalizeReviewItemSeed[] = []): Promise<void> {
  const settled = await pollUntil(
    () => readFinalizeReviewStatus(projectId, draft.chapter),
    status => status === 'failed',
    { timeoutMs: REVIEW_SETTLE_MS, intervalMs: 500 },
  );
  expect(settled, `the finalize review of chapter ${draft.chapter} fails under the spend guard`).toBe('failed');

  const sql = novelForgeDb();
  const sourceHash = createHash('sha256')
    .update(draft.body ?? '')
    .digest('hex');
  const [review] = await sql<{ id: string }[]>`
    UPDATE finalize_reviews SET status = 'ready', error = NULL, source_hash = ${sourceHash}, updated_at = now()
    WHERE project_id = ${projectId} AND chapter = ${draft.chapter} AND draft_revision = ${draft.revision} AND NOT bridge_only
    RETURNING id::text
  `;
  expect(review, `a finalize review bound to revision ${draft.revision}`).toBeDefined();
  if (!review || items.length === 0) return;
  await sql`
    INSERT INTO finalize_review_items ${sql(
      items.map((item, position) => ({
        review_id: review.id,
        item_key: `e2e-${position}`,
        position,
        category: item.category,
        triage: 'routine',
        basis: 'observed',
        subject_key: item.subjectKey,
        claim: item.claim,
        proposed: sql.json(item.proposed as never),
        decision: item.decision,
        decided_at: new Date(),
      })),
    )}
  `;
}

/** How many `approved` `user_feedback` rows a chapter's draft has recorded — the row an approval writes exactly one of per call. */
export async function countApprovals(projectId: string, chapter: number): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM user_feedback WHERE project_id = ${projectId} AND artifact_type = 'draft' AND artifact_ref = ${String(chapter)} AND disposition = 'approved'
  `;
  return row?.count ?? 0;
}

export async function restoreVersionAsRead(ctx: APIRequestContext, projectId: string, chapter: number, revision: number, base?: Draft): Promise<Draft> {
  const data = base ? { baseDraftId: base.id, baseRevision: base.revision, baseSaveSeq: base.saveSeq } : {};
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/${chapter}/versions/${revision}/restore`, { data });
  await expectStatus(response, 200, `restoring revision ${revision} of chapter ${chapter}`);
  return readDraft(ctx, projectId, chapter);
}

export async function applySuggestionAsRead(ctx: APIRequestContext, projectId: string, chapter: number, suggestionId: string, base: Draft): Promise<Draft> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/${chapter}/passage-suggestions/${suggestionId}/apply`, {
    data: { baseDraftId: base.id, baseRevision: base.revision, baseSaveSeq: base.saveSeq },
  });
  await expectStatus(response, 200, `applying suggestion ${suggestionId} on chapter ${chapter}`);
  return readDraft(ctx, projectId, chapter);
}

/** `Draft` (`forge-helpers.ts`) omits `staleReason`, which the API does return — read through this instead of an ad hoc cast. */
export interface StaleDraft extends Draft {
  readonly staleReason: string | null;
}

export async function readStaleDraft(ctx: APIRequestContext, projectId: string, chapter: number): Promise<StaleDraft> {
  return (await readDraft(ctx, projectId, chapter)) as StaleDraft;
}
