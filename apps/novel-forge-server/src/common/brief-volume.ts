import { and, asc, desc, eq, gt, isNotNull, lte } from 'drizzle-orm';

import { type DbExecutor, schema } from '@server/database';

/**
 * The volume a chapter without its own plan belongs to: that of the nearest plan at or before it, or — for a chapter ahead of every
 * planned one — that of the first plan after it, so a chapter placed before chapter 1 joins chapter 1's volume.
 */
export async function nearestVolumeKey(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number): Promise<string | null> {
  const planned = and(eq(schema.briefs.projectId, projectId), isNotNull(schema.briefs.volumeKey));
  const columns = { volumeKey: true } as const;
  const before = await db.query.briefs.findFirst({ where: and(planned, lte(schema.briefs.chapter, chapter)), orderBy: desc(schema.briefs.chapter), columns });
  if (before?.volumeKey) return before.volumeKey;
  const after = await db.query.briefs.findFirst({ where: and(planned, gt(schema.briefs.chapter, chapter)), orderBy: asc(schema.briefs.chapter), columns });
  return after?.volumeKey ?? null;
}
