import { and, asc, eq, max, ne } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { volumeContentHash } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

export interface ApprovePlanResult {
  volumesApproved: number;
  approved: boolean;
}

/**
 * Approves the volume plan and lays out chapter ranges as cumulative `targetChapterCount` sums in
 * ordinal order. Shared by the `/approve` and `/volumes/approve` endpoints
 * so the two routes cannot drift. Rows imported from a source novel (`status: source`) keep their
 * original ranges and are never touched; the planned volumes continue after the last of them. A volume without a count derives it from its explicit
 * range (writers like the bible-builder emit ranges only); a volume with neither rejects the approve.
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
  if (counts.some(count => count === null)) throw AppErrorCode.PLN_002.create();

  const [sourceEnd] = await db
    .select({ endChapter: max(schema.volumes.endChapter) })
    .from(schema.volumes)
    .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.status, 'source')));
  let nextStart = (sourceEnd?.endChapter ?? 0) + 1;
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
