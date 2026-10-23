import { and, eq, sql } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { computeBibleDocHash } from '@server/common';
import { schema } from '@server/database';

import { type BibleDocumentRemoveOp, type BibleDocumentUpsertOp, type ContentOp } from '../change-set';
import { type ApplyContext, type ContentOpHandlers, type Restorable } from './apply.types';

type BibleDocumentRestoreOp = Restorable<BibleDocumentUpsertOp, 'frontmatter' | 'body'>;

async function inverseBibleDoc(ctx: ApplyContext, op: BibleDocumentUpsertOp | BibleDocumentRemoveOp): Promise<ContentOp | null> {
  const doc = await ctx.tx.query.bibleDocuments.findFirst({
    where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)),
  });
  if (!doc) return op.op === 'bible_document.upsert' ? { op: 'bible_document.remove', section: op.section, slug: op.slug } : null;
  const inverse: BibleDocumentRestoreOp = {
    op: 'bible_document.upsert',
    section: op.section,
    slug: op.slug,
    frontmatter: doc.frontmatter as Record<string, unknown> | null,
    body: doc.body,
  };
  return inverse as ContentOp;
}

// Deliberately does not derive a title into frontmatter here: this op also replays as an inverse op
// on revert/rollback, and that replay must restore the prior row's exact frontmatter, byte for byte.
async function applyBibleDocUpsert(ctx: ApplyContext, op: BibleDocumentRestoreOp): Promise<void> {
  const contentHash = computeBibleDocHash(op.frontmatter, op.body);
  const [row] = await ctx.tx
    .insert(schema.bibleDocuments)
    .values({ projectId: ctx.projectId, section: op.section, slug: op.slug, frontmatter: op.frontmatter, body: op.body, contentHash, revision: 1 })
    .onConflictDoUpdate({
      target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
      set: { frontmatter: op.frontmatter, body: op.body, contentHash, revision: sql`${schema.bibleDocuments.revision} + 1`, updatedAt: new Date() },
      setWhere: sql`${schema.bibleDocuments.contentHash} is distinct from ${contentHash}`,
    })
    .returning();

  // A canon change can affect any chapter — same invalidation as BibleDocumentService.upsert.
  if (row) await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));

  const revision = row?.revision ?? (await currentDocRevision(ctx, op.section, op.slug));
  ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: revision });
}

async function currentDocRevision(ctx: ApplyContext, section: BibleDocumentUpsertOp['section'], slug: string): Promise<number | null> {
  const doc = await ctx.tx.query.bibleDocuments.findFirst({
    where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
  });
  return doc?.revision ?? null;
}

async function applyBibleDocRemove(ctx: ApplyContext, op: BibleDocumentRemoveOp): Promise<void> {
  const deleted = await ctx.tx
    .delete(schema.bibleDocuments)
    .where(and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)))
    .returning();
  if (deleted.length === 0) throw AppErrorCode.DOC_001.create();

  await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));
  ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: null });
}

export const BIBLE_DOCUMENT_HANDLERS: ContentOpHandlers<'bible_document.upsert' | 'bible_document.remove'> = {
  'bible_document.upsert': { apply: applyBibleDocUpsert, inverse: inverseBibleDoc },
  'bible_document.remove': { apply: applyBibleDocRemove, inverse: inverseBibleDoc },
};
