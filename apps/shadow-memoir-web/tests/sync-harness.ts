import { type DeltaPage, type KeyValueBacking, MemoirStore, SyncClient, SyncEngine, type WireCommandOutcome } from '@/lib/sync';

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

export function rejected(commandId: string, message: string): WireCommandOutcome {
  return { commandId, status: 'rejected', result: {}, replayed: false, error: { code: 'CMD_002', message } };
}

export function failed(commandId: string, message = 'transaction rolled back'): WireCommandOutcome {
  return { commandId, status: 'failed', result: {}, replayed: false, error: { code: 'CMD_003', message } };
}

export function createFakeServer(options: FakeServerOptions = {}): FakeServer {
  const server: FakeServer = { fetchImpl: null as never, batches: [], deltaRequests: [], deviceRegistrations: [], epoch: options.epoch ?? 'epoch-1', pageIndex: 0 };

  server.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const status = options.status?.() ?? 200;
    const headers = { 'x-sync-epoch': server.epoch, 'content-type': 'application/json' };
    if (status !== 200) return new Response(JSON.stringify({ message: 'no' }), { status, headers });

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

export function createTestEngine(options: FakeServerOptions & { backing?: KeyValueBacking; today?: string } = {}): TestEngine {
  const server = createFakeServer(options);
  const store = new MemoirStore(options.backing ?? sharedBacking());
  const engine = new SyncEngine({ store, client: new SyncClient({ fetchImpl: server.fetchImpl }), today: options.today ?? '2026-08-24' });
  return { engine, store, server };
}
