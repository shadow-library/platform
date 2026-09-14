import { memoirQueryClient } from '@/lib/data';
import {
  type AccountMarker,
  type DeltaPage,
  type KeyValueBacking,
  MemoirStore,
  SyncClient,
  SyncedAccountProvider,
  SyncedDataProvider,
  SyncedFinanceProvider,
  SyncedHeroProvider,
  type SyncedMemoirData,
  SyncedQuickLogProvider,
  SyncedReflectProvider,
  SyncEngine,
  type WireCommandOutcome,
} from '@/lib/sync';

export interface RecordedBatch {
  commandIds: string[];
  types: string[];
}

export interface FakeServerOptions {
  epoch?: string;
  pages?: DeltaPage[];
  /** One entry per POST, in order; a shorter list than the batch models a run cut short by a failure. */
  outcomes?: (batch: RecordedBatch, attempt: number) => WireCommandOutcome[];
  status?: () => number;
  errorCode?: string;
}

export interface FakeServer {
  fetchImpl: typeof fetch;
  batches: RecordedBatch[];
  deltaRequests: string[];
  deviceRegistrations: string[];
  epoch: string;
  pageIndex: number;
}

const EMPTY_PAGE: DeltaPage = { cursor: '0', hasMore: false, domains: {}, tombstones: [] };

export function applied(commandId: string, replayed = false): WireCommandOutcome {
  return { commandId, status: 'applied', result: {}, replayed };
}

export function rejected(commandId: string, message: string, code = 'CMD_002'): WireCommandOutcome {
  return { commandId, status: 'rejected', result: {}, replayed: false, error: { code, message } };
}

export function superseded(commandId: string, result: Record<string, unknown> = {}): WireCommandOutcome {
  return { commandId, status: 'superseded', result, replayed: false };
}

/** Defaults to a rate-limit code, which a resend can clear, so the command stays queued; pass a catalogue refusal such as `QST_003` to model a dead letter. */
export function failed(commandId: string, message = 'transaction rolled back', code = 'S007'): WireCommandOutcome {
  return { commandId, status: 'failed', result: {}, replayed: false, error: { code, message } };
}

export function createFakeServer(options: FakeServerOptions = {}): FakeServer {
  const server: FakeServer = { fetchImpl: null as never, batches: [], deltaRequests: [], deviceRegistrations: [], epoch: options.epoch ?? 'epoch-1', pageIndex: 0 };

  server.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const status = options.status?.() ?? 200;
    const headers = { 'x-sync-epoch': server.epoch, 'content-type': 'application/json' };
    if (status !== 200) return new Response(JSON.stringify({ code: options.errorCode, message: 'no' }), { status, headers });

    if (url.includes('/account/devices/')) {
      server.deviceRegistrations.push(url.split('/').pop() as string);
      return new Response(JSON.stringify({ id: 'device' }), { status: 200, headers });
    }

    if (url.includes('/sync/commands')) {
      const body = JSON.parse(String(init?.body)) as { commands: { commandId: string; type: string }[] };
      const batch: RecordedBatch = { commandIds: body.commands.map(command => command.commandId), types: body.commands.map(command => command.type) };
      const attempt = server.batches.length;
      server.batches.push(batch);
      const outcomes = options.outcomes?.(batch, attempt) ?? batch.commandIds.map(commandId => applied(commandId));
      return new Response(JSON.stringify({ outcomes }), { status: 200, headers });
    }

    server.deltaRequests.push(url);
    const page = options.pages?.[server.pageIndex] ?? EMPTY_PAGE;
    if (options.pages && server.pageIndex < options.pages.length - 1) server.pageIndex += 1;
    return new Response(JSON.stringify(page), { status: 200, headers });
  }) as typeof fetch;

  return server;
}

/** A backing shared across `MemoirStore` instances, so a test can model a restart without an IndexedDB. */
export function sharedBacking(): KeyValueBacking {
  const map = new Map<string, unknown>();
  return {
    get: async key => map.get(key) as never,
    put: async (key, value) => void map.set(key, value),
    delete: async key => void map.delete(key),
    keys: async () => [...map.keys()],
  };
}

export interface TestEngine {
  engine: SyncEngine;
  store: MemoirStore;
  server: FakeServer;
}

export interface TestEngineOptions extends FakeServerOptions {
  backing?: KeyValueBacking;
  today?: string;
  /** Binds the store to an account, as the app does; omitted, the store is unbound and skips every ownership check. */
  accountId?: string;
  principal?: () => Promise<string>;
  onAccountChanged?: () => void;
  marker?: AccountMarker;
  fetchImpl?: (server: FakeServer) => typeof fetch;
  outcomeTimeoutMs?: number;
  maxPages?: number;
}

/** One browser's last-account record, shared by every tab's store the way localStorage is. */
export function sharedMarker(initial: string | null = null): AccountMarker {
  let value = initial;
  return { read: () => value, write: accountId => void (value = accountId) };
}

export function createTestEngine(options: TestEngineOptions = {}): TestEngine {
  const server = createFakeServer(options);
  const store = new MemoirStore(options.backing ?? sharedBacking(), { accountId: options.accountId, marker: options.marker });
  const fetchImpl = options.fetchImpl?.(server) ?? server.fetchImpl;
  const engine = new SyncEngine({
    store,
    client: new SyncClient({ fetchImpl }),
    today: options.today ?? '2026-08-24',
    principal: options.principal,
    onAccountChanged: options.onAccountChanged,
    outcomeTimeoutMs: options.outcomeTimeoutMs,
    maxPages: options.maxPages,
  });
  return { engine, store, server };
}

/** The same composition `createSyncedMemoirData` builds in the app, over a test engine — for a screen that has to read and write through the sync layer rather than the fixtures. */
export function createSyncedTestData(engine: SyncEngine, principal?: () => Promise<string>): SyncedMemoirData {
  const account = new SyncedAccountProvider(engine, principal);
  const finance = new SyncedFinanceProvider(engine);
  const quickLogs = new SyncedQuickLogProvider(engine);
  return {
    engine,
    provider: new SyncedDataProvider(engine),
    hero: new SyncedHeroProvider(engine, account),
    reflect: new SyncedReflectProvider(engine),
    account,
    finance,
    quickLogs,
    queryClient: memoirQueryClient(),
    today: engine.today,
    currency: 'EUR',
    persona: 'active',
  };
}
