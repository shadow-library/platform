/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** A row already reduced to JSON-safe values: the delta envelope is serialized free-form, so bigints and Dates must be resolved by the source. */
export type DeltaRow = Record<string, unknown>;

export interface DeltaRecord {
  syncSeq: bigint;
  row: DeltaRow;
}

export interface DeltaFetchContext {
  since: bigint;
  /** The page size the assembler wants; a source returning exactly this many is treated as truncated. */
  limit: number;
}

/**
 * A domain backed by a table carrying `sync_seq`: keyset-paged, and the only kind that moves the cursor.
 */
export interface KeysetDeltaSource {
  domain: string;
  kind: 'keyset';
  /** Rows with `sync_seq > since` for the requesting account, ascending by `sync_seq`, at most `limit` of them. */
  fetch(context: DeltaFetchContext): Promise<DeltaRecord[]>;
}

/**
 * A domain small and singular enough that the authoritative full set is cheaper than a watermark —
 * the account row itself, the device registry. The client replaces its local set with what it receives,
 * which is also how a removal in such a domain propagates.
 */
export interface SnapshotDeltaSource {
  domain: string;
  kind: 'snapshot';
  fetch(): Promise<DeltaRow[]>;
}

/**
 * Neither variant takes an account id. Delta assembly always runs inside a request, so a source reads
 * the caller's account from `AccountContext` through its own `OwnerScopedRepository` — there is no
 * parameter through which the assembler could hand a source somebody else's account.
 */
export type DeltaSource = KeysetDeltaSource | SnapshotDeltaSource;

export interface DeltaTombstone {
  domain: string;
  recordId: string;
  syncSeq: bigint;
}

export interface DeltaPage {
  cursor: bigint;
  hasMore: boolean;
  domains: Record<string, DeltaRow[]>;
  tombstones: DeltaTombstone[];
}
