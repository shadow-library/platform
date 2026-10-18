import { type SQL, sql, type SQLWrapper } from 'drizzle-orm';
import { type Envelope } from '@shadow-library/common/crypto';

import { type PrimaryDatabase, type PrimaryTransaction } from '@server/modules/infrastructure/datastore';

import { type StoredLegacySecret } from './legacy-key-provider';
import { SEALED_COLUMN_LIST, type SealedColumn } from './sealed-secret.constants';

export interface KidCount {
  /** `null` for an envelope column holding something that is not an envelope */
  kid: string | null;
  rows: number;
}

export interface LegacyRow {
  id: string;
  legacy: StoredLegacySecret;
}

export interface SealedRow {
  id: string;
  envelope: unknown;
}

export interface FailedRow {
  column: string;
  id: string;
}

export interface BackfillBatch {
  /** The last id the batch read, or `null` once the column has no rows left after the cursor */
  cursor: string | null;
  sealed: number;
  /** Rows an old image changed between the read and the compare-and-set; the next run picks them up */
  skipped: number;
  failed: string[];
}

export interface RewrapResult {
  rewrapped: number;
  skipped: number;
  failed: FailedRow[];
}

export type SealLegacy = (row: LegacyRow) => Promise<Envelope>;
export type RewrapSealed = (column: SealedColumn, row: SealedRow) => Promise<Envelope>;

export interface SealedSecretStore {
  kidCounts(): Promise<KidCount[]>;
  backfillBatch(column: SealedColumn, after: string | null, limit: number, seal: SealLegacy): Promise<BackfillBatch>;
  rewrapStale(activeKeyId: string, rewrap: RewrapSealed): Promise<RewrapResult | undefined>;
}

/** Aliased `owner_id`, not `id`: an `order by "id"` would otherwise sort by the text alias instead of the column the cursor compares */
interface RawLegacyRow {
  owner_id: string;
  ciphertext: string;
  iv: string | null;
  auth_tag: string | null;
}

interface RawSealedRow {
  owner_id: string;
  envelope: string;
}

/** Transaction-scoped, so a replica that dies mid-rewrap never leaves the lock held */
const REWRAP_LOCK = sql`select pg_try_advisory_xact_lock(hashtext('identity:crypto:rewrap')) as locked`;

export function columnLabel(column: SealedColumn): string {
  return `${column.table}.${column.secret}`;
}

/** Every statement names its columns from `SEALED_COLUMNS`, never from input, so the identifiers here are constants. */
export class SealedSecretRepository implements SealedSecretStore {
  constructor(private readonly db: PrimaryDatabase) {}

  async kidCounts(): Promise<KidCount[]> {
    const kids = SEALED_COLUMN_LIST.map(column => sql`select ${ident(column.envelope)}->>'kid' as kid from ${ident(column.table)} where ${ident(column.envelope)} is not null`);
    const rows = await this.db.execute(sql`select kid, count(*)::int as "rows" from (${sql.join(kids, sql` union all `)}) as sealed group by kid order by kid`);
    return [...rows] as KidCount[];
  }

  backfillBatch(column: SealedColumn, after: string | null, limit: number, seal: SealLegacy): Promise<BackfillBatch> {
    return this.db.transaction(async tx => {
      const id = ident(column.id);
      const legacy = legacyColumn(column);
      const cursor = after === null ? sql`` : sql`and ${id} > ${typed(column, after)}`;
      const rows = (await tx.execute(
        sql`select ${id}::text as owner_id, ${legacySelect(column)} from ${ident(column.table)}
            where ${ident(column.envelope)} is null and ${legacy} is not null ${cursor} order by ${id} limit ${limit}`,
      )) as RawLegacyRow[];

      const batch: BackfillBatch = { cursor: rows.at(-1)?.owner_id ?? null, sealed: 0, skipped: 0, failed: [] };
      for (const row of rows) {
        const envelope = await seal({ id: row.owner_id, legacy: toLegacy(column, row) }).catch(() => undefined);
        if (!envelope) {
          batch.failed.push(row.owner_id);
          continue;
        }
        const updated = await tx.execute(
          sql`update ${ident(column.table)} set ${ident(column.envelope)} = ${jsonb(envelope)}
              where ${id} = ${typed(column, row.owner_id)} and ${ident(column.envelope)} is null and ${legacy} = ${row.ciphertext} returning 1`,
        );
        if (updated.length > 0) batch.sealed++;
        else batch.skipped++;
      }
      return batch;
    });
  }

  /** Each write is a compare-and-set on the data key it read, so a secret replaced in between is kept, never overwritten with the older one. */
  rewrapStale(activeKeyId: string, rewrap: RewrapSealed): Promise<RewrapResult | undefined> {
    return this.db.transaction(async tx => {
      const [lock] = await tx.execute<{ locked: boolean }>(REWRAP_LOCK);
      if (lock?.locked !== true) return undefined;
      const result: RewrapResult = { rewrapped: 0, skipped: 0, failed: [] };
      for (const column of SEALED_COLUMN_LIST) await this.rewrapColumn(tx, column, activeKeyId, rewrap, result);
      return result;
    });
  }

  private async rewrapColumn(tx: PrimaryTransaction, column: SealedColumn, activeKeyId: string, rewrap: RewrapSealed, result: RewrapResult): Promise<void> {
    const envelopeColumn = ident(column.envelope);
    const rows = (await tx.execute(
      sql`select ${ident(column.id)}::text as owner_id, ${envelopeColumn}::text as envelope from ${ident(column.table)}
          where ${envelopeColumn} is not null and ${envelopeColumn}->>'kid' is distinct from ${activeKeyId}`,
    )) as RawSealedRow[];
    for (const row of rows) {
      const stored = parseJson(row.envelope);
      const dek = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>)['dek'] : undefined;
      const envelope = typeof dek === 'string' ? await rewrap(column, { id: row.owner_id, envelope: stored }).catch(() => undefined) : undefined;
      if (!envelope) {
        result.failed.push({ column: columnLabel(column), id: row.owner_id });
        continue;
      }
      const updated = await tx.execute(
        sql`update ${ident(column.table)} set ${envelopeColumn} = ${jsonb(envelope)}
            where ${ident(column.id)} = ${typed(column, row.owner_id)} and ${envelopeColumn}->>'dek' = ${dek} returning 1`,
      );
      if (updated.length > 0) result.rewrapped++;
      else result.skipped++;
    }
  }
}

function ident(name: string): SQLWrapper {
  return sql.identifier(name);
}

function typed(column: SealedColumn, id: string): SQL {
  return sql`cast(${id} as ${sql.raw(column.idType)})`;
}

function jsonb(envelope: Envelope): SQL {
  return sql`${JSON.stringify(envelope)}::text::jsonb`;
}

function legacyColumn(column: SealedColumn): SQLWrapper {
  return ident(column.legacy.format === 'columns' ? column.legacy.ciphertext : column.legacy.column);
}

function legacySelect(column: SealedColumn): SQL {
  if (column.legacy.format === 'serialized') return sql`${ident(column.legacy.column)} as ciphertext, null as iv, null as auth_tag`;
  return sql`${ident(column.legacy.ciphertext)} as ciphertext, ${ident(column.legacy.iv)} as iv, ${ident(column.legacy.authTag)} as auth_tag`;
}

function toLegacy(column: SealedColumn, row: RawLegacyRow): StoredLegacySecret {
  if (column.legacy.format === 'serialized') return row.ciphertext;
  return { ciphertext: row.ciphertext, iv: row.iv ?? '', authTag: row.auth_tag ?? '' };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
