import { isIndexedDbAvailable, OfflineStore } from '@shadow-library/web/offline';

import { type DeltaRow, type OutboxEntry, SYNC_META_KEYS, type SyncDomain } from './sync.types';

/**
 * The narrow slice of a key/value store the sync layer needs, so the same `MemoirStore` runs over
 * IndexedDB in the browser and over a Map wherever IndexedDB is absent — SSR, and the jsdom suite, which
 * deliberately leaves `indexedDB` undefined so the offline layer has to degrade rather than throw.
 */
export interface KeyValueBacking {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Release the underlying handle so the database can be deleted on sign-out without an open-connection block. */
  close?(): void;
}

export const MEMOIR_DB_NAME = 'shadow-memoir';

const DOMAIN_PREFIX = 'domain:';
const META_PREFIX = 'meta:';
const OUTBOX_PREFIX = 'outbox:';

/**
 * Primary key per delta domain, as the server's row projection names it. Upserting by this key is what
 * makes the cursor's deliberate overlap re-delivery (ARCHITECTURE §12.2) harmless.
 */
const DOMAIN_KEYS: Record<SyncDomain, (row: DeltaRow) => string> = {
  quests: row => String(row['id']),
  quest_logs: row => String(row['id']),
  daily_states: row => String(row['date']),
  quest_streaks: row => String(row['questId']),
  account: () => 'self',
  devices: row => String(row['id']),
  expenses: row => String(row['id']),
  expense_categories: row => String(row['key']),
  subscriptions: row => String(row['id']),
  journal_entries: row => String(row['id']),
  meals: row => String(row['id']),
  meal_presets: row => String(row['id']),
  weights: row => String(row['date']),
  side_quests: row => String(row['id']),
  metrics: row => String(row['id']),
  metric_entries: row => String(row['id']),
  health_offers: row => `${String(row['questId'])}:${String(row['metricId'])}:${String(row['date'])}`,
  achievements_earned: row => String(row['achievementId']),
  titles_earned: row => String(row['titleId']),
  cosmetic_unlocks: row => String(row['cosmeticId']),
  entitlement: () => 'self',
  ai_tasks: row => String(row['id']),
  ai_results: row => String(row['id']),
  ai_scheduled_queries: () => 'self',
  ai_consents: row => String(row['dataClass']),
};

/** `OfflineStore` opens the database lazily, so a browser-created instance is inert until first use. */
function offlineBacking(): KeyValueBacking {
  const store = new OfflineStore({ dbName: MEMOIR_DB_NAME });
  return {
    get: key => store.get(key),
    put: (key, value) => store.put(key, value).then(() => undefined),
    delete: key => store.delete(key),
    keys: () => store.list().then(entries => entries.map(entry => entry.key)),
    close: () => store.close(),
  };
}

function memoryBacking(): KeyValueBacking {
  const map = new Map<string, unknown>();
  return {
    get: async key => map.get(key) as never,
    put: async (key, value) => void map.set(key, value),
    delete: async key => void map.delete(key),
    keys: async () => [...map.keys()],
  };
}

/**
 * Reading `window.indexedDB` itself throws where the browser forbids storage, and the store is built during render. The choice is
 * made on first use instead, so the failure surfaces from `start()`, and is retried on every call until it succeeds, so the store
 * gate's retry can recover once storage is allowed again.
 */
function createBacking(): KeyValueBacking {
  let chosen: KeyValueBacking | null = null;
  const withBacking = <T>(operation: (backing: KeyValueBacking) => Promise<T>): Promise<T> =>
    new Promise<T>(resolve => resolve(operation((chosen ??= isIndexedDbAvailable() ? offlineBacking() : memoryBacking()))));
  return {
    get: <T>(key: string) => withBacking(backing => backing.get<T>(key)),
    put: (key, value) => withBacking(backing => backing.put(key, value)),
    delete: key => withBacking(backing => backing.delete(key)),
    keys: () => withBacking(backing => backing.keys()),
    close: () => chosen?.close?.(),
  };
}

export type StoreBoundary = 'closed' | 'owner-changed' | 'principal-changed';

const BOUNDARY_MESSAGES: Record<StoreBoundary, string> = {
  closed: 'The local store was closed.',
  'owner-changed': 'The local store now belongs to another account.',
  'principal-changed': 'The session now belongs to another account.',
};

/** Work that stopped because it would have crossed from one account's local data into another's. Never a failure to report. */
export class AccountBoundaryError extends Error {
  constructor(readonly boundary: StoreBoundary) {
    super(BOUNDARY_MESSAGES[boundary]);
    this.name = 'AccountBoundaryError';
  }
}

export function ignoreAccountBoundary(error: unknown): void {
  if (!(error instanceof AccountBoundaryError)) throw error;
}

/** The browser's record of the account that last opened the store — the owner of any unprefixed layout from before namespacing. */
export interface AccountMarker {
  read(): string | null;
  write(accountId: string): void;
  clear?(): void;
}

export interface MemoirStoreOptions {
  /** The signed-in account. A bound store keeps every key under `acct:<URI-encoded accountId>:`; an unbound one (tests) uses the bare layout. */
  accountId?: string;
  marker?: AccountMarker;
}

const ACCOUNT_PREFIX = 'acct:';

/**
 * The local mirror: one namespaced record per delta row, the sync metadata (cursor, epoch, device id),
 * and the outbox. Domains are namespaced by key prefix rather than by object store because
 * `@shadow-library/web/offline` exposes a keyed store, not a schema — the seam is here, so moving to real
 * per-domain object stores later is a change to this file alone.
 *
 * The database is shared by every tab, so a bound store never reads or writes outside its account's namespace: a late write from a stale tab cannot reach another account.
 */
export class MemoirStore {
  readonly accountId: string | undefined;

  private readonly scope: string;
  private readonly opened: Promise<void>;
  private markOpened: () => void = () => undefined;
  private claim: Promise<void> | null = null;
  private closed = false;
  private wiping = false;

  constructor(
    private readonly backing: KeyValueBacking = createBacking(),
    private readonly options: MemoirStoreOptions = {},
  ) {
    this.accountId = options.accountId;
    this.scope = options.accountId === undefined ? '' : `${ACCOUNT_PREFIX}${encodeURIComponent(options.accountId)}:`;
    this.opened = new Promise(resolve => (this.markOpened = resolve));
  }

  open(): void {
    this.closed = false;
    this.markOpened();
  }

  /** Release the IndexedDB handle; anything still running against the store stops at its next read or write. */
  close(): void {
    this.closed = true;
    this.backing.close?.();
  }

  private guard(): KeyValueBacking {
    if (this.closed || this.wiping) throw new AccountBoundaryError('closed');
    return this.backing;
  }

  private async readable(): Promise<KeyValueBacking> {
    const accountId = this.accountId;
    if (accountId === undefined) return this.guard();
    await this.opened;
    this.guard();
    await (this.claim ??= this.claimFor(accountId).catch((error: unknown) => {
      this.claim = null;
      throw error;
    }));
    return this.guard();
  }

  private async writable(): Promise<KeyValueBacking> {
    const backing = await this.readable();
    if (this.ownerChanged()) throw new AccountBoundaryError('owner-changed');
    return backing;
  }

  /** Another tab has opened the store for a different account. Namespacing already isolates the data; this only tells the stale tab to stop. */
  ownerChanged(): boolean {
    if (this.accountId === undefined) return false;
    const owner = this.options.marker?.read() ?? null;
    return owner !== null && owner !== this.accountId;
  }

  private async claimFor(accountId: string): Promise<void> {
    const previous = this.options.marker?.read() ?? null;
    const keys = await this.backing.keys();
    const listed = new Set(keys);
    const legacy = keys.filter(key => !key.startsWith(ACCOUNT_PREFIX));
    // `''` is the old purge's signed-out observation: whoever wrote those rows is unknown, so they are not adopted.
    const adopt = previous === null || previous === accountId;
    for (const key of legacy) {
      // The listing, not a `get`, decides presence: `OfflineStore.put` writes content and its listing in two transactions.
      const value = adopt && !listed.has(`${this.scope}${key}`) ? await this.backing.get(key) : undefined;
      if (value !== undefined) await this.backing.put(`${this.scope}${key}`, value);
      await this.backing.delete(key);
    }
    this.options.marker?.write(accountId);
    await this.deleteForeign(keys);
  }

  private async deleteForeign(keys: string[]): Promise<void> {
    for (const key of keys) if (key.startsWith(ACCOUNT_PREFIX) && !key.startsWith(this.scope)) await this.guard().delete(key);
  }

  /** Drops what a stale tab of another account wrote after this store was claimed. */
  async sweepForeign(): Promise<void> {
    if (this.accountId === undefined || this.ownerChanged()) return;
    await this.deleteForeign(await (await this.readable()).keys());
  }

  /** Deletes this account's keys (device id kept) in place rather than dropping the whole database, which blocks on any other tab's connection. */
  async wipeAccount(): Promise<void> {
    if (this.accountId === undefined) return;
    await this.writable();
    this.wiping = true;
    try {
      const deviceIdKey = `${this.scope}${META_PREFIX}${SYNC_META_KEYS.deviceId}`;
      for (const key of await this.backing.keys()) if (key.startsWith(this.scope) && key !== deviceIdKey) await this.backing.delete(key);
      if (this.options.marker?.read() === this.accountId) this.options.marker.clear?.();
      this.closed = true;
    } finally {
      this.wiping = false;
    }
  }

  private async scopedKeys(prefix: string): Promise<string[]> {
    const scoped = `${this.scope}${prefix}`;
    return (await (await this.readable()).keys()).filter(key => key.startsWith(scoped));
  }

  async readMeta<T>(key: (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS]): Promise<T | undefined> {
    return (await this.readable()).get<T>(`${this.scope}${META_PREFIX}${key}`);
  }

  async writeMeta(key: (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS], value: unknown): Promise<void> {
    await (await this.writable()).put(`${this.scope}${META_PREFIX}${key}`, value);
  }

  async readDomain(domain: SyncDomain): Promise<DeltaRow[]> {
    const keys = await this.scopedKeys(`${DOMAIN_PREFIX}${domain}:`);
    const rows = await Promise.all(keys.map(key => this.guard().get<DeltaRow>(key)));
    return rows.filter((row): row is DeltaRow => row !== undefined);
  }

  async upsertRows(domain: SyncDomain, rows: DeltaRow[]): Promise<void> {
    const key = DOMAIN_KEYS[domain];
    await this.writable();
    for (const row of rows) await this.guard().put(`${this.scope}${DOMAIN_PREFIX}${domain}:${key(row)}`, row);
  }

  /** A snapshot domain's local set is authoritative-replaced, which is also how a removal in one propagates. */
  async replaceRows(domain: SyncDomain, rows: DeltaRow[]): Promise<void> {
    await this.clearDomain(domain);
    await this.upsertRows(domain, rows);
  }

  async deleteRow(domain: string, recordId: string): Promise<void> {
    await (await this.writable()).delete(`${this.scope}${DOMAIN_PREFIX}${domain}:${recordId}`);
  }

  async clearDomain(domain: SyncDomain): Promise<void> {
    await this.writable();
    for (const key of await this.scopedKeys(`${DOMAIN_PREFIX}${domain}:`)) await this.guard().delete(key);
  }

  /** Drops every mirrored row and the cursor, leaving the outbox untouched — an epoch change invalidates server state, never the owner's queued intent. */
  async clearMirror(): Promise<void> {
    await this.writable();
    for (const key of await this.scopedKeys(DOMAIN_PREFIX)) await this.guard().delete(key);
    await this.writeMeta(SYNC_META_KEYS.cursor, '0');
  }

  async appendOutbox(entry: OutboxEntry): Promise<void> {
    await (await this.writable()).put(`${this.scope}${OUTBOX_PREFIX}${String(entry.seq).padStart(12, '0')}:${entry.commandId}`, entry);
  }

  async readOutbox(): Promise<OutboxEntry[]> {
    const keys = (await this.scopedKeys(OUTBOX_PREFIX)).sort();
    const entries = await Promise.all(keys.map(key => this.guard().get<OutboxEntry>(key)));
    return entries.filter((entry): entry is OutboxEntry => entry !== undefined);
  }

  async removeOutbox(commandId: string): Promise<void> {
    await this.writable();
    for (const key of await this.scopedKeys(OUTBOX_PREFIX)) if (key.endsWith(`:${commandId}`)) await this.guard().delete(key);
  }

  async nextOutboxSeq(): Promise<number> {
    const current = (await this.readMeta<number>(SYNC_META_KEYS.outboxSeq)) ?? 0;
    const next = current + 1;
    await this.writeMeta(SYNC_META_KEYS.outboxSeq, next);
    return next;
  }
}
