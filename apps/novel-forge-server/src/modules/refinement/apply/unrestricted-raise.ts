import { and, eq } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';

import { type UnrestrictedAvailability } from '../../ai/novel-forge-catalog.service';
import { type ChangeOp } from '../change-set';

export type UnrestrictedRaise = 'allowed' | 'refused';

export function raisesToUnrestricted(op: ChangeOp): boolean {
  return op.op === 'brief.update' && op.contentMode === 'unrestricted';
}

/**
 * Read before the apply transaction opens, so the catalog is never awaited while the proposal and plan locks are held. Only the ops at `opIndexes` (every op when
 * omitted) are weighed, and the catalog is asked only when one raises; otherwise, or with no catalog to ask, a raise found under the lock is refused.
 */
export async function unrestrictedRaiseFor(
  db: PrimaryDatabase,
  catalog: UnrestrictedAvailability | undefined,
  projectId: bigint,
  proposalId: bigint,
  opIndexes?: readonly number[],
): Promise<UnrestrictedRaise> {
  if (!catalog) return 'refused';
  const row = await db.query.refinementProposals.findFirst({
    where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)),
    columns: { changeSet: true },
  });
  const ops = (row?.changeSet ?? []) as ChangeOp[];
  const weighed = opIndexes ? opIndexes.flatMap(index => (ops[index] ? [ops[index]] : [])) : ops;
  if (!weighed.some(raisesToUnrestricted)) return 'refused';
  return (await catalog.unrestrictedAvailable()) ? 'allowed' : 'refused';
}
