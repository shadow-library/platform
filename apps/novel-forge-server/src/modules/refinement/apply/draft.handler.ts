import { and, eq, ne, sql } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { assertStartsNextChapter, markDescendantDraftsStale, normalizeLineEndings, pruneDraftHistory, refusedDraftWriteError, revokeProvisionalReveals } from '@server/common';
import { type Generation, type Project, schema } from '@server/database';

import { baseOfDraft, lockDraft, saveHandWrittenDraft } from '../../generation/draft-save';
import { holdNewLeaks } from '../../generation/passage-leaks';
import { type ContentOp, type DraftRemoveOp, type DraftRewritePassageOp, type DraftUpdateOp } from '../change-set';
import { rewrittenBody } from '../passage-rewrite';
import { keptOr } from './apply-rules';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

// A restore carries the draft's containment (`isolated`, `generator`) so reverting a removal brings an isolated draft back isolated, whatever the op's author wrote.
type DraftRestoreOp = Restorable<DraftUpdateOp, 'title' | 'summary'> & { isolated?: boolean; generator?: Project.ContentGenerator };

function draftRestoreOp(draft: Generation.Draft): ContentOp {
  const inverse: DraftRestoreOp = {
    op: 'draft.update',
    chapter: draft.chapter,
    title: draft.title,
    body: draft.body,
    summary: draft.summary,
    isolated: draft.isolated,
    generator: draft.generator,
  };
  return inverse as ContentOp;
}

async function inverseDraft(ctx: ApplyContext, op: DraftUpdateOp | DraftRemoveOp | DraftRewritePassageOp): Promise<ContentOp | null> {
  const draft = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
  if (!draft) return op.op === 'draft.update' ? { op: 'draft.remove', chapter: op.chapter } : null;
  return draftRestoreOp(draft);
}

/** Draft prose is chat-editable only while a draft: a final draft, or a chapter at/behind the story cursor, is locked canon. */
async function applyDraftUpdate(ctx: ApplyContext, op: DraftRestoreOp): Promise<void> {
  const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
  if (!project) throw AppErrorCode.PRJ_001.create();
  if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_010.create();

  const body = normalizeLineEndings(op.body);
  const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
  if (existing?.status === 'final') throw AppErrorCode.RFN_010.create();
  if (!existing && body === undefined) throw AppErrorCode.RFN_004.create();
  if (existing?.isolated && body !== undefined && body !== existing.body) throw AppErrorCode.RFN_012.create();

  const merged = { title: keptOr(op.title, existing?.title), body: body ?? existing?.body ?? '', summary: keptOr(op.summary, existing?.summary) };

  let written: { id: bigint; revision: number; saveSeq: number } | undefined;
  if (existing) {
    [written] = await ctx.tx
      .update(schema.drafts)
      .set({ ...merged, revision: sql`${schema.drafts.revision} + 1`, reviewStatus: 'needs_review', staleReason: null, updatedAt: new Date() })
      .where(and(eq(schema.drafts.id, existing.id), eq(schema.drafts.revision, existing.revision), eq(schema.drafts.saveSeq, existing.saveSeq), ne(schema.drafts.status, 'final')))
      .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
    if (!written) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
  } else {
    await assertStartsNextChapter(ctx.tx, ctx.projectId, op.chapter);
    [written] = await ctx.tx
      .insert(schema.drafts)
      .values({
        projectId: ctx.projectId,
        chapter: op.chapter,
        ...merged,
        status: 'draft',
        revision: 1,
        reviewStatus: 'needs_review',
        generator: op.generator ?? 'standard',
        isolated: op.isolated ?? false,
      })
      .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
    if (!written) throw AppErrorCode.DRF_001.create();
  }

  await ctx.tx
    .insert(schema.draftRevisions)
    .values({
      projectId: ctx.projectId,
      draftId: written.id,
      revision: written.revision,
      source: 'chat_edited',
      title: merged.title,
      body: merged.body,
      summary: merged.summary,
      isolated: existing?.isolated ?? op.isolated ?? false,
    })
    .onConflictDoNothing();
  await pruneDraftHistory(ctx.tx, { id: written.id, revision: written.revision, approvedRevision: existing?.approvedRevision ?? null });
  await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was chat_edited`);
  if (existing) await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
  ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: written.revision, newSaveSeq: written.saveSeq, newDraftId: written.id });
}

async function applyDraftRemove(ctx: ApplyContext, op: DraftRemoveOp): Promise<void> {
  const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
  if (!existing) throw AppErrorCode.DRF_001.create();
  if (existing.status === 'final') throw AppErrorCode.RFN_010.create();

  const removed = await ctx.tx
    .delete(schema.drafts)
    .where(and(eq(schema.drafts.id, existing.id), ne(schema.drafts.status, 'final')))
    .returning({ id: schema.drafts.id });
  if (removed.length === 0) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
  await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was removed`);
  await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
  ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: null });
}

/**
 * Writes selected rewrites as one revision under the row lock; refused (`RFN_021`) for a missing passage, overlapping rewrites, or a final, isolated or being-written draft.
 * The inverse is read from the locked row, so a revert keeps an autosave committed before the lock.
 */
export async function applyPassageRewrites(ctx: ApplyContext, ops: readonly DraftRewritePassageOp[]): Promise<ContentOp | null> {
  const [first] = ops;
  if (!first) return null;
  const { chapter } = first;
  const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
  if (!project) throw AppErrorCode.PRJ_001.create();
  if (chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_010.create();

  const tx = ctx.tx;
  const current = await lockDraft(tx, ctx.projectId, chapter);
  if (current.status === 'final') throw AppErrorCode.RFN_010.create();
  if (current.isolated) throw AppErrorCode.RFN_012.create();
  const inverse = draftRestoreOp(current);
  const body = rewrittenBody(current, ops);
  const saved = await saveHandWrittenDraft(tx, { projectId: ctx.projectId, chapter, source: 'passage_rewritten', base: baseOfDraft(current), fields: { body } });
  const written = await holdNewLeaks(tx, saved, ops);
  ctx.applied.push({ artifactRef: `draft:${chapter}`, newRevision: written.revision, newSaveSeq: written.saveSeq, newDraftId: written.id });
  return inverse;
}

export const DRAFT_HANDLERS: ContentOpHandlers<'draft.update' | 'draft.remove' | 'draft.rewrite_passage'> = {
  'draft.update': { apply: applyDraftUpdate, inverse: inverseDraft },
  'draft.remove': { apply: applyDraftRemove, inverse: inverseDraft },
  'draft.rewrite_passage': { apply: (ctx, op) => applyPassageRewrites(ctx, [op]).then(() => undefined), inverse: inverseDraft },
};
