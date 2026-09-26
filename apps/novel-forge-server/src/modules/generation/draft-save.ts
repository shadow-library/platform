import { isDeepStrictEqual } from 'node:util';

import { and, desc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode, DraftConflictError, SummaryConflictError } from '@server/classes';
import { assertStartsNextChapter, markDescendantDraftsStale, revokeProvisionalReveals } from '@server/common';
import { type Generation, type PrimaryTransaction, schema } from '@server/database';

export const HAND_EDIT_FOLD_WINDOW_SECONDS = 600;

const DEADLOCK_DETECTED = '40P01';

export type HandSaveSource = 'hand_edited' | 'imported';

export type HandSaveFields = Pick<typeof schema.drafts.$inferInsert, 'title' | 'summary' | 'state' | 'generator' | 'contentRating' | 'isolated'> & { body: string };

export interface DraftBase {
  draftId: bigint;
  revision: number;
  saveSeq: number;
}

export interface HandSaveBase {
  baseDraftId?: bigint;
  baseRevision?: number;
  baseSaveSeq?: number;
}

export interface HandSave {
  projectId: bigint;
  chapter: number;
  source: HandSaveSource;
  fields: HandSaveFields;
  base?: DraftBase;
}

/** The three base fields name one read of one draft, so a save sends all of them or none. */
export function draftBaseOf(body: HandSaveBase): DraftBase | undefined {
  const { baseDraftId, baseRevision, baseSaveSeq } = body;
  if (baseDraftId === undefined && baseRevision === undefined && baseSaveSeq === undefined) return undefined;
  if (baseDraftId === undefined || baseRevision === undefined || baseSaveSeq === undefined) throw AppErrorCode.DRF_020.create();
  return { draftId: baseDraftId, revision: baseRevision, saveSeq: baseSaveSeq };
}

/** The author's own write to a chapter, refused unless it was made against the draft as it stands; an autosave may fold into the revision it continues. */
export async function saveHandWrittenDraft(tx: PrimaryTransaction, save: HandSave): Promise<Generation.Draft> {
  const [current] = await tx
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.projectId, save.projectId), eq(schema.drafts.chapter, save.chapter)))
    .for('update');
  if (!current) return startDraft(tx, save);
  if (current.status === 'final') throw AppErrorCode.DRF_002.create();
  if (current.reviewStatus === 'generating') throw AppErrorCode.DRF_019.create({ chapter: String(save.chapter) });
  if (save.base && !isBase(current, save.base)) throw new DraftConflictError(current);
  await assertNotBeingGenerated(tx, save.projectId, save.chapter);
  if (save.source === 'hand_edited' && isUnchanged(current, save.fields)) return current;
  const folds = await foldsIntoCurrent(tx, current, save);
  const [draft] = await tx
    .update(schema.drafts)
    .set({
      ...save.fields,
      ...(folds ? {} : { revision: current.revision + 1, reviewStatus: 'needs_review' as const }),
      saveSeq: current.saveSeq + 1,
      judge: null,
      judgeNote: null,
      staleReason: null,
      updatedAt: new Date(),
    })
    .where(unchangedSince(current))
    .returning();
  if (!draft) throw await refusedHandSave(tx, save.projectId, save.chapter);
  return folds ? rewriteRevision(tx, draft) : recordRevision(tx, draft, save.source);
}

export interface SummarySave {
  projectId: bigint;
  chapter: number;
  summary: string;
  /** The prose the summary describes. Set only for an AI summary — refused as a conflict, carrying the summary, if the draft's body has since moved. A hand-written summary omits it. */
  body?: string;
  base?: DraftBase;
}

/** Writes only the summary column — never the prose revision or review status — so it applies mid-review and on a finalized chapter alike; a final chapter's `chapters` row is kept in step for later chapters' context packs. */
export async function saveDraftSummary(tx: PrimaryTransaction, save: SummarySave): Promise<Generation.Draft & { summary: string }> {
  // Locked ahead of the draft below, matching amend's chapters-then-draft order, whether or not this chapter turns out to be final.
  await tx
    .select({ id: schema.chapters.id })
    .from(schema.chapters)
    .where(and(eq(schema.chapters.projectId, save.projectId), eq(schema.chapters.number, save.chapter)))
    .for('update');

  const [current] = await tx
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.projectId, save.projectId), eq(schema.drafts.chapter, save.chapter)))
    .for('update');
  if (!current) throw AppErrorCode.DRF_001.create();
  if (current.reviewStatus === 'generating') throw AppErrorCode.DRF_019.create({ chapter: String(save.chapter) });
  await assertNotBeingGenerated(tx, save.projectId, save.chapter);
  if (save.base && !isBase(current, save.base)) throw new DraftConflictError(current);
  if (save.body !== undefined && save.body !== current.body) throw new SummaryConflictError(current, save.summary);

  const updated = { ...current, summary: save.summary, saveSeq: current.saveSeq + 1, updatedAt: new Date() };
  await tx.update(schema.drafts).set({ summary: updated.summary, saveSeq: updated.saveSeq, updatedAt: updated.updatedAt }).where(eq(schema.drafts.id, current.id));

  if (current.status === 'final') {
    await tx
      .update(schema.chapters)
      .set({ summary: save.summary, updatedAt: new Date() })
      .where(and(eq(schema.chapters.projectId, save.projectId), eq(schema.chapters.number, save.chapter)));
  }

  return updated;
}

function isBase(current: Generation.Draft, base: DraftBase): boolean {
  return current.id === base.draftId && current.revision === base.revision && current.saveSeq === base.saveSeq;
}

function isUnchanged(current: Generation.Draft, fields: HandSaveFields): boolean {
  return Object.entries(fields).every(([field, value]) => value === undefined || isDeepStrictEqual(current[field as keyof Generation.Draft], value));
}

function unchangedSince(current: Generation.Draft): SQL | undefined {
  return and(eq(schema.drafts.id, current.id), eq(schema.drafts.revision, current.revision), eq(schema.drafts.saveSeq, current.saveSeq), ne(schema.drafts.status, 'final'));
}

async function refusedHandSave(tx: PrimaryTransaction, projectId: bigint, chapter: number): Promise<AppError> {
  const current = await tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
  if (!current) return AppErrorCode.DRF_001.create();
  if (current.status === 'final') return AppErrorCode.DRF_002.create();
  return new DraftConflictError(current);
}

async function startDraft(tx: PrimaryTransaction, save: HandSave): Promise<Generation.Draft> {
  if (save.base) throw AppErrorCode.DRF_001.create();
  await assertStartsNextChapter(tx, save.projectId, save.chapter);
  return insertHandWrittenDraft(tx, save);
}

/** Creates the chapter's first draft, never over one that landed first nor under an AI already writing it; the caller has settled that the chapter is next. */
export async function insertHandWrittenDraft(tx: PrimaryTransaction, save: Omit<HandSave, 'base'>): Promise<Generation.Draft> {
  await assertNotBeingGenerated(tx, save.projectId, save.chapter);
  const [draft] = await tx
    .insert(schema.drafts)
    .values({ projectId: save.projectId, chapter: save.chapter, generator: 'human', ...save.fields, status: 'draft', reviewStatus: 'needs_review', staleReason: null })
    .onConflictDoNothing()
    .returning();
  if (!draft) throw await refusedHandSave(tx, save.projectId, save.chapter);
  return recordRevision(tx, draft, save.source);
}

export async function assertNotBeingGenerated(tx: Pick<PrimaryTransaction, 'query'>, projectId: bigint, chapter: number): Promise<void> {
  const generating = await tx.query.jobs.findMany({
    where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'generate'), inArray(schema.jobs.status, ['pending', 'in_progress'])),
    columns: { target: true },
  });
  if (generating.some(job => job.target.split(',').map(Number).includes(chapter))) throw AppErrorCode.DRF_019.create({ chapter: String(chapter) });
}

/** The loser of a Postgres deadlock gets DRF_021 — retryable, unlike DRF_013's stale-base conflict. */
export function asRetryableSave(error: unknown): never {
  if (isDeadlock(error)) throw AppErrorCode.DRF_021.create();
  throw error;
}

function isDeadlock(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, errno, cause } = error as { code?: unknown; errno?: unknown; cause?: unknown };
  return code === DEADLOCK_DETECTED || errno === DEADLOCK_DETECTED || (cause !== error && isDeadlock(cause));
}

/** A save folds only into the author's own recent hand edit that nobody has approved, reviewed or marked stale since. */
async function foldsIntoCurrent(tx: PrimaryTransaction, current: Generation.Draft, save: HandSave): Promise<boolean> {
  if (save.source !== 'hand_edited' || !save.base) return false;
  if (current.reviewStatus !== 'needs_review' || current.staleReason !== null) return false;
  if (current.approvedRevision !== null && current.approvedRevision >= current.revision) return false;

  const revisions = schema.draftRevisions;
  const [latest] = await tx
    .select({
      revision: revisions.revision,
      source: revisions.source,
      recent: sql<boolean>`${revisions.createdAt} > now() - make_interval(secs => ${HAND_EDIT_FOLD_WINDOW_SECONDS})`,
    })
    .from(revisions)
    .where(eq(revisions.draftId, current.id))
    .orderBy(desc(revisions.revision))
    .limit(1);
  if (!latest?.recent || latest.revision !== current.revision || latest.source !== 'hand_edited') return false;

  const reviews = schema.chapterReviews;
  const [reviewed] = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.projectId, current.projectId), eq(reviews.chapter, current.chapter), eq(reviews.draftRevision, current.revision)))
    .limit(1);
  return !reviewed;
}

/** A fold keeps its revision's single history row, but the cascade still runs: both steps are idempotent, and something may have refreshed a later draft since. */
async function rewriteRevision(tx: PrimaryTransaction, draft: Generation.Draft): Promise<Generation.Draft> {
  await tx
    .update(schema.draftRevisions)
    .set({ body: draft.body, summary: draft.summary })
    .where(and(eq(schema.draftRevisions.draftId, draft.id), eq(schema.draftRevisions.revision, draft.revision)));
  return cascade(tx, draft, 'hand_edited');
}

async function recordRevision(tx: PrimaryTransaction, draft: Generation.Draft, source: HandSaveSource): Promise<Generation.Draft> {
  await tx
    .insert(schema.draftRevisions)
    .values({ projectId: draft.projectId, draftId: draft.id, revision: draft.revision, source, body: draft.body, summary: draft.summary })
    .onConflictDoNothing();
  return cascade(tx, draft, source);
}

async function cascade(tx: PrimaryTransaction, draft: Generation.Draft, source: HandSaveSource): Promise<Generation.Draft> {
  await markDescendantDraftsStale(tx, draft.projectId, draft.chapter, `ancestor chapter ${draft.chapter} was ${source}`);
  await revokeProvisionalReveals(tx, draft.projectId, draft.chapter);
  return draft;
}
