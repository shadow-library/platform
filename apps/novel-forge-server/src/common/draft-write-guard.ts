import { and, eq } from 'drizzle-orm';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { type PrimaryDatabase, schema } from '@server/database';

export type DraftReader = Pick<PrimaryDatabase, 'query'>;

/** `stale_aware` answers a draft that went stale with DRF_007; `conflict` answers any change to a live draft with DRF_013. */
export type DraftChangeReading = 'stale_aware' | 'conflict';

export async function refusedDraftWriteError(db: DraftReader, projectId: bigint, chapter: number, reading: DraftChangeReading = 'conflict'): Promise<AppError> {
  const current = await db.query.drafts.findFirst({
    columns: { status: true, staleReason: true },
    where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)),
  });
  if (!current) return AppErrorCode.DRF_001.create();
  if (current.status === 'final') return AppErrorCode.DRF_002.create();
  if (reading === 'stale_aware' && current.staleReason !== null) return AppErrorCode.DRF_007.create();
  return AppErrorCode.DRF_013.create();
}
