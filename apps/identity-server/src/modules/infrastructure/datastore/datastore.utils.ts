import { sql } from 'drizzle-orm';
import { AppError } from '@shadow-library/common';

import { type PrimaryDatabase } from './datastore.module';

export type SerialTable = 'mfa_enrollments' | 'webhook_subscriptions';

/** Draws the next `bigserial` id ahead of the insert, so a value bound to the id, such as a sealed secret's context, can be written with the row. */
export async function reserveSerialId(executor: Pick<PrimaryDatabase, 'execute'>, table: SerialTable): Promise<bigint> {
  const [row] = await executor.execute<{ id: string }>(sql`select nextval(pg_get_serial_sequence(${table}, 'id'))::text as id`);
  if (!row) throw AppError.internal(`Reserving an id for ${table} returned no row`);
  return BigInt(row.id);
}
