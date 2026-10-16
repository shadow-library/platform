import { type SynapseEnvelope } from '@shadow-library/synapse';

import { type ActiveCatalog, type CatalogDocument, type ModelSpec } from '@modules/catalog/catalog.types';
import { type ActiveCatalogCache, type CatalogTimers } from '@modules/catalog/active-catalog.cache';
import { InferenceService } from '@modules/inference/inference.service';
import { InflightRequests } from '@modules/inference/inflight-requests.service';
import { type RequestAbort } from '@modules/inference/request-abort';
import { type ChatStreamSink, type SseWriteResult } from '@modules/inference/sse-sink';
import { MeteringService } from '@modules/metering/metering.service';
import { ProviderClient } from '@modules/providers/provider-client.service';
import { type ProviderFetch } from '@modules/providers/provider.types';
import { AppErrorCode } from '@server/classes';

import { FakeMeteringRepository } from '../metering/fake-metering.repository';

const CHAT: ModelSpec['capabilities'] = {
  tools: true,
  structuredOutput: 'native',
  vision: false,
  reasoning: 'optional',
  efforts: ['low', 'medium', 'high'],
  promptCache: 'none',
  sampling: true,
};

const DOCUMENT: CatalogDocument = {
  providers: {
    flaky: { kind: 'openai', flavor: 'openai-compatible', url: 'https://flaky.test/v1', locality: 'third_party', cost: 'metered' },
    mock: { kind: 'mock', url: 'mock://local', locality: 'in_cluster', cost: 'zero' },
    openrouter: {
      kind: 'openai',
      flavor: 'openrouter',
      url: 'https://openrouter.test/api/v1',
      apiKeyConfig: 'synapse.provider.openrouter.api-key',
      locality: 'third_party',
      cost: 'metered',
    },
  },
  models: {
    opus: {
      label: 'Claude Opus',
      version: '5.5',
      capabilities: CHAT,
      pricePerMTok: { input: 5, cachedInput: 0.5, output: 25 },
      deployments: [
        { provider: 'flaky', id: 'vendor/opus' },
        { provider: 'mock', id: 'echo' },
      ],
    },
    routed: { label: 'Routed', capabilities: CHAT, pricePerMTok: { input: 1, output: 2 }, deployments: [{ provider: 'openrouter', id: 'vendor/routed' }] },
    embedder: {
      label: 'Embedder',
      capabilities: { ...CHAT, tools: false, reasoning: 'none', efforts: [], embedding: { dimensions: 8 } },
      pricePerMTok: { input: 0.02, output: 0 },
      deployments: [{ provider: 'mock', id: 'embed' }],
    },
    painter: {
      label: 'Painter',
      capabilities: { ...CHAT, tools: false, reasoning: 'none', efforts: [], imageOutput: true },
      pricePerMTok: { input: 0, output: 0, perImage: 0.04 },
      deployments: [{ provider: 'openrouter', id: 'vendor/painter' }],
    },
  },
  aliases: { opus: { label: 'Opus', model: 'opus', showVersion: true, state: 'active' } },
  tasks: {
    'novel-forge.chat': { kind: 'chat', requires: [], effort: { default: 'low', min: 'low', max: 'high' }, dataPolicy: 'any', aliases: ['opus'], routes: [{ model: 'opus' }] },
    'novel-forge.routed': { kind: 'chat', requires: [], dataPolicy: 'any', routes: [{ model: 'routed' }] },
    'novel-forge.embedding': { kind: 'embedding', requires: ['embedding'], dataPolicy: 'any', pinned: true, routes: [{ model: 'embedder' }] },
    'novel-forge.image': { kind: 'image', requires: ['image_output'], dataPolicy: 'any', routes: [{ model: 'painter' }] },
  },
  budgets: [{ app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 50 }],
};

export const APP = 'novel-forge';

export function catalogDocument(change?: (document: CatalogDocument) => void): CatalogDocument {
  const document = structuredClone(DOCUMENT);
  change?.(document);
  return document;
}

export function envelope(overrides: Partial<SynapseEnvelope> = {}): SynapseEnvelope {
  return { request_id: 'req-1', subject: { type: 'owner', id: 'o-1' }, ...overrides };
}

export class FakeTimers implements CatalogTimers {
  readonly delays: { delayMs: number; fire: () => void; cancelled: boolean }[] = [];

  every(): () => void {
    return () => undefined;
  }

  after(delayMs: number): { elapsed: Promise<void>; cancel: () => void } {
    let fire = (): void => undefined;
    const elapsed = new Promise<void>(resolve => (fire = resolve));
    const delay = { delayMs, fire, cancelled: false };
    this.delays.push(delay);
    return { elapsed, cancel: () => (delay.cancelled = true) };
  }
}

export type Responder = (url: string, init: RequestInit) => Promise<Response> | Response;

/** Answers each upstream call with the next responder queued for its URL prefix */
export class ScriptedFetch {
  readonly calls: { url: string; body: Record<string, unknown> }[] = [];
  private readonly queues = new Map<string, Responder[]>();
  private readonly waiters: { count: number; resolve: () => void }[] = [];

  on(prefix: string, ...responders: Responder[]): this {
    this.queues.set(prefix, [...(this.queues.get(prefix) ?? []), ...responders]);
    return this;
  }

  /** Resolves once the upstream has been called `count` times in all */
  untilCalled(count = 1): Promise<void> {
    if (this.calls.length >= count) return Promise.resolve();
    return new Promise(resolve => this.waiters.push({ count, resolve }));
  }

  readonly fetch: ProviderFetch = async (url, init) => {
    this.calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    for (const waiter of this.waiters.filter(candidate => candidate.count <= this.calls.length)) waiter.resolve();
    for (const [prefix, queue] of this.queues) {
      if (url.startsWith(prefix) && queue.length > 0) return (queue.shift() as Responder)(url, init);
    }
    throw new Error(`no scripted answer for ${url}`);
  };
}

export const json =
  (status: number, body: unknown): Responder =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Never answers; rejects with the request's abort reason once it is aborted */
export const hanging: Responder = (_url, init) =>
  new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error), { once: true }));

export function sseBody(...frames: (object | string)[]): string {
  return frames.map(frame => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`).join('');
}

export const sse =
  (...frames: (object | string)[]): Responder =>
  () =>
    new Response(sseBody(...frames), { status: 200, headers: { 'content-type': 'text/event-stream' } });

/** Sends the frames, then stays open until the request is aborted */
export const openSse =
  (...frames: object[]): Responder =>
  (_url, init) => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

export function chunk(content: string, finish: string | null = null): object {
  return { id: 'chatcmpl-up', object: 'chat.completion.chunk', created: 1700000000, model: 'vendor/opus', choices: [{ index: 0, delta: { content }, finish_reason: finish }] };
}

/** Records every frame; `onSend` may answer a write with a failure, or act on the request mid-stream */
export class FakeSink implements ChatStreamSink {
  readonly frames: string[] = [];
  opened = 0;
  ended = 0;
  onSend: (data: string, index: number) => SseWriteResult = () => 'written';
  openFailure: Error | undefined;

  open(): void {
    if (this.openFailure) throw this.openFailure;
    this.opened++;
  }

  async send(data: string): Promise<SseWriteResult> {
    const result = this.onSend(data, this.frames.length);
    if (result === 'written') this.frames.push(data);
    return result;
  }

  end(): void {
    this.ended++;
  }

  parsed(): Record<string, unknown>[] {
    return this.frames.filter(frame => frame !== '[DONE]').map(frame => JSON.parse(frame) as Record<string, unknown>);
  }
}

export interface Harness {
  service: InferenceService;
  providers: ProviderClient;
  repository: FakeMeteringRepository;
  fetcher: ScriptedFetch;
  inflight: InflightRequests;
  timers: FakeTimers;
  begin(): RequestAbort;
}

export function harness(document: CatalogDocument | null = catalogDocument(), version = 7): Harness {
  const active: ActiveCatalog | null = document ? { version, document } : null;
  const cache = { requireCurrent: () => active ?? AppErrorCode.SYN_NO_ACTIVE_CATALOG.throw() } as unknown as ActiveCatalogCache;
  const repository = new FakeMeteringRepository();
  const fetcher = new ScriptedFetch();
  const timers = new FakeTimers();
  const inflight = new InflightRequests(timers);
  const providers = new ProviderClient(fetcher.fetch);
  const service = new InferenceService(cache, providers, new MeteringService(repository.asRepository()), inflight);
  return { service, providers, repository, fetcher, inflight, timers, begin: () => inflight.begin() };
}

export async function failureOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}
