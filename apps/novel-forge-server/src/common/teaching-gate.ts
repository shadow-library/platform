import { and, eq, lt } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, schema } from '@server/database';

import { parseKnowledgeContract } from './knowledge-contract';

const teaches = (knowledgeContract: unknown): boolean => (parseKnowledgeContract(knowledgeContract)?.learns.length ?? 0) > 0;

/**
 * The chapter an AI draft of `chapter` waits on: the lowest earlier chapter whose plan teaches its cast something while neither an approval
 * nor a finalize has settled what — the writer is told what the cast knows, and an unsettled lesson could still move.
 */
export async function unsettledTeacher(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number): Promise<number | null> {
  const [briefs, drafts, finalized] = await Promise.all([
    db.query.briefs.findMany({ columns: { chapter: true, knowledgeContract: true }, where: and(eq(schema.briefs.projectId, projectId), lt(schema.briefs.chapter, chapter)) }),
    db.query.drafts.findMany({
      columns: { chapter: true, status: true, reviewStatus: true },
      where: and(eq(schema.drafts.projectId, projectId), lt(schema.drafts.chapter, chapter)),
    }),
    db.query.chapters.findMany({
      columns: { number: true },
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), lt(schema.chapters.number, chapter)),
    }),
  ]);
  const settled = new Set([
    ...finalized.map(row => row.number),
    ...drafts.filter(draft => draft.status === 'final' || draft.reviewStatus === 'approved').map(draft => draft.chapter),
  ]);
  const teachers = briefs.filter(brief => teaches(brief.knowledgeContract) && !settled.has(brief.chapter)).map(brief => brief.chapter);
  return teachers.length > 0 ? Math.min(...teachers) : null;
}

/** A batch drafts its chapters back to back with no approval between them, so it ends at the first chapter whose plan teaches something. */
export function untilFirstTeacher(chapters: readonly number[], plans: ReadonlyMap<number, { knowledgeContract?: unknown }>): number[] {
  const teacher = chapters.findIndex(chapter => teaches(plans.get(chapter)?.knowledgeContract));
  return teacher === -1 ? [...chapters] : chapters.slice(0, teacher + 1);
}

/** Refuses an AI draft of `chapter` while {@link unsettledTeacher} names a chapter; writing it by hand is never gated. */
export async function assertTeacherSettled(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number): Promise<void> {
  const teacher = await unsettledTeacher(db, projectId, chapter);
  if (teacher !== null) throw AppErrorCode.DRF_016.create({ chapter: String(chapter), teacher: String(teacher) });
}
