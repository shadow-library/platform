import { type Command } from '@/lib/data';

import { type MemoirStore } from './memoir-store';
import { type DomainRows, projectWorldState } from './projection';
import { Outbox } from './outbox';
import { SyncClient, SyncTransportError } from './sync-client';
import { type CommandEnvelope, type DeltaPage, type OutboxEntry, SNAPSHOT_DOMAINS, SYNC_DOMAINS, SYNC_META_KEYS, type SyncNotice, type SyncSnapshot } from './sync.types';

export interface SyncEngineOptions {
  store: MemoirStore;
  client?: SyncClient;
  today: string;
  deviceId?: string;
  /** Bounds a `hasMore` drain so a pathological server can never spin the client forever. */
  maxPages?: number;
}

const DEFAULT_MAX_PAGES = 50;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** The wire envelope, without the fields that exist only to order and settle the local queue. */
function toEnvelope(entry: OutboxEntry): CommandEnvelope {
  return { commandId: entry.commandId, type: entry.type, payload: entry.payload, performedAt: entry.performedAt, localDate: entry.localDate, deviceId: entry.deviceId };
}

/**
 * The whole of the client's half of ADR-0006: a persisted outbox posted in strict order, a delta pull
 * that upserts by primary key, and one net state derived from both. It owns no view logic — the projected
 * world it publishes is what `SyncedDataProvider` reads through.
 */
export class SyncEngine {
  readonly outbox: Outbox;

  private readonly store: MemoirStore;
  private readonly client: SyncClient;
  private readonly maxPages: number;
  private readonly listeners = new Set<() => void>();
  private readonly worldListeners = new Set<() => void>();
  private readonly rows: Partial<DomainRows> = {};

  private snapshot: SyncSnapshot = { state: isOnline() ? 'online' : 'offline', queuedCount: 0, lastSyncedAt: null, notices: [] };
  private deviceId: string | undefined;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly options: SyncEngineOptions) {
    this.store = options.store;
    this.client = options.client ?? new SyncClient();
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.deviceId = options.deviceId;
    this.outbox = new Outbox(this.store, { deviceId: this.deviceId });
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Fires only when the mirrored rows changed — a net-state change must not make every screen reproject. */
  subscribeWorld(listener: () => void): () => void {
    this.worldListeners.add(listener);
    return () => void this.worldListeners.delete(listener);
  }

  world(): ReturnType<typeof projectWorldState> {
    return projectWorldState(this.rows, this.options.today);
  }

  /** Hydrates the projected world from IndexedDB, then attempts one sync pass. A cold offline launch stops after the hydrate. */
  async start(): Promise<void> {
    await this.hydrate();
    await this.sync();
  }

  async hydrate(): Promise<void> {
    await this.hydrateRows();
    this.patch({ queuedCount: await this.outbox.size(), lastSyncedAt: (await this.store.readMeta<string>(SYNC_META_KEYS.lastSyncedAt)) ?? null });
  }

  /** Enqueues a command for the server; the caller has already applied it locally. Purely-local commands return without queueing. */
  async enqueue(command: Command, localDate: string): Promise<void> {
    const entry = await this.outbox.enqueue(command, localDate);
    if (!entry) return;
    this.patch({ queuedCount: await this.outbox.size() });
    if (this.snapshot.state !== 'signed-out' && isOnline()) void this.sync();
  }

  dismissNotice(commandId: string): void {
    this.patch({ notices: this.snapshot.notices.filter(notice => notice.commandId !== commandId) });
  }

  /** Flush then pull, serialized — two overlapping passes would post the same batch twice and race the cursor. */
  sync(): Promise<void> {
    return (this.inFlight ??= this.runSync().finally(() => void (this.inFlight = null)));
  }

  private async runSync(): Promise<void> {
    if (!isOnline()) return this.patch({ state: 'offline' });

    this.patch({ state: 'syncing' });
    try {
      await this.ensureDeviceRegistered();
      const interrupted = await this.flush();
      await this.pull();
      const lastSyncedAt = new Date().toISOString();
      await this.store.writeMeta(SYNC_META_KEYS.lastSyncedAt, lastSyncedAt);
      this.patch({ state: interrupted ? 'failed' : 'online', lastSyncedAt, queuedCount: await this.outbox.size() });
    } catch (error) {
      await this.handleFailure(error);
    }
  }

  /**
   * §4.3: a dead session leaves IndexedDB and the outbox exactly as they are. The owner keeps working
   * against local data and the same command ids replay under the new principal once they sign back in.
   */
  private async handleFailure(error: unknown): Promise<void> {
    const queuedCount = await this.outbox.size();
    if (error instanceof SyncTransportError && error.kind === 'unauthorized') return this.patch({ state: 'signed-out', queuedCount });
    if (error instanceof SyncTransportError && error.kind === 'offline') return this.patch({ state: 'offline', queuedCount });
    this.patch({ state: 'failed', queuedCount });
  }

  private async ensureDeviceRegistered(): Promise<void> {
    if (this.deviceId) return;
    const stored = await this.store.readMeta<string>(SYNC_META_KEYS.deviceId);
    const deviceId = stored ?? crypto.randomUUID();
    await this.client.registerDevice(deviceId, typeof navigator === 'undefined' ? undefined : navigator.userAgent);
    if (!stored) await this.store.writeMeta(SYNC_META_KEYS.deviceId, deviceId);
    this.deviceId = deviceId;
  }

  /**
   * Posts batches in strict order until the queue drains or a command fails. A short outcome list means
   * everything from the first unacked command onward is still queued, so the next pass resends from there
   * under the same ids — the server replays their recorded outcomes rather than re-running them.
   */
  private async flush(): Promise<boolean> {
    const notices: SyncNotice[] = [];

    for (;;) {
      const batch = await this.outbox.nextBatch();
      if (batch.length === 0) break;

      const response = await this.client.postCommands(batch.map(toEnvelope));
      await this.reconcileEpoch(response.epoch);

      const result = await this.outbox.ack(batch, response.outcomes);
      notices.push(...result.notices);
      if (result.interrupted) {
        if (notices.length) this.patch({ notices: [...this.snapshot.notices, ...notices] });
        return true;
      }
    }

    if (notices.length) this.patch({ notices: [...this.snapshot.notices, ...notices] });
    return false;
  }

  private async pull(): Promise<void> {
    for (let page = 0; page < this.maxPages; page += 1) {
      const since = (await this.store.readMeta<string>(SYNC_META_KEYS.cursor)) ?? '0';
      const response = await this.client.pullDelta({ since, domains: SYNC_DOMAINS });
      const reset = await this.reconcileEpoch(response.epoch);
      if (reset) continue;

      await this.ingest(response.page);
      await this.store.writeMeta(SYNC_META_KEYS.cursor, response.page.cursor);
      if (!response.page.hasMore) return;
    }
  }

  private async ingest(page: DeltaPage): Promise<void> {
    for (const domain of SYNC_DOMAINS) {
      const rows = page.domains[domain];
      if (!rows) continue;
      if (SNAPSHOT_DOMAINS.includes(domain)) await this.store.replaceRows(domain, rows);
      else await this.store.upsertRows(domain, rows);
    }

    for (const tombstone of page.tombstones) await this.store.deleteRow(tombstone.domain, tombstone.recordId);
    await this.hydrateRows();
  }

  private async hydrateRows(): Promise<void> {
    for (const domain of SYNC_DOMAINS) this.rows[domain] = await this.store.readDomain(domain);
    for (const listener of this.worldListeners) listener();
  }

  /**
   * A changed epoch invalidates the cursor and everything it drew down — a restore, a re-key, anything the
   * server cannot express as a delta. The mirror is dropped and the next pull starts from zero; the outbox
   * survives, because the owner's queued intent was never the server's to invalidate.
   */
  private async reconcileEpoch(epoch: string | null): Promise<boolean> {
    if (!epoch) return false;
    const known = await this.store.readMeta<string>(SYNC_META_KEYS.epoch);
    if (known === epoch) return false;

    await this.store.writeMeta(SYNC_META_KEYS.epoch, epoch);
    if (known === undefined) return false;

    await this.store.clearMirror();
    await this.hydrateRows();
    return true;
  }

  private patch(next: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
}
