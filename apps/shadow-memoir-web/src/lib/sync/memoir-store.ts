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
}

const DB_NAME = 'shadow-memoir';

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
};

/** `OfflineStore` opens the database lazily, so a browser-created instance is inert until first use. */
function offlineBacking(): KeyValueBacking {
  const store = new OfflineStore({ dbName: DB_NAME });
  return {
    get: key => store.get(key),
    put: (key, value) => store.put(key, value).then(() => undefined),
    delete: key => store.delete(key),
    keys: () => store.list().then(entries => entries.map(entry => entry.key)),
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

export function createBacking(): KeyValueBacking {
  return isIndexedDbAvailable() ? offlineBacking() : memoryBacking();
}

/**
 * The local mirror: one namespaced record per delta row, the sync metadata (cursor, epoch, device id),
 * and the outbox. Domains are namespaced by key prefix rather than by object store because
 * `@shadow-library/web/offline` exposes a keyed store, not a schema — the seam is here, so moving to real
 * per-domain object stores later is a change to this file alone.
 */
export class MemoirStore {
  constructor(private readonly backing: KeyValueBacking = createBacking()) {}

  private async keysWithPrefix(prefix: string): Promise<string[]> {
    return (await this.backing.keys()).filter(key => key.startsWith(prefix));
  }

  async readMeta<T>(key: (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS]): Promise<T | undefined> {
    return this.backing.get<T>(`${META_PREFIX}${key}`);
  }

  async writeMeta(key: (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS], value: unknown): Promise<void> {
    await this.backing.put(`${META_PREFIX}${key}`, value);
  }

  async readDomain(domain: SyncDomain): Promise<DeltaRow[]> {
    const keys = await this.keysWithPrefix(`${DOMAIN_PREFIX}${domain}:`);
    const rows = await Promise.all(keys.map(key => this.backing.get<DeltaRow>(key)));
    return rows.filter((row): row is DeltaRow => row !== undefined);
  }

  async upsertRows(domain: SyncDomain, rows: DeltaRow[]): Promise<void> {
    const key = DOMAIN_KEYS[domain];
    for (const row of rows) await this.backing.put(`${DOMAIN_PREFIX}${domain}:${key(row)}`, row);
  }

  /** A snapshot domain's local set is authoritative-replaced, which is also how a removal in one propagates. */
  async replaceRows(domain: SyncDomain, rows: DeltaRow[]): Promise<void> {
    await this.clearDomain(domain);
    await this.upsertRows(domain, rows);
  }

  async deleteRow(domain: string, recordId: string): Promise<void> {
    await this.backing.delete(`${DOMAIN_PREFIX}${domain}:${recordId}`);
  }

  async clearDomain(domain: SyncDomain): Promise<void> {
    for (const key of await this.keysWithPrefix(`${DOMAIN_PREFIX}${domain}:`)) await this.backing.delete(key);
  }

  /** Drops every mirrored row and the cursor, leaving the outbox untouched — an epoch change invalidates server state, never the owner's queued intent. */
  async clearMirror(): Promise<void> {
    for (const key of await this.keysWithPrefix(DOMAIN_PREFIX)) await this.backing.delete(key);
    await this.writeMeta(SYNC_META_KEYS.cursor, '0');
  }

  async appendOutbox(entry: OutboxEntry): Promise<void> {
    await this.backing.put(`${OUTBOX_PREFIX}${String(entry.seq).padStart(12, '0')}:${entry.commandId}`, entry);
  }

  async readOutbox(): Promise<OutboxEntry[]> {
    const keys = (await this.keysWithPrefix(OUTBOX_PREFIX)).sort();
    const entries = await Promise.all(keys.map(key => this.backing.get<OutboxEntry>(key)));
    return entries.filter((entry): entry is OutboxEntry => entry !== undefined);
  }

  async removeOutbox(commandId: string): Promise<void> {
    for (const key of await this.keysWithPrefix(OUTBOX_PREFIX)) if (key.endsWith(`:${commandId}`)) await this.backing.delete(key);
  }

  async nextOutboxSeq(): Promise<number> {
    const current = (await this.readMeta<number>(SYNC_META_KEYS.outboxSeq)) ?? 0;
    const next = current + 1;
    await this.writeMeta(SYNC_META_KEYS.outboxSeq, next);
    return next;
  }
}
