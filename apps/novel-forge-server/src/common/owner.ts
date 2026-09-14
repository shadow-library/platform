import { and, eq, type SQL } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';

import { type Owner } from '@server/database';

export interface OwnerRef {
  kind: Owner.Kind;
  id: bigint;
}

export interface OwnedRow {
  ownerKind: Owner.Kind;
  ownerId: bigint | null;
}

/** Carries both owner columns or neither, so a caller cannot supply `ownerId` alone and silently fall through an owner lookup. */
export type OwnerFields = OwnedRow | { ownerKind?: never; ownerId?: never };

interface OwnedTable {
  ownerKind: PgColumn;
  ownerId: PgColumn;
}

// Every ownership comparison filters on the (kind, id) pair and never on `owner_id` alone: user ids and bot
// ids come from separate sequences, so a bot routinely shares its numeric id with an unrelated user.
// The cast is safe because two concrete `eq()` operands can never yield `undefined`, whatever `and()` types.
export function ownedBy(table: OwnedTable, owner: OwnerRef): SQL {
  return and(eq(table.ownerKind, owner.kind), eq(table.ownerId, owner.id)) as SQL;
}

export function isOwnedBy(row: OwnedRow, owner: OwnerRef): boolean {
  return row.ownerId !== null && row.ownerKind === owner.kind && row.ownerId === owner.id;
}
