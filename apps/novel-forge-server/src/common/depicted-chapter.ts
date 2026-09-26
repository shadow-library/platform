import { and, desc, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, schema } from '@server/database';

type FrontierReader = Pick<DbExecutor, 'query'>;

/** A dated image depicts the story at or before `chapter`. A null date is a pre-dating row, which keeps the visibility it always had. */
export function isDepictedBy(depicted: number | null | undefined, chapter: number): boolean {
  return depicted === null || depicted === undefined || depicted <= chapter;
}

/** The last finalized chapter, 0 before any: the same frontier a chapter insert may not reach behind. */
export async function latestFinalChapter(db: FrontierReader, projectId: bigint): Promise<number> {
  const latest = await db.query.chapters.findFirst({
    where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
    orderBy: desc(schema.chapters.number),
    columns: { number: true },
  });
  return latest?.number ?? 0;
}

/** An image can only show a point the story has finalized: past it there is no settled canon to draw. */
export function assertDepictableChapter(chapter: number, frontier: number): void {
  if (chapter > frontier) throw AppErrorCode.ILL_016.create({ chapter, frontier });
}

export interface Depiction {
  chapter: number;
  frontier: number;
}

/**
 * Every new image is dated: an unstated chapter is the latest final one, since that is the story the image shows; 0 is before chapter 1.
 * A generated image needs canon to draw from, so it may not pass the frontier; an author-supplied one may, and stays withheld until then.
 */
export async function resolveDepiction(db: FrontierReader, projectId: bigint, requested?: number, options: { allowFuture?: boolean } = {}): Promise<Depiction> {
  const frontier = await latestFinalChapter(db, projectId);
  if (requested === undefined) return { chapter: frontier, frontier };
  if (!options.allowFuture) assertDepictableChapter(requested, frontier);
  return { chapter: requested, frontier };
}
