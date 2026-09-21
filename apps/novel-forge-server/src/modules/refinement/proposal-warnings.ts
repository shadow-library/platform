import { and, eq, inArray } from 'drizzle-orm';

import { type DbExecutor, schema } from '@server/database';

import { type ChangeOp } from './change-set';
import { findNegationEchoes, type NegationEchoOptions } from './negation-echo';

type TextOpType = 'brief.update' | 'draft.update' | 'bible_document.upsert' | 'entity.upsert';
type TextOp = Extract<ChangeOp, { op: TextOpType }>;
type TextFields = Record<string, string | null>;

const TEXT_FIELDS: Record<TextOpType, readonly string[]> = {
  'brief.update': ['title', 'body'],
  'draft.update': ['title', 'body', 'summary'],
  'bible_document.upsert': ['body'],
  'entity.upsert': ['status', 'motivation', 'notes', 'body'],
};

function isTextOp(op: ChangeOp): op is TextOp {
  return op.op in TEXT_FIELDS;
}

function baselineKey(op: TextOp): string {
  if (op.op === 'brief.update') return `chapter:${op.chapter}`;
  if (op.op === 'draft.update') return `draft:${op.chapter}`;
  if (op.op === 'bible_document.upsert') return `doc:${op.section}/${op.slug}`;
  return `entity:${op.entityKey}`;
}

function describeOp(op: TextOp): string {
  if (op.op === 'brief.update') return `the chapter ${op.chapter} brief`;
  if (op.op === 'draft.update') return `the chapter ${op.chapter} prose`;
  if (op.op === 'bible_document.upsert') return `the ${op.section}/${op.slug} document`;
  return `the ${op.entityKey} entry`;
}

/** The stored text each text op would overwrite, keyed like `changeSetRefs` — a record the op creates has none. */
export async function loadBaselineTexts(db: DbExecutor, projectId: bigint, ops: readonly ChangeOp[]): Promise<Map<string, TextFields>> {
  const textOps = ops.filter(isTextOp);
  const chapters = textOps.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  const drafts = textOps.flatMap(op => (op.op === 'draft.update' ? [op.chapter] : []));
  const slugs = textOps.flatMap(op => (op.op === 'bible_document.upsert' ? [op.slug] : []));
  const entityKeys = textOps.flatMap(op => (op.op === 'entity.upsert' ? [op.entityKey] : []));

  const [briefRows, draftRows, docRows, entityRows] = await Promise.all([
    chapters.length > 0 ? db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), inArray(schema.briefs.chapter, chapters)) }) : [],
    drafts.length > 0 ? db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, drafts)) }) : [],
    slugs.length > 0 ? db.query.bibleDocuments.findMany({ where: and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.slug, slugs)) }) : [],
    entityKeys.length > 0 ? db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)) }) : [],
  ]);

  const texts = new Map<string, TextFields>();
  for (const row of briefRows) texts.set(`chapter:${row.chapter}`, { title: row.title, body: row.body });
  for (const row of draftRows) texts.set(`draft:${row.chapter}`, { title: row.title, body: row.body, summary: row.summary });
  for (const row of docRows) texts.set(`doc:${row.section}/${row.slug}`, { body: row.body });
  for (const row of entityRows) texts.set(`entity:${row.entityKey}`, { status: row.status, motivation: row.motivation, notes: row.notes, body: row.body });
  return texts;
}

/** One readable warning per clause where a text op removed something by writing its absence. */
export function negationEchoWarnings(ops: readonly ChangeOp[], baselines: ReadonlyMap<string, TextFields>, options?: NegationEchoOptions): string[] {
  return ops.filter(isTextOp).flatMap(op => {
    const baseline = baselines.get(baselineKey(op));
    if (!baseline) return [];
    const fields = TEXT_FIELDS[op.op];
    const proposed = op as unknown as Record<string, unknown>;
    const before = fields.map(field => baseline[field] ?? '').join('\n');
    const after = fields.map(field => (typeof proposed[field] === 'string' ? (proposed[field] as string) : (baseline[field] ?? ''))).join('\n');
    return findNegationEchoes(before, after, options).map(
      echo => `${describeOp(op)} drops ${echo.terms.map(term => `"${term}"`).join(', ')} by stating its absence ("${echo.excerpt}") — delete it instead of negating it`,
    );
  });
}

export async function findNegationEchoWarnings(db: DbExecutor, projectId: bigint, ops: readonly ChangeOp[], options?: NegationEchoOptions): Promise<string[]> {
  if (!ops.some(isTextOp)) return [];
  return negationEchoWarnings(ops, await loadBaselineTexts(db, projectId, ops), options);
}
