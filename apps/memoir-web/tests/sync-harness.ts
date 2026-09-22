import { type QueryClient } from '@tanstack/react-query';

import { memoirQueryClient } from '@/lib/data';
import {
  type AccountMarker,
  coverageKey,
  type DeltaPage,
  type FetchLike,
  type KeyValueBacking,
  MemoirStore,
  SNAPSHOT_DOMAINS,
  SYNC_DOMAINS,
  SyncClient,
  type SyncDomain,
  SyncedAccountProvider,
  SyncedDataProvider,
  SyncedFinanceProvider,
  SyncedHeroProvider,
  type SyncedMemoirData,
  SyncedQuickLogProvider,
  SyncedReflectProvider,
  SyncEngine,
  type SyncSnapshot,
  type UnloadBacking,
  type WireCommandOutcome,
} from '@/lib/sync';

export interface RecordedBatch {
  commandIds: string[];
  types: string[];
}

/**
 * Polls `predicate` until it is true, for assertions that settle after a promise-chain hop rather than
 * synchronously. Most callers settle within a handful of microtask turns (fake HTTP responses resolve
 * without real I/O), so this drains a few of those — free, no real timer — before falling back to a
 * bounded `setImmediate` loop (the task queue, cheaper than `setTimeout`'s timer overhead) for the rarer
 * case of a macrotask-scheduled continuation. Kept short: a condition that needs the task queue should
 * reach it quickly rather than spend the budget re-checking a microtask queue it will never settle on.
 */
export async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await predicate()) return;
    await Promise.resolve();
  }
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('waitFor: condition was not met before the timeout');
    await new Promise(resolve => setImmediate(resolve));
  }
}

/**
 * The same event-driven trade as {@link waitForState}, for a value that only changes through a React Query
 * cache write (a `useQuery` result observed via `renderHook`, not an engine snapshot): the cache's own
 * `subscribe` fires on every query-cache event, so this settles in one hop rather than a poll loop's budget.
 */
export function waitForQuery(queryClient: QueryClient, predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('waitForQuery: condition was not met before the timeout'));
    }, timeoutMs);
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (!predicate()) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Waits for an engine snapshot the same way a subscriber would, rather than polling for one: `engine.subscribe`
 * already notifies synchronously on every state change, so this settles in exactly one hop instead of
 * however many polling attempts it takes to next observe the queue — the difference that matters when the
 * process is under load and a poll loop's fixed attempt budget stops being "a few free microtask turns".
 */
export function waitForState(engine: SyncEngine, predicate: (snapshot: SyncSnapshot) => boolean, timeoutMs = 1_000): Promise<void> {
  if (predicate(engine.getSnapshot())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('waitForState: condition was not met before the timeout'));
    }, timeoutMs);
    const unsubscribe = engine.subscribe(() => {
      if (!predicate(engine.getSnapshot())) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

export interface FakeServerOptions {
  epoch?: string;
  pages?: DeltaPage[];
  /** One entry per POST, in order; a shorter list than the batch models a run cut short by a failure. */
  outcomes?: (batch: RecordedBatch, attempt: number) => WireCommandOutcome[];
  status?: () => number;
  errorCode?: string;
  /** The domains this server registers; defaults to every domain the web knows. */
  serves?: SyncDomain[];
}

export interface FakeServer {
  fetchImpl: FetchLike;
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

export function domainsExcept(...excluded: SyncDomain[]): SyncDomain[] {
  return SYNC_DOMAINS.filter(domain => !excluded.includes(domain));
}

/** The coverage record a mirror holds once every keyset domain among `domains` is covered. */
export function coverageFor(domains: SyncDomain[]): string[] {
  return domains
    .filter(domain => !SNAPSHOT_DOMAINS.includes(domain))
    .map(coverageKey)
    .sort();
}

/** As the server does, every requested domain it registers is in the page, empty when the page names no rows for it; one it does not know is left out. */
export function deltaResponse(request: RequestInfo | URL, page: DeltaPage, epoch = 'epoch-1', serves: SyncDomain[] = SYNC_DOMAINS): Response {
  const requested = new URL(decodeURIComponent(String(request)), 'http://memoir.test').searchParams.get('domains')?.split(',') ?? SYNC_DOMAINS;
  const domains: DeltaPage['domains'] = {};
  for (const domain of requested) if (serves.some(served => served === domain)) domains[domain] = page.domains[domain] ?? [];
  return new Response(JSON.stringify({ ...page, domains }), { status: 200, headers: { 'x-sync-epoch': epoch, 'content-type': 'application/json' } });
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
    return deltaResponse(url, page, server.epoch, options.serves);
  }) as FetchLike;

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
  unload?: UnloadBacking;
  fetchImpl?: (server: FakeServer) => FetchLike;
  outcomeTimeoutMs?: number;
  maxPages?: number;
}

/** One browser's last-account record, shared by every tab's store the way localStorage is. */
export function sharedMarker(initial: string | null = null): AccountMarker {
  let value = initial;
  return { read: () => value, write: accountId => void (value = accountId) };
}

export function sharedUnload(): UnloadBacking {
  const map = new Map<string, string>();
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: key => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

export function createTestEngine(options: TestEngineOptions = {}): TestEngine {
  const server = createFakeServer(options);
  const store = new MemoirStore(options.backing ?? sharedBacking(), { accountId: options.accountId, marker: options.marker, unload: options.unload });
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

export interface LiveTestEngine extends TestEngine {
  /** What the server holds; each pull returns the rows as they stood when that pull was requested. */
  rows: DeltaPage['domains'];
  /** Starts a pass whose pull has already read the rows but does not answer until released; release resolves once that pass settles. */
  holdPass: () => Promise<() => Promise<void>>;
}

/** A server that changes between pulls, for proving a caller reads rows written after it asked rather than joining a pass that pulled before. */
export function createLiveTestEngine(options: Omit<TestEngineOptions, 'fetchImpl' | 'pages'> = {}): LiveTestEngine {
  let held: { pulled: () => void; released: Promise<void> } | null = null;
  const live = createTestEngine({
    ...options,
    fetchImpl: server => async (input, init) => {
      if (!String(input).includes('/sync/delta') || (options.status?.() ?? 200) !== 200) return server.fetchImpl(input, init);
      server.deltaRequests.push(String(input));
      const domains = { ...subject.rows };
      const hold = held;
      held = null;
      hold?.pulled();
      await hold?.released;
      return deltaResponse(input, { cursor: String(server.deltaRequests.length), hasMore: false, domains, tombstones: [] }, server.epoch, options.serves);
    },
  });

  const holdPass = async (): Promise<() => Promise<void>> => {
    let release = (): void => undefined;
    let pulled = (): void => undefined;
    const reading = new Promise<void>(resolve => (pulled = resolve));
    held = { pulled, released: new Promise<void>(resolve => (release = resolve)) };
    const pass = live.engine.sync({ background: true });
    await reading;
    return () => {
      release();
      return pass;
    };
  };

  const subject: LiveTestEngine = { ...live, rows: {}, holdPass };
  return subject;
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
    persona: 'active',
  };
}
