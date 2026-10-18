import { Inject, Injectable, InjectionToken } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { providerDialect } from './chat-translation.util';
import { createMockFetch } from './mock.provider';
import { classifyHttpFailure, classifyPayloadError, ProviderCallError, trimUpstreamMessage, upstreamErrorOf } from './provider-call.error';
import { type GeneratedImage, type JsonObject, type NormalizedUsage, type ProviderFetch, type ProviderTarget, type TranslatedRequest } from './provider.types';
import { type ChatChunkOptions, type ChatStreamState, readChatChunks } from './sse.util';
import { asRecord, callerPayload, parseJson } from './upstream-payload.util';
import { parseServedModel, parseUsage, type UsageParseOptions } from './usage.util';

export interface ProviderCallOptions {
  /** Combined with the request timeout */
  signal?: AbortSignal;
  /** Replaces `model` in what is returned, so the caller sees the task id */
  responseModel?: string;
}

export interface ChatCallOptions extends ProviderCallOptions {
  stream: boolean;
}

/** `response` carries neither `usage` nor the gateway block: dispatch writes its own usage from `usage` */
export interface ChatCompletionResult {
  response: JsonObject;
  usage?: NormalizedUsage;
  servedModel?: string;
}

interface SettlementDetail {
  usage?: NormalizedUsage;
  servedModel?: string;
  chunks: number;
}

export type StreamSettlement =
  | ({ status: 'ok' } & SettlementDetail)
  | ({ status: 'error'; error: ProviderCallError } & SettlementDetail)
  | ({ status: 'cancelled'; error: ProviderCallError } & SettlementDetail);

/**
 * `chunks` yields the content chunks; `settled` always resolves, once, after the stream ends, fails or is cancelled. Iterating to the end,
 * breaking out of the loop, calling `chunks.return()` and aborting the call's signal each end it and release its in-flight slot.
 */
export interface ChatStreamResult {
  chunks: AsyncIterableIterator<JsonObject>;
  settled: Promise<StreamSettlement>;
}

export interface EmbeddingResult {
  response: JsonObject;
  usage?: NormalizedUsage;
}

export interface ImageResult {
  data: GeneratedImage[];
  upstreamCostUsd?: number;
}

export const PROVIDER_FETCH = new InjectionToken<ProviderFetch>('PROVIDER_FETCH');

/** Following one would carry the authorization header to wherever the upstream points, past the origin its key is bound to */
function isRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

/** The caller's signal, the request timeout and a local cancel as one signal, and the call's in-flight slot */
class CallScope {
  readonly signal: AbortSignal;
  private readonly timeout = new AbortController();
  private readonly cancellation = new AbortController();
  private readonly timer?: ReturnType<typeof setTimeout>;

  constructor(
    callerSignal: AbortSignal | undefined,
    private readonly timeoutMs: number,
    private readonly release: () => void,
  ) {
    const signals = [this.timeout.signal, this.cancellation.signal];
    if (callerSignal) signals.push(callerSignal);
    this.signal = AbortSignal.any(signals);
    if (timeoutMs > 0) this.timer = setTimeout(() => this.timeout.abort(new DOMException('The upstream call timed out', 'TimeoutError')), timeoutMs);
  }

  cancel(): void {
    this.cancellation.abort(new DOMException('The call was cancelled', 'AbortError'));
  }

  abortError(bytesSent: boolean): ProviderCallError | undefined {
    if (!this.signal.aborted) return undefined;
    const timedOut = this.timeout.signal.aborted;
    const message = timedOut ? `The upstream call timed out after ${this.timeoutMs}ms` : 'The call was cancelled';
    return new ProviderCallError({ retryable: false, bytesSent, code: timedOut ? 'timeout' : 'aborted', message });
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.release();
  }
}

@Injectable()
export class ProviderClient {
  private readonly logger = Logger.getLogger(APP_NAME, ProviderClient.name);
  private readonly inflight = new Map<string, number>();

  constructor(@Inject(PROVIDER_FETCH) private readonly fetcher: ProviderFetch) {}

  inflightCount(providerKey: string): number {
    return this.inflight.get(providerKey) ?? 0;
  }

  sendChat(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions & { stream: true }): Promise<ChatStreamResult>;
  sendChat(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions & { stream: false }): Promise<ChatCompletionResult>;
  sendChat(target: ProviderTarget, translated: TranslatedRequest, options: ChatCallOptions): Promise<ChatStreamResult | ChatCompletionResult>;
  async sendChat(target: ProviderTarget, translated: TranslatedRequest, options: ChatCallOptions): Promise<ChatStreamResult | ChatCompletionResult> {
    const usageOptions = this.usageOptions(target);
    if (options.stream) return this.openStream(target, translated, options, usageOptions);
    const payload = await this.call(target, translated, options, ['choices']);
    const usage = parseUsage(payload['usage'], usageOptions);
    const servedModel = parseServedModel(payload);
    this.logServed(target, servedModel);
    return { response: callerPayload(payload, options.responseModel), ...(usage ? { usage } : {}), ...(servedModel ? { servedModel } : {}) };
  }

  async sendEmbeddings(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions = {}): Promise<EmbeddingResult> {
    const usageOptions = this.usageOptions(target);
    const payload = await this.call(target, translated, options, ['data']);
    const usage = parseUsage(payload['usage'], usageOptions);
    return { response: callerPayload(payload, options.responseModel), ...(usage ? { usage } : {}) };
  }

  async sendImages(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions = {}): Promise<ImageResult> {
    const usageOptions = this.usageOptions(target);
    const payload = await this.call(target, translated, options, ['data']);
    const items = Array.isArray(payload['data']) ? payload['data'].map(asRecord) : [];
    const data = items.flatMap(item => {
      const b64 = item?.['b64_json'];
      const mediaType = item?.['media_type'];
      return typeof b64 === 'string' && b64.length > 0 ? [{ b64_json: b64, media_type: typeof mediaType === 'string' ? mediaType : 'image/png' }] : [];
    });
    if (data.length === 0) throw this.failed(target, new ProviderCallError({ retryable: false, code: 'invalid_response', message: 'The provider returned no image data' }));
    const upstreamCostUsd = parseUsage(payload['usage'], usageOptions)?.upstreamCostUsd;
    return { data, ...(upstreamCostUsd === undefined ? {} : { upstreamCostUsd }) };
  }

  private acquire(target: ProviderTarget): () => void {
    const { providerKey } = target;
    const max = target.provider.maxInflightPerReplica;
    const current = this.inflightCount(providerKey);
    if (max !== undefined && current >= max) {
      throw this.failed(target, new ProviderCallError({ retryable: true, code: 'capacity', message: `Provider '${providerKey}' is at its in-flight cap of ${max}` }));
    }
    this.inflight.set(providerKey, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = this.inflightCount(providerKey) - 1;
      if (remaining > 0) this.inflight.set(providerKey, remaining);
      else this.inflight.delete(providerKey);
    };
  }

  private scope(target: ProviderTarget, signal: AbortSignal | undefined): CallScope {
    const release = this.acquire(target);
    return new CallScope(signal, Config.get('synapse.request.timeout-ms') ?? 0, release);
  }

  private async call(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions, members: string[]): Promise<JsonObject> {
    const scope = this.scope(target, options.signal);
    try {
      const response = await this.open(target, translated, scope);
      const payload = await this.readPayload(response, scope, members);
      const aborted = scope.abortError(false);
      if (aborted) throw aborted;
      return payload;
    } catch (error) {
      throw this.failed(target, this.classify(error, scope, false));
    } finally {
      scope.dispose();
    }
  }

  private async openStream(target: ProviderTarget, translated: TranslatedRequest, options: ProviderCallOptions, usageOptions: UsageParseOptions): Promise<ChatStreamResult> {
    const scope = this.scope(target, options.signal);
    let body: ReadableStream<Uint8Array>;
    try {
      const response = await this.open(target, translated, scope);
      if (!response.body) throw new ProviderCallError({ retryable: false, code: 'invalid_response', message: 'The upstream answered a stream with no body' });
      body = response.body;
    } catch (error) {
      scope.dispose();
      throw this.failed(target, this.classify(error, scope, false));
    }
    return this.streamChunks(target, body, scope, { ...usageOptions, ...(options.responseModel ? { responseModel: options.responseModel } : {}) });
  }

  private streamChunks(target: ProviderTarget, body: ReadableStream<Uint8Array>, scope: CallScope, chunkOptions: Omit<ChatChunkOptions, 'signal'>): ChatStreamResult {
    const state: ChatStreamState = { done: false, finished: false, chunks: 0 };
    let resolveSettled: (settlement: StreamSettlement) => void = () => undefined;
    const settled = new Promise<StreamSettlement>(resolve => (resolveSettled = resolve));
    let open = true;

    const detail = (): SettlementDetail => ({
      chunks: state.chunks,
      ...(state.usage ? { usage: state.usage } : {}),
      ...(state.servedModel ? { servedModel: state.servedModel } : {}),
    });
    const settle = (error?: ProviderCallError): void => {
      if (!open) return;
      open = false;
      scope.signal.removeEventListener('abort', onAbort);
      scope.dispose();
      if (!error) {
        this.logServed(target, state.servedModel);
        return resolveSettled({ status: 'ok', ...detail() });
      }
      const cancelled = error.code === 'aborted' || error.code === 'timeout';
      this.failed(target, error);
      resolveSettled({ status: cancelled ? 'cancelled' : 'error', error, ...detail() });
    };
    // Settles a stream that is never iterated, and drops its connection; one being read is ended by the reader's own abort listener.
    const onAbort = (): void => {
      if (!body.locked) void body.cancel().catch(() => undefined);
      settle(scope.abortError(state.chunks > 0));
    };
    scope.signal.addEventListener('abort', onAbort, { once: true });
    // An abort that landed between the response arriving and this listener would otherwise never fire it.
    if (scope.signal.aborted) onAbort();

    const classify = (error: unknown): ProviderCallError => this.classify(error, scope, state.chunks > 0);
    async function* iterate(): AsyncGenerator<JsonObject> {
      try {
        yield* readChatChunks(body, state, { ...chunkOptions, signal: scope.signal });
        const aborted = scope.abortError(state.chunks > 0);
        if (aborted) throw aborted;
        settle();
      } catch (error) {
        const failure = classify(error);
        settle(failure);
        throw failure;
      } finally {
        if (open) {
          scope.cancel();
          settle(scope.abortError(state.chunks > 0));
        }
      }
    }

    const generator = iterate();
    const chunks: AsyncIterableIterator<JsonObject> = {
      [Symbol.asyncIterator]: () => chunks,
      next: () => generator.next(),
      return: async () => {
        scope.cancel();
        return generator.return(undefined);
      },
    };
    return { chunks, settled };
  }

  private async open(target: ProviderTarget, translated: TranslatedRequest, scope: CallScope): Promise<Response> {
    const fetcher = target.provider.kind === 'mock' ? createMockFetch(target) : this.fetcher;
    let response: Response;
    try {
      response = await fetcher(translated.url, { method: 'POST', headers: translated.headers, body: JSON.stringify(translated.body), redirect: 'manual', signal: scope.signal });
    } catch (error) {
      throw scope.abortError(false) ?? this.sendFailure(error);
    }
    if (response.ok) return response;
    if (isRedirect(response)) {
      await response.body?.cancel().catch(() => undefined);
      const redirected = new ProviderCallError({
        retryable: false,
        status: response.status,
        code: 'redirected',
        message: `The upstream answered a redirect (HTTP ${response.status}), which is never followed`,
      });
      throw scope.abortError(false) ?? redirected;
    }
    const text = await response.text().catch(() => '');
    throw scope.abortError(false) ?? classifyHttpFailure(response.status, text);
  }

  private async readPayload(response: Response, scope: CallScope, members: string[]): Promise<JsonObject> {
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw scope.abortError(false) ?? new ProviderCallError({ retryable: false, code: 'upstream_read', message: 'The upstream response could not be read', cause: error });
    }
    const payload = asRecord(parseJson(text));
    if (!payload) throw new ProviderCallError({ retryable: false, code: 'invalid_response', message: 'The upstream answered with a body that is not a JSON object' });
    const arrays = members.map(member => payload[member]).filter(value => Array.isArray(value));
    if (arrays.some(array => array.length > 0)) return payload;
    const error = upstreamErrorOf(payload);
    if (error) throw classifyPayloadError(error, false);
    if (arrays.length > 0) return payload;
    throw new ProviderCallError({ retryable: false, code: 'invalid_response', message: `The upstream answered without ${members.join(' or ')}` });
  }

  private classify(error: unknown, scope: CallScope, bytesSent: boolean): ProviderCallError {
    if (error instanceof ProviderCallError) return error;
    return (
      scope.abortError(bytesSent) ?? new ProviderCallError({ retryable: false, bytesSent, code: 'upstream_read', message: 'The upstream stream could not be read', cause: error })
    );
  }

  // Bun's fetch raises a TypeError, quoting the offending value, for a request it cannot build (a bad URL, a header it cannot carry); it is
  // never a network failure, and its message may hold a credential, so it is neither retried nor kept.
  private sendFailure(error: unknown): ProviderCallError {
    if (error instanceof TypeError) return new ProviderCallError({ retryable: false, code: 'invalid_request', message: 'The upstream request could not be built' });
    const reason = error instanceof Error ? trimUpstreamMessage(error.message) : '';
    const message = reason ? `The upstream could not be reached: ${reason}` : 'The upstream could not be reached';
    return new ProviderCallError({ retryable: true, code: 'connect', message, cause: error });
  }

  private usageOptions(target: ProviderTarget): UsageParseOptions {
    return { withCost: providerDialect(target.provider, target.providerKey) === 'openrouter' };
  }

  private logServed(target: ProviderTarget, servedModel: string | undefined): void {
    if (servedModel) this.logger.debug('The gateway served a chat call', { provider: target.providerKey, deployment: target.deploymentId, servedModel });
  }

  private failed(target: ProviderTarget, error: ProviderCallError): ProviderCallError {
    const { providerKey: provider, deploymentId: deployment } = target;
    const metadata = { provider, deployment, status: error.status, code: error.code, retryable: error.retryable, bytesSent: error.bytesSent, reason: error.message };
    if (error.code === 'aborted') this.logger.debug('Provider call cancelled', metadata);
    else this.logger.warn(error.code === 'timeout' ? 'Provider call timed out' : 'Provider call failed', metadata);
    return error;
  }
}
