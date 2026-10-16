import { Injectable } from '@shadow-library/app';
import { type AppError, Logger } from '@shadow-library/common';
import { type SynapseEnvelope, type SynapseResponseBlock } from '@shadow-library/synapse';

import { ActiveCatalogCache, clampEffort, type Effort, labelFor, type Resolution, resolve, type ResolvedDeployment, type ResolveNeeds, type TaskKind } from '@modules/catalog';
import { type BudgetCounterKey, type CallCost, callCost, imageListCost, type LedgerClaim, MeteringService, NO_COST, type SettledStatus, tokenListCost } from '@modules/metering';
import {
  type ChatRequestBody,
  type ChatStreamResult,
  type EmbeddingRequestBody,
  type GeneratedImage,
  type ImageRequestBody,
  type JsonObject,
  type NormalizedUsage,
  ProviderCallError,
  ProviderClient,
  type ProviderTarget,
  toOpenAiUsage,
  translateChatRequest,
  type TranslatedRequest,
  translateEmbeddingRequest,
  translateImageRequest,
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
}

interface Served<T> {
  value: T;
  deployment: ResolvedDeployment;
}

interface OpenedStream {
  stream: ChatStreamResult;
  first: IteratorResult<JsonObject>;
  webSearch?: boolean;
}

interface Outcome {
  cost: CallCost;
  usage?: NormalizedUsage;
  errorCode?: string;
}

interface BlockExtras {
  webSearch?: boolean;
  dimensions?: number;
}

const DONE = '[DONE]';

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
  ) {}

  async completeChat(app: string, body: InferenceBody<ChatRequestBody>, abort: RequestAbort): Promise<JsonObject> {
    const admission = await this.admit(app, 'chat', body.model, body.synapse, chatNeeds(body), false, abort);
    try {
      const { value, deployment } = await this.serve(admission, abort, async (target, deployment) => {
        const translated = this.translateChat(body, admission, deployment);
        const result = await this.providers.sendChat(target, translated, { stream: false, signal: abort.signal, responseModel: admission.resolution.taskKey });
        return { result, webSearch: translated.webSearch };
      });
      const { result, webSearch } = value;
      const cost = this.tokenCost(admission, deployment, result.usage);
      this.settle(admission, 'ok', { cost, ...(result.usage ? { usage: result.usage } : {}) });
      const usage = result.usage ? { usage: toOpenAiUsage(result.usage) } : {};
      return { ...result.response, ...usage, synapse: this.block(admission, deployment, cost, { ...(webSearch === undefined ? {} : { webSearch }) }) };
    } catch (error) {
      throw this.failed(admission, error, abort);
    }
  }

  async streamChat(app: string, body: InferenceBody<ChatRequestBody>, abort: RequestAbort, sink: ChatStreamSink): Promise<void> {
    const admission = await this.admit(app, 'chat', body.model, body.synapse, chatNeeds(body), true, abort);
    let opened: Served<OpenedStream>;
    try {
      opened = await this.serve(admission, abort, async (target, deployment) => {
        const translated = this.translateChat(body, admission, deployment);
        const stream = await this.providers.sendChat(target, translated, { stream: true, signal: abort.signal, responseModel: admission.resolution.taskKey });
        const first = await stream.chunks.next();
        return { stream, first, ...(translated.webSearch === undefined ? {} : { webSearch: translated.webSearch }) };
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
      const { value: result, deployment } = await this.serve(admission, abort, (target, deployment) => {
        const translated = translateEmbeddingRequest({ body, provider: deployment.provider, providerKey: deployment.providerKey, deploymentId: deployment.id });
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
      const { value: result, deployment } = await this.serve(admission, abort, (target, deployment) => {
        const translated = translateImageRequest({ body, provider: deployment.provider, providerKey: deployment.providerKey, deploymentId: deployment.id });
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

    const admission: Admission = { progress, envelope, catalogVersion: catalog.version, resolution, claim, counters: [], ...(effort ? { effort } : {}) };
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
   * Whatever ends the relay early cancels the upstream stream, so its in-flight slot is released before the call is settled.
   */
  private async relay(admission: Admission, abort: RequestAbort, sink: ChatStreamSink, opened: Served<OpenedStream>): Promise<void> {
    const { value, deployment } = opened;
    const { stream, first, webSearch } = value;
    const head = first.done ? undefined : first.value;

    let open = false;
    let written: SseWriteResult = 'written';
    let failure: unknown;
    try {
      sink.open();
      open = true;
      if (head) written = await sink.send(JSON.stringify(head));
      while (written === 'written') {
        const next = await stream.chunks.next();
        if (next.done) break;
        written = await sink.send(JSON.stringify(next.value));
      }
    } catch (error) {
      failure = error;
    }
    if (written !== 'written') abort.abort(written === 'stalled' ? 'stalled' : 'client');
    if (written !== 'written' || failure !== undefined) await stream.chunks.return?.();

    const settled = await stream.settled;
    const cost = this.tokenCost(admission, deployment, settled.usage);
    if (written === 'written' && failure === undefined && settled.status === 'ok') {
      const synapse = this.block(admission, deployment, cost, { ...(webSearch === undefined ? {} : { webSearch }) });
      const final = {
        id: stringMember(head, 'id') ?? `chatcmpl-${admission.claim.requestId}`,
        object: 'chat.completion.chunk',
        created: numberMember(head, 'created') ?? Math.floor(Date.now() / 1000),
        model: admission.resolution.taskKey,
        choices: [],
        usage: settled.usage ? toOpenAiUsage(settled.usage) : null,
        synapse,
      };
      if ((await sink.send(JSON.stringify(final))) === 'written') await sink.send(DONE);
      sink.end();
      this.settle(admission, 'ok', { cost, ...(settled.usage ? { usage: settled.usage } : {}) });
      return;
    }

    const error = this.failed(admission, failure ?? (settled.status === 'ok' ? undefined : settled.error), abort, settled.usage);
    if (!open) throw error;
    if (abort.cause !== 'client' && abort.cause !== 'stalled') await sink.send(JSON.stringify(errorBodyOf(error)));
    sink.end();
  }

  private translateChat(body: InferenceBody<ChatRequestBody>, admission: Admission, deployment: ResolvedDeployment): TranslatedRequest {
    const { model } = admission.resolution;
    return translateChatRequest({
      body,
      model,
      provider: deployment.provider,
      providerKey: deployment.providerKey,
      deploymentId: deployment.id,
      effort: admission.effort ?? null,
      envelope: admission.envelope,
    });
  }

  private tokenCost(admission: Admission, deployment: ResolvedDeployment, usage: NormalizedUsage | undefined): CallCost {
    return callCost(tokenListCost(usage, admission.resolution.model.pricePerMTok), deployment.provider.cost, usage?.upstreamCostUsd);
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
      ...(extras.dimensions === undefined ? {} : { dimensions: extras.dimensions }),
    };
  }

  /** Tokens a cancelled stream had already reported still cost */
  private failed(admission: Admission, error: unknown, abort: RequestAbort | undefined, usage?: NormalizedUsage): AppError {
    const failure = dispatchFailure(error, abort?.cause);
    const { deployment } = admission.progress;
    const cost = usage && deployment ? this.tokenCost(admission, deployment, usage) : NO_COST;
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
