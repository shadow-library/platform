import { eq } from 'drizzle-orm';
import { AppError } from '@shadow-library/common';
import { type DatabaseService } from '@shadow-library/modules';

import { type PrimaryTransaction, schema } from '@server/database';

export type VersionedParent = typeof schema.templates | typeof schema.layouts | typeof schema.partials;

/** NO KEY UPDATE serialises every draft and publish writer of one item without blocking the key-share lock a foreign-key insert (a job) takes on the same row. */
export async function lockVersionedParent(tx: PrimaryTransaction, table: VersionedParent, id: bigint): Promise<boolean> {
  const rows = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).for('no key update');
  return rows.length > 0;
}

export function rethrowTransactionError(databaseService: DatabaseService, error: unknown): never {
  if (AppError.is(error)) throw error;
  return databaseService.translateError(error);
}
