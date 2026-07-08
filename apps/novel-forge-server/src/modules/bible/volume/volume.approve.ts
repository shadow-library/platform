/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ServerError } from '@shadow-library/fastify';
import { and, asc, eq, ne } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { volumeContentHash } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

export interface ApprovePlanResult {
  volumesApproved: number;
  approved: boolean;
}

/**
 * Declaring the constants
 */

/**
 * Approves the volume plan and lays out chapter ranges as cumulative `targetChapterCount` sums in
 * ordinal order (refinement design §2.1). Shared by the `/approve` and `/volumes/approve` endpoints
 * so the two routes cannot drift. Rows imported from a source novel (`status: source`) keep their
 * original ranges and are never touched. A volume without a count falls back to its explicit range
 * (legacy rows); a volume with neither rejects the whole approve.
 */
export async function approveVolumePlan(db: PrimaryDatabase, projectId: bigint): Promise<ApprovePlanResult> {
  const volumes = await db.query.volumes.findMany({
    where: and(eq(schema.volumes.projectId, projectId), ne(schema.volumes.status, 'source')),
    orderBy: asc(schema.volumes.ordinal),
  });
  if (volumes.length === 0) return { volumesApproved: 0, approved: false };

  const counts = volumes.map(volume => {
    if (volume.targetChapterCount !== null && volume.targetChapterCount > 0) return volume.targetChapterCount;
    if (volume.startChapter !== null && volume.endChapter !== null) return volume.endChapter - volume.startChapter + 1;
    return null;
  });
  if (counts.some(count => count === null)) throw new ServerError(AppErrorCode.PLN_002);

  let nextStart = 1;
  for (const [index, volume] of volumes.entries()) {
    const targetChapterCount = counts[index] as number;
    const startChapter = nextStart;
    const endChapter = nextStart + targetChapterCount - 1;
    nextStart = endChapter + 1;

    const contentHash = volumeContentHash({ ...volume, targetChapterCount, startChapter, endChapter } as Record<string, unknown>);
    await db
      .update(schema.volumes)
      .set({ status: 'approved', targetChapterCount, startChapter, endChapter, revision: volume.revision + 1, contentHash, updatedAt: new Date() })
      .where(eq(schema.volumes.id, volume.id));
  }

  return { volumesApproved: volumes.length, approved: true };
}
