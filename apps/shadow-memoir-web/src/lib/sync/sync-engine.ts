import { AccountBoundaryError, ignoreAccountBoundary, type MemoirStore, type StoreBoundary } from './memoir-store';
import { type DomainRows, projectWorldState } from './projection';
import { Outbox } from './outbox';
import { SyncClient, toSyncFailureReason } from './sync-client';
import {
  type CommandEnvelope,
  type DeltaPage,
  type NetState,
  type OutboxEntry,
  SNAPSHOT_DOMAINS,
  SYNC_DOMAINS,
  SYNC_META_KEYS,
  type SyncCommand,
  type SyncFailureReason,
  type SyncNotice,
  type SyncReadiness,
  type SyncSnapshot,
} from './sync.types';

export interface SyncEngineOptions {
  store: MemoirStore;
  client?: SyncClient;
  today: string;
  deviceId?: string;
  /** Bounds a `hasMore` drain so a pathological server can never spin the client forever. */
  maxPages?: number;
  /** The session's current subject, asked at the start of every pass and before each later batch: the cookie can change hands under a running tab. */
  principal?: () => Promise<string>;
  /** Called when this engine's account no longer owns the session or the store, so the shell can rebuild for the account that does. */
  onAccountChanged?: () => void;
}

/** `local` commands have no server handler; `refused` ones reached a store this engine's account no longer holds, and the caller must undo its optimistic apply. */
export type EnqueueResult = { status: 'queued' } | { status: 'local' } | { status: 'refused'; boundary: StoreBoundary };

export const NOT_QUEUED_MESSAGE = "That change wasn't saved: a different account is now signed in on this browser.";

export class CommandNotQueuedError extends Error {
  constructor() {
    super(NOT_QUEUED_MESSAGE);
    this.name = 'CommandNotQueuedError';
  }
}

const DEFAULT_MAX_PAGES = 50;
const MAX_PULL_ROUNDS = 20;

const LOADING: SyncReadiness = { kind: 'loading' };
const READY: SyncReadiness = { kind: 'ready' };
const DELETION_PENDING: SyncReadiness = { kind: 'failed', reason: 'deletion-pending' };

const FAILURE_STATES: Record<SyncFailureReason, NetState> = { server: 'failed', offline: 'offline', 'deletion-pending': 'failed', 'signed-out': 'signed-out' };

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
  /** The local mirror, for the providers that persist their own bookkeeping beside it — the export job id, so far. */
  readonly store: MemoirStore;

  private readonly client: SyncClient;
  private readonly maxPages: number;
  private readonly listeners = new Set<() => void>();
  private readonly projectionListeners = new Set<() => Promise<void>>();
  private readonly worldListeners = new Set<() => void>();
  private readonly rows: Partial<DomainRows> = {};

  private snapshot: SyncSnapshot = {
    state: isOnline() ? 'online' : 'offline',
    queuedCount: 0,
    lastSyncedAt: null,
    notices: [],
    initError: null,
    readiness: LOADING,
    readySince: 0,
    sending: [],
  };
  private deviceId: string | undefined;
  private mirrorReady = false;
  private deletionPending = false;
  private coldFailure: SyncFailureReason | null = null;
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

  /**
   * A provider's derived cache. These settle before any world listener runs, because a listener that
   * refetches would otherwise read the projection the rows just replaced and cache the stale answer with
   * nothing left to invalidate it.
   */
  subscribeProjection(listener: () => Promise<void>): () => void {
    this.projectionListeners.add(listener);
    return () => void this.projectionListeners.delete(listener);
  }

  world(): ReturnType<typeof projectWorldState> {
    return projectWorldState(this.rows, this.options.today);
  }

  /** The mirrored rows themselves, for the domain providers that project their own shapes rather than the quest world. */
  domains(): Partial<DomainRows> {
    return this.rows;
  }

  get today(): string {
    return this.options.today;
  }

  /**
   * Hydrates the projected world from IndexedDB, then attempts one sync pass. A cold offline launch stops
   * after the hydrate. A hydrate that throws — a browser that refuses storage, a mirror the projection
   * cannot read — is recorded rather than left as a rejected promise, so the shell can say what happened
   * instead of rendering an empty day forever.
   */
  async start(): Promise<void> {
    this.store.open();
    this.mirrorReady = false;
    this.deletionPending = false;
    this.coldFailure = null;
    if (this.snapshot.readiness !== LOADING) this.patch({ readiness: LOADING });
    try {
      await this.hydrate();
    } catch (error) {
      if (error instanceof AccountBoundaryError) return;
      return this.patch({ initError: error instanceof Error ? error.message : 'The local store could not be opened.' });
    }
    this.patch({ initError: null });
    await this.sync();
  }

  /** Ends this engine's hold on the store. A pass still running stops at its next read or write instead of finishing into whatever opens the store next. */
  stop(): void {
    this.store.close();
  }

  async hydrate(): Promise<void> {
    await this.hydrateRows();
    const lastSyncedAt = (await this.store.readMeta<string>(SYNC_META_KEYS.lastSyncedAt)) ?? null;
    const marker = await this.store.readMeta<string | null>(SYNC_META_KEYS.mirrorReady);
    // A mirror synced before the marker existed has only `lastSyncedAt`; an epoch reset writes the marker as null.
    this.mirrorReady = marker === undefined ? lastSyncedAt !== null : marker !== null;
    this.deletionPending = (await this.store.readMeta<boolean>(SYNC_META_KEYS.deletionPending)) === true;
    this.patch({ queuedCount: await this.outbox.size(), lastSyncedAt, readiness: this.readiness() });
  }

  /** Enqueues a command for the server; the caller has already applied it locally. Purely-local commands return without queueing. */
  async enqueue(command: SyncCommand, localDate: string): Promise<EnqueueResult> {
    try {
      const entry = await this.outbox.enqueue(command, localDate);
      if (!entry) return { status: 'local' };
      this.patch({ queuedCount: await this.outbox.size() });
    } catch (error) {
      if (!(error instanceof AccountBoundaryError)) throw error;
      this.leaveAccount(error);
      return { status: 'refused', boundary: error.boundary };
    }
    if (!isOnline()) this.markOffline();
    else if (this.snapshot.state !== 'signed-out') void this.sync();
    return { status: 'queued' };
  }

  dismissNotice(commandId: string): void {
    this.patch({ notices: this.snapshot.notices.filter(notice => notice.commandId !== commandId) });
  }

  /** Flush then pull, serialized — two overlapping passes would post the same batch twice and race the cursor. */
  sync(): Promise<void> {
    return (this.inFlight ??= this.runSync().finally(() => void (this.inFlight = null)));
  }

  private markOffline(): void {
    this.coldFailure = 'offline';
    this.patch({ state: 'offline', readiness: this.readiness() });
  }

  private async runSync(): Promise<void> {
    if (!isOnline()) return this.markOffline();

    this.coldFailure = null;
    this.patch({ state: 'syncing', readiness: this.readiness() });
    try {
      await this.confirmPrincipal();
      await this.store.sweepForeign();
      await this.ensureDeviceRegistered();
      const interrupted = await this.flush();
      const complete = await this.pullUntilStalled();
      const lastSyncedAt = new Date().toISOString();
      await this.recordPull(complete, lastSyncedAt);
      await this.store.writeMeta(SYNC_META_KEYS.lastSyncedAt, lastSyncedAt);
      if (!complete && !this.mirrorReady) this.coldFailure = 'server';
      const state = interrupted || !complete ? 'failed' : 'online';
      this.patch({ state, lastSyncedAt, queuedCount: await this.outbox.size(), readiness: this.readiness(), sending: [] });
    } catch (error) {
      await this.handleFailure(error).catch(ignoreAccountBoundary);
    }
  }

  /**
   * §4.3: a dead session leaves IndexedDB and the outbox exactly as they are. The owner keeps working
   * against local data and the same command ids replay once the same account signs back in. A different
   * account never inherits them: its data is built over a fresh store that empties itself on open.
   */
  private async handleFailure(error: unknown): Promise<void> {
    if (error instanceof AccountBoundaryError) return this.leaveAccount(error);
    const reason = toSyncFailureReason(error, isOnline());
    if (reason === 'deletion-pending') await this.setDeletionPending(true);
    else this.coldFailure = reason;
    this.patch({ state: FAILURE_STATES[reason], queuedCount: await this.outbox.size(), readiness: this.readiness(), sending: [] });
  }

  /** A pulled mirror stays readable through any failure except a deletion, which no retry recovers from; that one holds until a pass succeeds. */
  private readiness(): SyncReadiness {
    if (this.deletionPending) return DELETION_PENDING;
    if (this.mirrorReady) return READY;
    return this.coldFailure ? { kind: 'failed', reason: this.coldFailure } : LOADING;
  }

  private async recordPull(complete: boolean, at: string): Promise<void> {
    await this.setDeletionPending(false);
    if (this.mirrorReady) return;
    await this.store.writeMeta(SYNC_META_KEYS.mirrorReady, complete ? at : null);
    this.mirrorReady = complete;
  }

  private async setDeletionPending(pending: boolean): Promise<void> {
    if (this.deletionPending === pending) return;
    await this.store.writeMeta(SYNC_META_KEYS.deletionPending, pending);
    this.deletionPending = pending;
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

    for (let posted = 0; ; posted += 1) {
      const batch = await this.outbox.nextBatch();
      if (batch.length === 0) break;
      if (posted > 0) await this.confirmPrincipal();

      this.patch({ sending: batch.map(entry => entry.commandId) });
      const response = await this.client.postCommands(batch.map(toEnvelope));
      await this.reconcileEpoch(response.epoch);

      const result = await this.outbox.ack(batch, response.outcomes);
      this.patch({ sending: [] });
      await this.publishProjection();
      notices.push(...result.notices);
      if (result.interrupted) {
        if (notices.length) this.patch({ notices: [...this.snapshot.notices, ...notices] });
        return true;
      }
    }

    if (notices.length) this.patch({ notices: [...this.snapshot.notices, ...notices] });
    return false;
  }

  /** A closed store belongs to an engine nobody renders any more; the other two leave this tab speaking for an account the session no longer is. */
  private leaveAccount(error: AccountBoundaryError): void {
    if (error.boundary === 'closed') return;
    this.patch({ state: 'signed-out', sending: [] });
    this.options.onAccountChanged?.();
  }

  private async confirmPrincipal(): Promise<void> {
    if (this.store.ownerChanged()) throw new AccountBoundaryError('owner-changed');
    const { principal } = this.options;
    if (!principal || this.store.accountId === undefined) return;
    if ((await principal()) !== this.store.accountId) throw new AccountBoundaryError('principal-changed');
  }

  /** Keeps draining past the page budget for as long as the cursor moves; the budget only stops a server that makes no progress. */
  private async pullUntilStalled(): Promise<boolean> {
    for (let round = 0; round < MAX_PULL_ROUNDS; round += 1) {
      const before = await this.store.readMeta<string>(SYNC_META_KEYS.cursor);
      if (await this.pull()) return true;
      if ((await this.store.readMeta<string>(SYNC_META_KEYS.cursor)) === before) return false;
    }
    return false;
  }

  private async pull(): Promise<boolean> {
    for (let page = 0; page < this.maxPages; page += 1) {
      const since = (await this.store.readMeta<string>(SYNC_META_KEYS.cursor)) ?? '0';
      const response = await this.client.pullDelta({ since, domains: SYNC_DOMAINS });
      // Checked after the response: a cookie that changed hands mid-drain has already answered this page as the other account.
      await this.confirmPrincipal();
      const reset = await this.reconcileEpoch(response.epoch);
      if (reset) continue;

      await this.ingest(response.page);
      await this.store.writeMeta(SYNC_META_KEYS.cursor, response.page.cursor);
      if (!response.page.hasMore) return true;
    }
    return false;
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
    await this.publishProjection();
  }

  /** Also runs after an ack, so a queued badge clears even when the pull that follows fails. */
  private async publishProjection(): Promise<void> {
    await Promise.all([...this.projectionListeners].map(listener => listener()));
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

    await this.store.writeMeta(SYNC_META_KEYS.mirrorReady, null);
    this.mirrorReady = false;
    this.patch({ readiness: this.readiness() });
    await this.store.clearMirror();
    await this.hydrateRows();
    return true;
  }

  private patch(next: Partial<SyncSnapshot>): void {
    const readySince = next.readiness === READY && this.snapshot.readiness !== READY ? Date.now() : this.snapshot.readySince;
    this.snapshot = { ...this.snapshot, ...next, readySince };
    for (const listener of this.listeners) listener();
  }
}
