import { and, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { changedCluesNamingTerms, normalizeStringList } from '@server/common';
import { schema } from '@server/database';

import { type ContentOp, type FactRemoveOp, type FactUpsertOp } from '../change-set';
import { keptOr } from './apply-rules';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

type FactRestoreOp = Restorable<FactUpsertOp, 'subjects' | 'constraintNote' | 'terms'>;

async function inverseFact(ctx: ApplyContext, op: FactUpsertOp | FactRemoveOp): Promise<ContentOp | null> {
  const fact = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
  if (!fact) return op.op === 'fact.upsert' ? { op: 'fact.remove', factKey: op.factKey } : null;
  const inverse: FactRestoreOp = {
    op: 'fact.upsert',
    factKey: op.factKey,
    body: fact.text,
    subjects: fact.subjects as string[] | null,
    constraintNote: fact.constraintNote,
    writerNote: fact.writerNote ?? '',
    terms: fact.terms as string[] | null,
    // Always explicit: an omitted schedule would merge as "keep", leaving a reverted date in place.
    revealChapter: fact.revealChapter,
    unlock: fact.unlock,
    allowedClues: fact.allowedClues,
  };
  return inverse as ContentOp;
}

/** Mirrors FactService.upsert's field merge on the apply transaction — reveals stay out of the grammar. */
async function applyFactUpsert(ctx: ApplyContext, op: FactRestoreOp): Promise<void> {
  const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
  if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

  const merged = {
    text: op.body ?? existing?.text ?? '',
    subjects: keptOr(op.subjects, existing?.subjects as string[] | null | undefined) as never,
    constraintNote: keptOr(op.constraintNote, existing?.constraintNote),
    writerNote: op.writerNote === undefined ? (existing?.writerNote ?? null) : op.writerNote.trim() || null,
    terms: keptOr(op.terms, existing?.terms as string[] | null | undefined) as never,
    revealChapter: op.revealChapter === undefined ? (existing?.revealChapter ?? null) : op.revealChapter,
    unlock: op.unlock === undefined ? (existing?.unlock ?? null) : op.unlock,
    allowedClues: op.allowedClues === undefined ? (existing?.allowedClues ?? null) : op.allowedClues && normalizeStringList(op.allowedClues),
  };
  const giveaways = changedCluesNamingTerms(existing, merged);
  if (giveaways.length > 0) throw AppErrorCode.FCT_006.create({ reason: giveaways.join('; ') });

  if (existing) {
    await ctx.tx
      .update(schema.canonFacts)
      .set({ ...merged, updatedAt: new Date() })
      .where(eq(schema.canonFacts.id, existing.id));
  } else {
    await ctx.tx.insert(schema.canonFacts).values({ projectId: ctx.projectId, factKey: op.factKey, ...merged });
  }
  ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
}

/** The inverse restores only the fact row but deleting cascades its knowledge ledger, so a ledgered fact is refused: retract its reveals first. */
async function applyFactRemove(ctx: ApplyContext, op: FactRemoveOp): Promise<void> {
  const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
  if (!existing) throw AppErrorCode.FCT_001.create();

  const ledgered = await ctx.tx.query.characterKnowledge.findFirst({ where: eq(schema.characterKnowledge.factId, existing.id) });
  if (ledgered) throw AppErrorCode.FCT_003.create();

  await ctx.tx.delete(schema.canonFacts).where(eq(schema.canonFacts.id, existing.id));
  ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
}

export const FACT_HANDLERS: ContentOpHandlers<'fact.upsert' | 'fact.remove'> = {
  'fact.upsert': { apply: applyFactUpsert, inverse: inverseFact },
  'fact.remove': { apply: applyFactRemove, inverse: inverseFact },
};
