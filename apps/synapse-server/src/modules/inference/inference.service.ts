import { Injectable } from '@shadow-library/app';
import { type AppError, Logger } from '@shadow-library/common';
import { type SynapseEnvelope, type SynapseResponseBlock } from '@shadow-library/synapse';

import {
  ActiveCatalogCache,
  clampEffort,
  type Effort,
  labelFor,
  type Resolution,
  resolve,
  type ResolvedDeployment,
  type ResolveNeeds,
  roundUsd,
  type TaskKind,
  WEB_SEARCH_PATH,
  type WebSearchToolSpec,
} from '@modules/catalog';
import { CredentialResolver } from '@modules/credentials/credential-resolver.service';
import { type BudgetCounterKey, type CallCost, callCost, imageListCost, type LedgerClaim, MeteringService, NO_COST, type SettledStatus, tokenListCost } from '@modules/metering';
import {
  addUsage,
  assistantTurn,
  type ChatMessage,
  type ChatRequestBody,
  type ChatStreamResult,
  chunkContent,
  completionCalls,
  completionContent,
  type EmbeddingRequestBody,
  type GeneratedImage,
  type ImageRequestBody,
  type JsonObject,
  type NormalizedUsage,
  ProviderCallError,
  ProviderClient,
  type ProviderTarget,
  SEARCH_LIMIT_REASON,
  type SearchCall,
  type SearchOutcome,
  searchQuery,
  StreamedCalls,
  toolResult,
  toOpenAiUsage,
  translateChatRequest,
  type TranslatedRequest,
  translateEmbeddingRequest,
  translateImageRequest,
  WebSearchClient,
  WebSearchError,
  withoutCalls,
} from '@modules/providers';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { dispatchFailure, providersExhausted } from './dispatch-failure.util';
import { InflightRequests } from './inflight-requests.service';
import { type RequestAbort } from './request-abort';
import { chatNeeds } from './request-needs.util';
import { type ChatStreamSink, type SseWriteResult } from './sse-sink';
import { errorBodyOf } from './synapse-error.util';

export type InferenceBody<T> = T & { synapse: SynapseEnvelope };

export interface ImageGenerationResult {
  data: GeneratedImage[];
  usage: { cost: number };
  synapse: SynapseResponseBlock;
}

interface Admission {
  progress: CallProgress;
  envelope: SynapseEnvelope;
  catalogVersion: number;
  resolution: Resolution;
  effort?: Effort;
  claim: LedgerClaim;
  counters: BudgetCounterKey[];
  /** The search Synapse runs itself, as the admitted catalog version configures it */
  webSearch?: WebSearchToolSpec;
}

/** One call's hosted search: the deployment every later round stays on, the conversation so far and the searches spent */
interface SearchRun {
  body: InferenceBody<ChatRequestBody>;
  target: ProviderTarget;
  deployment: ResolvedDeployment;
  apiKey: string | undefined;
  spec: WebSearchToolSpec;
  messages: ChatMessage[];
  searches: number;
}

interface Served<T> {
  value: T;
  deployment: ResolvedDeployment;
}

interface OpenedStream {
  stream: ChatStreamResult;
  first: IteratorResult<JsonObject>;
  webSearch?: boolean;
  search?: SearchRun;
}

interface Outcome {
  cost: CallCost;
  usage?: NormalizedUsage;
  errorCode?: string;
}

interface BlockExtras {
  webSearch?: boolean;
  webSearches?: number;
  dimensions?: number;
}

const DONE = '[DONE]';
const RESET_EVENT = { type: 'reset', reason: 'web_search' } as const;

class CallProgress {
  readonly startedAt = Date.now();
  attempts = 0;
  deployment?: ResolvedDeployment;
  firstChunkAt?: number;
}

function stringMember(payload: JsonObject | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberMember(payload: JsonObject | undefined, key: string): number | undefined {
  const value = payload?.[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Dispatch for every inference route: resolve against the active catalog, claim the request id, admit budgets, then try the resolution's
 * deployments in order. A deployment is abandoned for the next only on a retryable failure that reached the caller with nothing, so a
 * stream is committed to, and its headers written, only once its first chunk has arrived. Settlement runs after the answer and never fails it.
 */
@Injectable()
export class InferenceService {
  private readonly logger = Logger.getLogger(APP_NAME, InferenceService.name);

  constructor(
    private readonly catalog: ActiveCatalogCache,
    private readonly providers: ProviderClient,
    private readonly metering: MeteringService,
    private readonly inflight: InflightRequests,
    private readonly credentials: CredentialResolver,
    private readonly webSearch: WebSearchClient,
  ) {}

  async completeChat(app: string, body: InferenceBody<ChatRequestBody>, abort: RequestAbort): Promise<JsonObject> {
    const admission = await this.admit(app, 'chat', body.model, body.synapse, chatNeeds(body), false, abort);
    let usage: NormalizedUsage | undefined;
    let searches = 0;
    try {
      const { value, deployment } = await this.serve(admission, abort, async (target, deployment) => {
        const apiKey = await this.apiKey(deployment);
        const translated = this.translateChat(body, admission, deployment, apiKey);
        const result = await this.providers.sendChat(target, translated, { stream: false, signal: abort.signal, responseModel: admission.resolution.taskKey });
        return { result, webSearch: translated.webSearch, search: this.searchRun(admission, translated, body, target, deployment, apiKey) };
      });
      const { webSearch, search } = value;
      let { response } = value.result;
      usage = value.result.usage;
      while (search) {
        const calls = completionCalls(response);
        if (calls.length === 0) break;
        if (search.searches >= search.spec.maxSearches) {
          response = withoutCalls(response);
          break;
        }
        await this.answerCalls(search, completionContent(response), calls, abort.signal);
        searches = search.searches;
        const next = await this.providers.sendChat(search.target, this.searchRound(admission, search), {
          stream: false,
          signal: abort.signal,
          responseModel: admission.resolution.taskKey,
        });
        usage = addUsage(usage, next.usage);
        response = next.response;
      }
      const cost = this.chatCost(admission, deployment, usage, searches);
      this.settle(admission, 'ok', { cost, ...(usage ? { usage } : {}) });
      const reported = usage ? { usage: toOpenAiUsage(usage) } : {};
      const extras: BlockExtras = { ...(webSearch === undefined ? {} : { webSearch }), ...(search ? { webSearches: searches } : {}) };
      return { ...response, ...reported, synapse: this.block(admission, deployment, cost, extras) };
    } catch (error) {
      throw this.failed(admission, error, abort, usage, searches);
    }
  }

  async streamChat(app: string, body: InferenceBody<ChatRequestBody>, abort: RequestAbort, sink: ChatStreamSink): Promise<void> {
    const admission = await this.admit(app, 'chat', body.model, body.synapse, chatNeeds(body), true, abort);
    let opened: Served<OpenedStream>;
    try {
      opened = await this.serve(admission, abort, async (target, deployment) => {
        const apiKey = await this.apiKey(deployment);
        const translated = this.translateChat(body, admission, deployment, apiKey);
        const stream = await this.providers.sendChat(target, translated, { stream: true, signal: abort.signal, responseModel: admission.resolution.taskKey });
        const first = await stream.chunks.next();
        const search = this.searchRun(admission, translated, body, target, deployment, apiKey);
        return { stream, first, ...(translated.webSearch === undefined ? {} : { webSearch: translated.webSearch }), ...(search ? { search } : {}) };
      });
    } catch (error) {
      throw this.failed(admission, error, abort);
    }
    admission.progress.firstChunkAt = Date.now();
    await this.relay(admission, abort, sink, opened);
  }

  async embed(app: string, body: InferenceBody<EmbeddingRequestBody>, abort: RequestAbort): Promise<JsonObject> {
    const admission = await this.admit(app, 'embedding', body.model, body.synapse, {}, false, abort);
    try {
      const { value: result, deployment } = await this.serve(admission, abort, async (target, deployment) => {
        const apiKey = await this.apiKey(deployment);
        const translated = translateEmbeddingRequest({ body, provider: deployment.provider, providerKey: deployment.providerKey, deploymentId: deployment.id, apiKey });
        return this.providers.sendEmbeddings(target, translated, { signal: abort.signal, responseModel: admission.resolution.taskKey });
      });
      const cost = this.tokenCost(admission, deployment, result.usage);
      this.settle(admission, 'ok', { cost, ...(result.usage ? { usage: result.usage } : {}) });
      const dimensions = admission.resolution.model.capabilities.embedding?.dimensions;
      const usage = result.usage ? { usage: { prompt_tokens: result.usage.inputTokens, total_tokens: result.usage.inputTokens } } : {};
      return { ...result.response, ...usage, synapse: this.block(admission, deployment, cost, { ...(dimensions === undefined ? {} : { dimensions }) }) };
    } catch (error) {
      throw this.failed(admission, error, abort);
    }
  }

  async generateImages(app: string, body: InferenceBody<ImageRequestBody>, abort: RequestAbort): Promise<ImageGenerationResult> {
    const admission = await this.admit(app, 'image', body.model, body.synapse, {}, false, abort);
    try {
      const { value: result, deployment } = await this.serve(admission, abort, async (target, deployment) => {
        const apiKey = await this.apiKey(deployment);
        const translated = translateImageRequest({ body, provider: deployment.provider, providerKey: deployment.providerKey, deploymentId: deployment.id, apiKey });
        return this.providers.sendImages(target, translated, { signal: abort.signal, responseModel: admission.resolution.taskKey });
      });
      const listUsd = imageListCost(result.data.length, admission.resolution.model.pricePerMTok);
      const cost = callCost(listUsd, deployment.provider.cost, result.upstreamCostUsd);
      this.settle(admission, 'ok', { cost });
      return { data: result.data, usage: { cost: cost.billedUsd }, synapse: this.block(admission, deployment, cost, {}) };
    } catch (error) {
      throw this.failed(admission, error, abort);
    }
  }

  /**
   * A request refused before its id is claimed, a caller already gone among them, leaves no ledger row and spends no budget; once claimed,
   * every outcome settles it.
   */
  private async admit(app: string, kind: TaskKind, task: string, envelope: SynapseEnvelope, needs: ResolveNeeds, stream: boolean, abort: RequestAbort): Promise<Admission> {
    const progress = new CallProgress();
    const catalog = this.catalog.requireCurrent();
    const { selectors, alias } = envelope;
    const resolution = resolve(catalog.document, { app, task, needs, ...(selectors ? { selectors } : {}), ...(alias === undefined ? {} : { alias }) });
    if (resolution.task.kind !== kind) throw AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'model', task, kind: resolution.task.kind });
    const effort = kind === 'chat' ? clampEffort(resolution.task, resolution.model, envelope.effort) : undefined;

    const claim: LedgerClaim = {
      requestId: envelope.request_id,
      app,
      subject: envelope.subject,
      task: resolution.taskKey,
      model: resolution.modelKey,
      catalogVersion: catalog.version,
      stream,
      ...(resolution.alias ? { alias: resolution.alias.key } : {}),
      ...(effort ? { effort } : {}),
    };
    if (abort.signal.aborted) throw dispatchFailure(undefined, abort.cause).error;
    await this.metering.claim(claim);

    const webSearch = kind === 'chat' && envelope.web_search === true ? catalog.document.tools?.webSearch : undefined;
    const admission: Admission = {
      progress,
      envelope,
      catalogVersion: catalog.version,
      resolution,
      claim,
      counters: [],
      ...(effort ? { effort } : {}),
      ...(webSearch ? { webSearch } : {}),
    };
    try {
      admission.counters = await this.metering.admit({ budgets: catalog.document.budgets, app, subject: envelope.subject, now: new Date() });
    } catch (error) {
      throw this.failed(admission, error, undefined);
    }
    return admission;
  }

  private async serve<T>(admission: Admission, abort: RequestAbort, call: (target: ProviderTarget, deployment: ResolvedDeployment) => Promise<T>): Promise<Served<T>> {
    const { progress } = admission;
    let last: ProviderCallError | undefined;
    for (const deployment of admission.resolution.deployments) {
      if (abort.signal.aborted) break;
      progress.attempts++;
      progress.deployment = deployment;
      const target: ProviderTarget = { providerKey: deployment.providerKey, provider: deployment.provider, deploymentId: deployment.id, model: admission.resolution.model };
      try {
        return { value: await call(target, deployment), deployment };
      } catch (error) {
        if (!(error instanceof ProviderCallError) || !error.retryable || error.bytesSent || abort.signal.aborted) throw error;
        last = error;
        this.logger.debug('Failing over to the next deployment', {
          requestId: admission.claim.requestId,
          provider: deployment.providerKey,
          code: error.code,
          status: error.status,
        });
      }
    }
    if (abort.signal.aborted) throw new ProviderCallError({ retryable: false, code: 'aborted', message: 'The call was cancelled' });
    throw providersExhausted(last);
  }

  /**
   * After the first chunk nothing fails over: a failure is an error frame without `[DONE]`, and a caller that is gone gets nothing more.
   * Whatever ends the relay early cancels the upstream stream, so its in-flight slot is released before the call is settled. A hosted search
   * runs between rounds of one stream: a round's text is relayed as it arrives, its tool calls never are, and a round that turns out to search
   * after relaying text sends a reset event so the caller drops what it showed.
   */
  private async relay(admission: Admission, abort: RequestAbort, sink: ChatStreamSink, opened: Served<OpenedStream>): Promise<void> {
    const { value, deployment } = opened;
    const { first, webSearch, search } = value;
    const head = first.done ? undefined : first.value;
    let stream = value.stream;
    let pending: IteratorResult<JsonObject> | undefined = first;
    let usage: NormalizedUsage | undefined;
    let counted: ChatStreamResult | undefined;

    let open = false;
    let written: SseWriteResult = 'written';
    let failure: unknown;
    try {
      sink.open();
      open = true;
      while (written === 'written') {
        const calls = search ? new StreamedCalls() : undefined;
        let relayedText = false;
        while (written === 'written') {
          const next = pending ?? (await stream.chunks.next());
          pending = undefined;
          if (next.done) break;
          const chunk = calls ? calls.take(next.value) : next.value;
          if (!chunk) continue;
          written = await sink.send(JSON.stringify(chunk));
          relayedText ||= chunkContent(chunk) !== '';
        }
        if (written !== 'written' || !search || !calls || calls.empty) break;
        const round = await stream.settled;
        if (round.status !== 'ok') break;
        usage = addUsage(usage, round.usage);
        counted = stream;
        if (relayedText) written = await sink.send(JSON.stringify(this.resetFrame(admission, head)));
        if (written !== 'written') break;
        if (search.searches >= search.spec.maxSearches) break;
        await this.answerCalls(search, '', calls.list(), abort.signal);
        stream = await this.providers.sendChat(search.target, this.searchRound(admission, search), {
          stream: true,
          signal: abort.signal,
          responseModel: admission.resolution.taskKey,
        });
      }
    } catch (error) {
      failure = error;
    }
    if (written !== 'written') abort.abort(written === 'stalled' ? 'stalled' : 'client');
    if (written !== 'written' || failure !== undefined) await stream.chunks.return?.();

    const settled = await stream.settled;
    const searches = search?.searches ?? 0;
    if (stream !== counted) usage = addUsage(usage, settled.usage);
    const cost = this.chatCost(admission, deployment, usage, searches);
    if (written === 'written' && failure === undefined && settled.status === 'ok') {
      const extras: BlockExtras = { ...(webSearch === undefined ? {} : { webSearch }), ...(search ? { webSearches: searches } : {}) };
      const final = {
        id: stringMember(head, 'id') ?? `chatcmpl-${admission.claim.requestId}`,
        object: 'chat.completion.chunk',
        created: numberMember(head, 'created') ?? Math.floor(Date.now() / 1000),
        model: admission.resolution.taskKey,
        choices: [],
        usage: usage ? toOpenAiUsage(usage) : null,
        synapse: this.block(admission, deployment, cost, extras),
      };
      if ((await sink.send(JSON.stringify(final))) === 'written') await sink.send(DONE);
      sink.end();
      this.settle(admission, 'ok', { cost, ...(usage ? { usage } : {}) });
      return;
    }

    const error = this.failed(admission, failure ?? (settled.status === 'ok' ? undefined : settled.error), abort, usage, searches);
    if (!open) throw error;
    if (abort.cause !== 'client' && abort.cause !== 'stalled') await sink.send(JSON.stringify(errorBodyOf(error)));
    sink.end();
  }

  private resetFrame(admission: Admission, head: JsonObject | undefined): JsonObject {
    return {
      id: stringMember(head, 'id') ?? `chatcmpl-${admission.claim.requestId}`,
      object: 'chat.completion.chunk',
      created: numberMember(head, 'created') ?? Math.floor(Date.now() / 1000),
      model: admission.resolution.taskKey,
      choices: [],
      synapse_event: RESET_EVENT,
    };
  }

  private searchRun(
    admission: Admission,
    translated: TranslatedRequest,
    body: InferenceBody<ChatRequestBody>,
    target: ProviderTarget,
    deployment: ResolvedDeployment,
    apiKey: string | undefined,
  ): SearchRun | undefined {
    if (!translated.hostedSearch || !admission.webSearch) return undefined;
    return { body, target, deployment, apiKey, spec: admission.webSearch, messages: [...body.messages], searches: 0 };
  }

  /** The next round of a hosted search; the last one the limit allows may only answer */
  private searchRound(admission: Admission, search: SearchRun): TranslatedRequest {
    const translated = this.translateChat({ ...search.body, messages: search.messages }, admission, search.deployment, search.apiKey);
    if (search.searches >= search.spec.maxSearches) translated.body['tool_choice'] = 'none';
    return translated;
  }

  /** Every call gets an answer, as the tool protocol requires: results, the reason a search failed, or the limit it ran into */
  private async answerCalls(search: SearchRun, content: string, calls: SearchCall[], signal: AbortSignal): Promise<void> {
    const outcomes = await Promise.all(
      calls.map(call => {
        const query = searchQuery(call);
        if (query === undefined) return { ok: false, reason: 'the call named no query' } satisfies SearchOutcome;
        if (search.searches >= search.spec.maxSearches) return { ok: false, reason: SEARCH_LIMIT_REASON } satisfies SearchOutcome;
        search.searches++;
        return this.runSearch(search.spec, query, signal);
      }),
    );
    search.messages.push(assistantTurn(content, calls), ...calls.map((call, index) => toolResult(call, outcomes[index] as SearchOutcome)));
  }

  /** A search that fails tells the model why rather than failing the call: the answer goes on without it */
  private async runSearch(spec: WebSearchToolSpec, query: string, signal: AbortSignal): Promise<SearchOutcome> {
    try {
      const apiKey = await this.credentials.resolveFor(spec, WEB_SEARCH_PATH);
      return { ok: true, results: await this.webSearch.search(spec, apiKey, query, signal) };
    } catch (error) {
      if (error instanceof WebSearchError) return { ok: false, reason: error.reason };
      this.logger.error('The web search tool could not run', { error });
      return { ok: false, reason: 'web search is unavailable right now' };
    }
  }

  private apiKey(deployment: ResolvedDeployment): Promise<string | undefined> {
    return this.credentials.resolve(deployment.provider, deployment.providerKey);
  }

  private translateChat(body: InferenceBody<ChatRequestBody>, admission: Admission, deployment: ResolvedDeployment, apiKey: string | undefined): TranslatedRequest {
    const { model } = admission.resolution;
    return translateChatRequest({
      body,
      model,
      provider: deployment.provider,
      providerKey: deployment.providerKey,
      deploymentId: deployment.id,
      effort: admission.effort ?? null,
      envelope: admission.envelope,
      apiKey,
      hostedSearch: admission.webSearch !== undefined,
    });
  }

  private tokenCost(admission: Admission, deployment: ResolvedDeployment, usage: NormalizedUsage | undefined): CallCost {
    return callCost(tokenListCost(usage, admission.resolution.model.pricePerMTok), deployment.provider.cost, usage?.upstreamCostUsd);
  }

  /** The search engine bills each search whatever the model's provider costs, so searches add to what was billed as well as to the list price */
  private chatCost(admission: Admission, deployment: ResolvedDeployment, usage: NormalizedUsage | undefined, searches: number): CallCost {
    const tokens = this.tokenCost(admission, deployment, usage);
    const searchUsd = searches * (admission.webSearch?.pricePerSearchUsd ?? 0);
    if (searchUsd === 0) return tokens;
    return { listUsd: roundUsd(tokens.listUsd + searchUsd), billedUsd: roundUsd(tokens.billedUsd + searchUsd) };
  }

  private block(admission: Admission, deployment: ResolvedDeployment, cost: CallCost, extras: BlockExtras): SynapseResponseBlock {
    const { resolution, claim } = admission;
    return {
      request_id: claim.requestId,
      task: resolution.taskKey,
      alias: resolution.alias?.key ?? null,
      label: labelFor(resolution.alias?.spec, resolution.model),
      model: resolution.modelKey,
      provider: deployment.providerKey,
      effort: admission.effort ?? null,
      attempts: admission.progress.attempts,
      catalog_version: admission.catalogVersion,
      cost: { list_usd: cost.listUsd, billed_usd: cost.billedUsd },
      ...(extras.webSearch === undefined ? {} : { web_search: extras.webSearch }),
      ...(extras.webSearches === undefined ? {} : { web_searches: extras.webSearches }),
      ...(extras.dimensions === undefined ? {} : { dimensions: extras.dimensions }),
    };
  }

  /** Tokens a cancelled stream had already reported, and searches already run, still cost */
  private failed(admission: Admission, error: unknown, abort: RequestAbort | undefined, usage?: NormalizedUsage, searches = 0): AppError {
    const failure = dispatchFailure(error, abort?.cause);
    const { deployment } = admission.progress;
    const cost = (usage || searches > 0) && deployment ? this.chatCost(admission, deployment, usage, searches) : NO_COST;
    this.settle(admission, failure.status, { cost, errorCode: failure.error.code, ...(usage ? { usage } : {}) });
    return failure.error;
  }

  private settle(admission: Admission, status: SettledStatus, outcome: Outcome): void {
    const { deployment, firstChunkAt, startedAt, attempts } = admission.progress;
    const settlement = this.metering.settle({
      claim: admission.claim,
      counters: admission.counters,
      outcome: {
        status,
        cost: outcome.cost,
        latencyMs: Date.now() - startedAt,
        attempts,
        ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
        ...(outcome.usage ? { usage: outcome.usage } : {}),
        ...(firstChunkAt === undefined ? {} : { ttftMs: firstChunkAt - startedAt }),
        ...(deployment ? { provider: deployment.providerKey, deploymentId: deployment.id } : {}),
      },
    });
    this.inflight.track(settlement);
  }
}
