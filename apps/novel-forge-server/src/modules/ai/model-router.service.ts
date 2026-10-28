import { createHash } from 'node:crypto';

import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage, HumanMessage, type MessageContent, SystemMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type SchemaClass } from '@shadow-library/class-schema';
import { AppError, Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import {
  isSynapseError,
  SynapseClient,
  type SynapseImage,
  type SynapseImageRequest,
  type SynapseImageResponse,
  type SynapseResponseBlock,
  type SynapseSubject,
} from '@shadow-library/synapse';
import { isSynapseReset, SynapseChatModel } from '@shadow-library/synapse/langchain';

import { AppErrorCode } from '@server/classes';
import { type OwnerFields } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ai, type PrimaryDatabase, type Project, schema } from '@server/database';

import { type ForgeCallPolicy } from '../plugins/plugin-policy.service';
import { type AiRole, DEFAULT_COST_TIER, isCostTier } from './defaults';
import { scopedCostTier } from './cost-tier-scope';
import {
  findHardLine,
  HARD_LINE_SYSTEM_LINE,
  hardLineError,
  inputScreens,
  isHardLineRefusal,
  outputScope,
  outputScreens,
  type RequestGuard,
  type ScreenedText,
  screenTexts,
  wireMessageTexts,
} from './hard-line';
import { extractJsonCandidates, tryParseJson } from './json-extract';
import { applyAnthropicCacheControl } from './prompt-caching';
import { type PromptModule } from './prompts/types';
import { type ChangeSetElement, ReplyStreamScanner } from './reply-stream-scanner';
import { parseSchema, renderSchemaIssues, type SchemaIssue, type SchemaParseResult, toConstrainedSchema, toHostedPromptSchema } from './schemas/validate';
import { synapseCallFailed } from './synapse-failure';
import {
  guardRequestHook,
  ownerSubject,
  projectSubject,
  SYNAPSE_IMAGE_TASK,
  SYNAPSE_PROVIDER,
  synapseChatTask,
  synapseRouting,
  synapseSelectors,
  synapseTask,
  UNOWNED_SUBJECT,
} from './synapse-request';
import { type AnsweredHook, failureDetail, failureStatus, synapseBilling, type TelemetryContext, TelemetryHandler } from './telemetry.handler';
import { modelCallFailed, ModelCallTimeoutError } from './transient-model-error';

interface StreamSink {
  chunk: (text: string) => void;
  reset: () => void;
}

export type ProjectConfig = OwnerFields & {
  contentMode?: string;
  costTier?: Project.CostTier | null;
  wordTargetMin?: number | null;
  wordTargetMax?: number | null;
};

/** What Synapse is asked for: the role's task under the call's selectors. Which model answers is Synapse's choice. */
export interface ModelRoute {
  task: string;
  costTier: Project.CostTier;
  contentMode: Project.ContentMode;
}

interface TelemetryConfig {
  callbacks: TelemetryHandler[];
  metadata: Record<string, unknown>;
}

export interface SynapseModelOptions {
  subject: SynapseSubject;
  telemetry?: TelemetryConfig;
  responseSchema?: ResponseSchema;
  webTools?: boolean;
  session?: string;
}

/** A structured call's output schema, sent as its `response_format`; Synapse decides per model whether it is native or prompted. */
export interface ResponseSchema {
  /** `^[A-Za-z0-9_-]+$`, the OpenAI rule for a schema name. */
  name: string;
  schema: Record<string, unknown>;
}

export type ConstrainableOutput = Pick<PromptModule<unknown>, 'key' | 'schema' | 'constrainedProperties'>;

export interface ImageRequest {
  prompt: string;
  n: number;
  /** Reference images for image-to-image work, as HTTP(S) or `data:` URLs. */
  inputReferences?: string[];
}

export interface GeneratedImage {
  bytes: Uint8Array;
  contentType: string;
}

interface ImageCallRecord {
  provider: string;
  model: string;
  status: Ai.ModelCallStatus;
  attempt: number;
  latencyMs: number;
  costUsd?: number;
  costSource?: Ai.CostSource;
  error?: Record<string, unknown>;
}

const REFERENCE_IMAGES_PARAM = /^reference_images(\.|$)/;

// Synapse carries no per-model reference limit; it validates `reference_images` against its own request cap and names the refused field as `param`.
function refusedReferences(err: unknown): boolean {
  const cause = err instanceof Error ? err.cause : undefined;
  return isSynapseError(cause) && REFERENCE_IMAGES_PARAM.test(cause.param ?? '');
}

function decodeImages(data: readonly Partial<SynapseImage>[]): GeneratedImage[] {
  return data.flatMap(item => (item.b64_json ? [{ bytes: new Uint8Array(Buffer.from(item.b64_json, 'base64')), contentType: item.media_type || 'image/png' }] : []));
}

function responseSchemaFor(output: ConstrainableOutput): ResponseSchema {
  return { name: output.key.replace(/[^A-Za-z0-9_-]/g, '_'), schema: toConstrainedSchema(output.schema, output.constrainedProperties) };
}

function pluginScreens(policy: ForgeCallPolicy | undefined): ScreenedText[] {
  return (policy?.systemMessages ?? []).map(message => ({ text: message.content, scope: 'background', source: "A plugin's instructions" }));
}

// Deterministic verification/extraction roles: identical input must yield identical output, so their
// results are safe to cache. Creative roles (generation, revision, plan, outline, chat…) are never
// cached — caching them would make a re-request return byte-identical prose.
const CACHEABLE_ROLES = new Set<AiRole>(['judge', 'validation', 'continuity', 'extraction', 'review', 'audit', 'compact']);

function afterLeadingSystemMessages(messages: BaseMessage[], inserted: BaseMessage[]): BaseMessage[] {
  let insertAt = 0;
  while (messages[insertAt]?.getType() === 'system') insertAt++;
  return [...messages.slice(0, insertAt), ...inserted, ...messages.slice(insertAt)];
}

// `prompt.contribute`: contributions land directly after the module's own leading system messages and
// before cache control, so the three Anthropic breakpoints still key on the module's static system message.
function withPluginSystemMessages(messages: BaseMessage[], policy?: ForgeCallPolicy): BaseMessage[] {
  if (!policy?.systemMessages.length) return messages;
  return afterLeadingSystemMessages(
    messages,
    policy.systemMessages.map(message => new SystemMessage(message.content)),
  );
}

function withImageAttached(messages: BaseMessage[], image: string): BaseMessage[] {
  const imagePart = { type: 'image_url', image_url: { url: image } };
  const lastHuman = messages.map(message => message.getType()).lastIndexOf('human');
  if (lastHuman === -1) return [...messages, new HumanMessage({ content: [imagePart] })];
  const { content } = messages[lastHuman] as BaseMessage;
  const textParts = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  return messages.map((message, index) => (index === lastHuman ? new HumanMessage({ content: [...textParts, imagePart] }) : message));
}

// A model asked for a top-level array often returns it wrapped as `{ <key>: [...] }`. Unwrapping is
// doubly gated — the schema must be a top-level array and the value a non-array object with exactly
// one array-valued property — so it can only turn a certain AJV failure into a possible success.
function normalizeForSchema(schema: SchemaClass, data: unknown): unknown {
  if (!Array.isArray(schema)) return data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : data;
}

// Folds the module postValidate issues into the same success/failure shape so the repair ladder treats them identically.
function applyPostValidate<T>(result: SchemaParseResult<T>, postValidate?: (data: T) => string[]): SchemaParseResult<T> {
  if (!result.success || !postValidate) return result;
  const messages = postValidate(result.data);
  if (messages.length === 0) return result;
  const issues: SchemaIssue[] = messages.map(message => ({ path: [], message }));
  return { success: false, issues };
}

function reportAnswer(metadata: Record<string, unknown> | undefined, onAnswered?: AnsweredHook): void {
  const synapse = metadata?.['synapse'] as Partial<SynapseResponseBlock> | undefined;
  if (onAnswered && typeof synapse?.model === 'string' && typeof synapse.provider === 'string') onAnswered({ provider: synapse.provider, model: synapse.model });
}

export interface StreamedChange {
  /** Order among the changes this response emitted, from 0; restarts after `onReset`. */
  index: number;
  element: ChangeSetElement;
}

export interface ReplyStreamHandlers {
  /** Newly decoded text of the response's top-level `reply` field; never called with an empty string. */
  onDelta: (text: string) => void;
  /** An object element of the response's top-level `changeSet`, the moment it closes. Provisional: the returned value decides what the response held. */
  onChange?: (change: StreamedChange) => void;
  /** Everything emitted so far, deltas and changes alike, is void: repair replaced it, or the hard line refused it. */
  onReset?: () => void;
}

function messageText(content: MessageContent): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

// `invoke` stringifies a whole non-string content block; a stream must concatenate the text parts instead,
// because stringifying each chunk on its own would never reassemble into the model's JSON payload.
function streamChunkText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => ('text' in part && typeof part.text === 'string' ? part.text : '')).join('');
}

// Display-only sink. A handler that throws — an SSE write to a connection the browser already dropped —
// must never fail the model call, so the first failure retires the sink and the turn finishes unstreamed.
const SENTENCE_END = /[.!?\n]["'”’)\]]*/g;

function lastSentenceEnd(text: string): number {
  let end = 0;
  for (const match of text.matchAll(SENTENCE_END)) end = match.index + match[0].length;
  return end;
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringLeaves);
  return [];
}

class ReplyStreamRelay {
  private scanner = new ReplyStreamScanner();
  private streamed = '';
  private changes: string[] = [];
  private retired = false;
  private held = '';
  private withheld = false;

  /**
   * `refuses`: an unrestricted reply is released a whole sentence at a time, each screened first, so refused text never reaches the client;
   * a change is screened whole, and one it refuses is never shown.
   */
  constructor(
    private readonly handlers: ReplyStreamHandlers,
    private readonly onSinkError: (err: unknown) => void,
    private readonly refuses?: (text: string) => boolean,
  ) {}

  get replyFound(): boolean {
    return this.scanner.replyFound;
  }

  push(chunk: string): void {
    const text = this.scanner.push(chunk);
    if (text) {
      this.streamed += text;
      this.forward(text, false);
    }
    for (const element of this.visibleChanges(this.scanner)) {
      const index = this.changes.length;
      this.changes.push(JSON.stringify(element));
      this.emit(() => this.handlers.onChange?.({ index, element }));
    }
  }

  restart(): void {
    this.scanner = new ReplyStreamScanner();
    this.held = '';
    this.withheld = false;
    if (!this.streamed && this.changes.length === 0) return;
    this.streamed = '';
    this.changes = [];
    this.emit(() => this.handlers.onReset?.());
  }

  settle(rawResponse: string): void {
    this.forward('', true);
    if (!this.streamed && this.changes.length === 0) return;
    const final = new ReplyStreamScanner();
    const reply = final.push(rawResponse);
    const changes = this.visibleChanges(final).map(element => JSON.stringify(element));
    if (this.streamed === reply && changes.length === this.changes.length && changes.every((change, index) => change === this.changes[index])) return;
    this.emit(() => this.handlers.onReset?.());
  }

  private visibleChanges(scanner: ReplyStreamScanner): ChangeSetElement[] {
    const elements = scanner.takeChangeSetElements();
    if (!this.handlers.onChange) return [];
    const refuses = this.refuses;
    return refuses ? elements.filter(element => !refuses(stringLeaves(element).join('\n'))) : elements;
  }

  private forward(text: string, final: boolean): void {
    if (!this.refuses) {
      if (text) this.emit(() => this.handlers.onDelta(text));
      return;
    }
    if (this.withheld) return;
    this.held += text;
    const cut = final ? this.held.length : lastSentenceEnd(this.held);
    if (cut === 0) return;
    const ready = this.held.slice(0, cut);
    this.held = this.held.slice(cut);
    if (this.refuses(ready)) {
      this.withheld = true;
      this.held = '';
      return;
    }
    this.emit(() => this.handlers.onDelta(ready));
  }

  private emit(send: () => void): void {
    if (this.retired) return;
    try {
      send();
    } catch (err) {
      this.retired = true;
      this.onSinkError(err);
    }
  }
}

@Injectable()
export class ModelRouterService {
  private readonly logger = Logger.getLogger(APP_NAME, ModelRouterService.name);
  private readonly db: PrimaryDatabase;
  private readonly llmTimeoutMs = Config.get('ai.llm.timeout-ms') ?? 300_000;
  // An AbortController lives only in the process running the run; a cancel taken by another replica reaches it through
  // `workflow_runs.cancel_requested_at`, which RunCancellationService watches and turns into `abortRun` here.
  private readonly runAborts = new Map<string, AbortController>();

  constructor(
    private readonly telemetry: TelemetryHandler,
    private readonly databaseService: DatabaseService,
    private readonly synapse: SynapseClient,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Opens the cancellation channel for a run; `WorkflowRunService` must call `releaseRunSignal` on every exit path. */
  bindRunSignal(runId: string): AbortSignal {
    const controller = this.runAborts.get(runId) ?? new AbortController();
    this.runAborts.set(runId, controller);
    return controller.signal;
  }

  releaseRunSignal(runId: string): void {
    this.runAborts.delete(runId);
  }

  /** Returns whether this replica holds the run, the one place its abort can land; aborting an already-aborted run is a no-op. */
  abortRun(runId: string): boolean {
    const controller = this.runAborts.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  // A plugin may raise a call to the permissive class, and no policy can lower a project whose own contentMode is already unrestricted — the
  // raise-only rule is structural at the routing sink. The tier is a chat turn's action's, then the project's.
  routeModel(role: AiRole, project?: ProjectConfig, policy?: ForgeCallPolicy): ModelRoute {
    const costTier = scopedCostTier() ?? (isCostTier(project?.costTier) ? project.costTier : DEFAULT_COST_TIER);
    const contentMode: Project.ContentMode = project?.contentMode === 'unrestricted' || policy?.writerClass === 'permissive' ? 'unrestricted' : 'standard';
    return { task: synapseTask(role), costTier, contentMode };
  }

  // Telemetry is bound into the client rather than passed per invoke so every tool-loop round, the `bindTools` copy included, writes its own
  // `model_calls` row. `output` is the module whose schema the final answer must match, sent as its `response_format`.
  async chatFor(role: AiRole, ctx?: TelemetryContext, project?: ProjectConfig, policy?: ForgeCallPolicy, output?: ConstrainableOutput): Promise<BaseChatModel> {
    const route = this.routeModel(role, project, policy);
    this.logger.debug('Routing a chat client', { role, task: route.task, costTier: route.costTier, contentMode: route.contentMode });
    const options = { ...(ctx ? { telemetry: this.invokeConfig(ctx, route, policy, 0) } : {}), ...(output ? { responseSchema: responseSchemaFor(output) } : {}) };
    const llm = this.buildSynapseClient(role, route, { ...options, subject: await this.subjectFor(ctx?.projectId, project) });
    const runSignal = this.runSignalFor(ctx);
    // `withConfig` answers a ChatOpenAI that keeps the signal through `bindTools`, though it is typed as a plain Runnable.
    return runSignal ? (llm.withConfig({ signal: runSignal }) as unknown as BaseChatModel) : llm;
  }

  /** A Synapse chat model for `role` on `route`: the role is the task, the route's tier and content mode its selectors; effort, structured mode and caching are Synapse's. */
  buildSynapseClient(role: AiRole, route: ModelRoute, opts: SynapseModelOptions): SynapseChatModel {
    const guard = this.hardLineGuard(route);
    return new SynapseChatModel({
      client: this.synapse,
      task: synapseChatTask(role),
      envelope: {
        subject: opts.subject,
        ...synapseRouting(route),
        ...(opts.session ? { session: opts.session } : {}),
        ...(opts.webTools ? { web_search: true } : {}),
      },
      ...(guard ? { requestHook: guardRequestHook(guard) } : {}),
      ...(opts.responseSchema ? { modelKwargs: { response_format: { type: 'json_schema', json_schema: opts.responseSchema } } } : {}),
      ...opts.telemetry,
    });
  }

  private async subjectFor(projectId: bigint | undefined, project?: ProjectConfig): Promise<SynapseSubject> {
    if (project?.ownerKind !== undefined) return ownerSubject({ ownerKind: project.ownerKind, ownerId: project.ownerId });
    if (projectId === undefined) return UNOWNED_SUBJECT;
    return projectSubject(this.db, projectId);
  }

  private runSignalFor(ctx: TelemetryContext | undefined): AbortSignal | undefined {
    return ctx?.runId ? this.runAborts.get(ctx.runId)?.signal : undefined;
  }

  async structured<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, ctx: TelemetryContext, project?: ProjectConfig, policy?: ForgeCallPolicy): Promise<T> {
    return this.runStructured(promptModule, input, ctx, project, policy);
  }

  /** `structured` with one image on the last human message, kept out of `input` so the debug snapshot and request hash never carry it; never served from `llm_cache`. */
  async structuredWithImage<T>(
    promptModule: PromptModule<T>,
    input: Record<string, unknown>,
    image: string,
    ctx: TelemetryContext,
    project?: ProjectConfig,
    policy?: ForgeCallPolicy,
  ): Promise<T> {
    return this.runStructured(promptModule, input, ctx, project, policy, image);
  }

  /**
   * `structured` that also streams the response's `reply` field as it decodes. The stream is advisory:
   * the returned value is the same parsed-and-repaired object `structured` returns, and `onReset` fires whenever
   * what was already emitted is void — repair changed the reply, or the hard line refused it.
   */
  async streamStructured<T>(
    promptModule: PromptModule<T>,
    input: Record<string, unknown>,
    ctx: TelemetryContext,
    stream: ReplyStreamHandlers,
    project?: ProjectConfig,
    policy?: ForgeCallPolicy,
  ): Promise<T> {
    return this.runStructured(promptModule, input, ctx, project, policy, undefined, stream);
  }

  private async runStructured<T>(
    promptModule: PromptModule<T>,
    input: Record<string, unknown>,
    ctx: TelemetryContext,
    project?: ProjectConfig,
    policy?: ForgeCallPolicy,
    image?: string,
    stream?: ReplyStreamHandlers,
  ): Promise<T> {
    const role = promptModule.role ?? (promptModule.key as AiRole);
    const route = this.routeModel(role, project, policy);
    await this.refuseHardLine(route, [...inputScreens(input), ...pluginScreens(policy)], ctx);
    const session = ctx.gatewaySession;
    const options = { webTools: ctx.webTools === true, responseSchema: responseSchemaFor(promptModule), ...(session ? { session } : {}) };
    const llm = this.buildSynapseClient(role, route, { ...options, subject: await this.subjectFor(ctx.projectId, project) });
    const messages = await this.buildMessages(promptModule, input, { policy, image, schemaInSystem: session !== undefined });
    if (ctx.onMessages) {
      try {
        ctx.onMessages(messages, { provider: SYNAPSE_PROVIDER, model: route.task });
      } catch (err) {
        this.logger.warn('onMessages callback failed — the call proceeds unsnapshotted', { role, runId: ctx.runId, err });
      }
    }
    const refuses = route.contentMode === 'unrestricted' ? (text: string) => findHardLine([text], outputScope(role)) !== null : undefined;
    const relay = stream ? new ReplyStreamRelay(stream, err => this.logger.warn('Reply stream sink failed — finishing the turn unstreamed', { role, err }), refuses) : null;
    // Input carries the rendered context pack and user prose, so it rides on debug only.
    this.logger.debug('structured: invoking model', {
      role,
      task: route.task,
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      runId: ctx.runId,
      node: ctx.node,
      inputKeys: Object.keys(input),
      input,
      withImage: image !== undefined,
    });

    const cacheable = image === undefined && CACHEABLE_ROLES.has(role);
    const cacheRouting = cacheable ? await this.synapseCacheRouting(route) : undefined;
    const requestHash = cacheRouting ? this.hashRequest(promptModule, input, cacheRouting, policy) : null;
    if (requestHash) {
      const cached = await this.db.query.llmCache.findFirst({ where: eq(schema.llmCache.requestHash, requestHash) });
      if (cached) {
        const parsedCached = this.parseOutput(promptModule, tryParseJson(cached.response));
        if (parsedCached.success) {
          this.logger.debug('LLM cache hit — skipping model call', { role, requestHash });
          await this.refuseOutput(route, role, parsedCached.data, ctx, relay);
          relay?.push(cached.response);
          relay?.settle(cached.response);
          return parsedCached.data;
        }
        this.logger.debug('LLM cache row present but no longer parses — re-invoking', { role, requestHash });
      }
    }

    const runSignal = this.runSignalFor(ctx);
    const firstConfig = this.invokeConfig(ctx, route, policy, 0);
    const rawOutput1 = relay
      ? await this.streamOnce(llm, messages, firstConfig, route, relay, runSignal, ctx.onAnswered)
      : await this.invokeOnce(llm, messages, firstConfig, route, runSignal, ctx.onAnswered);
    // A response with no top-level `reply` string streams no delta, so the composer sat dead until `done`; logged to measure it, never a failure.
    if (relay && !relay.replyFound) {
      this.logger.warn('Model defeated the reply stream — no delta was emitted', {
        task: route.task,
        promptKey: promptModule.key,
        promptVersion: promptModule.version,
        role,
        runId: ctx.runId,
      });
    }

    const { parsed: parsed1, usable: usable1 } = this.parseFirstAttempt(promptModule, tryParseJson(rawOutput1));
    if (parsed1.success) {
      this.logger.debug('structured: parsed on first attempt', { role, runId: ctx.runId, outputLength: rawOutput1.length });
      return this.acceptOutput(route, role, ctx, relay, parsed1.data, { requestHash, promptModule, raw: rawOutput1 });
    }

    // The issue strings are structural field paths and validator messages — no author prose — so they ride
    // on warn, where production keeps them. The raw output is the author's material and stays on debug.
    const issues1 = renderSchemaIssues(parsed1.issues);
    const attempt1Meta = { role, runId: ctx.runId, promptKey: promptModule.key, promptVersion: promptModule.version, issues: issues1 };
    if (usable1 === undefined) this.logger.warn('Attempt 1 parse failed — repairing', attempt1Meta);
    else this.logger.warn('Attempt 1 has advisory issues only — repairing once', { ...attempt1Meta, advisory: true });
    this.logger.debug('Attempt 1 raw output', { role, runId: ctx.runId, rawOutput: rawOutput1 });

    const repairRequest = `That response could not be used. Issues:\n${issues1}\n\nRespond again with ONLY one valid JSON object matching the required schema — fix the listed issues, keep the content, no prose outside the JSON, no markdown fences.`;
    ctx.onRepair?.(rawOutput1, repairRequest);
    const repairMessages: BaseMessage[] = [...messages, new AIMessage(rawOutput1), new HumanMessage(repairRequest)];

    const rawOutput2 = await this.invokeOnce(llm, repairMessages, this.invokeConfig(ctx, route, policy, 1), route, runSignal, ctx.onAnswered);
    const parsed2 = this.parseOutput(promptModule, tryParseJson(rawOutput2));
    if (parsed2.success) {
      this.logger.debug('structured: parsed after repair', { role, runId: ctx.runId, outputLength: rawOutput2.length });
      return this.acceptOutput(route, role, ctx, relay, parsed2.data, { requestHash, promptModule, raw: rawOutput2 });
    }

    const issues2 = renderSchemaIssues(parsed2.issues);
    this.logger.warn('Repair parse failed — trying tolerant extraction', {
      role,
      runId: ctx.runId,
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      issues: issues2,
    });
    this.logger.debug('Repair raw output', { role, runId: ctx.runId, rawOutput: rawOutput2 });
    // The repair output goes first because it is the only one the model wrote after seeing the issues, which
    // also leaves every call that recovers today recovering from the same text; attempt 1 is the added rung,
    // for the repair that discarded a usable object rather than fixing it.
    const candidates = [
      ...extractJsonCandidates(rawOutput2).map(value => ['repair', value] as const),
      ...extractJsonCandidates(rawOutput1).map(value => ['attempt-1', value] as const),
    ];
    for (const [source, extracted] of candidates) {
      const parsedExtracted = this.parseOutput(promptModule, extracted);
      if (!parsedExtracted.success) continue;
      this.logger.debug('structured: parsed via tolerant extraction', { role, runId: ctx.runId, source });
      const extractedRaw = JSON.stringify(extracted);
      return this.acceptOutput(route, role, ctx, relay, parsedExtracted.data, { requestHash, promptModule, raw: extractedRaw });
    }

    if (usable1 !== undefined) {
      this.logger.warn('Repair unusable — keeping attempt 1 despite its advisory issues', { role, runId: ctx.runId, promptKey: promptModule.key, advisory: true, issues2 });
      return this.acceptOutput(route, role, ctx, relay, usable1, { requestHash, promptModule, raw: rawOutput1 });
    }

    this.logger.error('All parse attempts failed', {
      role,
      runId: ctx.runId,
      node: ctx.node,
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      issues1,
      issues2,
      rawOutput1: rawOutput1.slice(0, 200),
    });
    this.logger.debug('All parse attempts failed — full raw outputs', { role, runId: ctx.runId, rawOutput1, rawOutput2 });
    throw AppErrorCode.AI_001.create();
  }

  /**
   * Image generation through Synapse's images endpoint, which cannot ride LangChain callbacks, so it writes its own `model_calls` row. A refusal keeps its `AI_*` code;
   * rejected references are `AI_010`; anything else is `AI_005`.
   */
  async images(request: ImageRequest, ctx: TelemetryContext, project?: ProjectConfig): Promise<GeneratedImage[]> {
    const route = this.routeModel('image', project);
    await this.refuseHardLine(route, [{ text: request.prompt, scope: 'supplied', source: 'The image prompt' }], ctx);
    const references = request.inputReferences ?? [];
    const body: SynapseImageRequest = {
      model: SYNAPSE_IMAGE_TASK,
      prompt: request.prompt,
      n: request.n,
      ...(references.length > 0 ? { reference_images: references } : {}),
      synapse: { subject: await this.subjectFor(ctx.projectId, project), ...synapseRouting(route) },
    };
    this.logger.debug('images: requesting through Synapse', { projectId: ctx.projectId, task: SYNAPSE_IMAGE_TASK, n: request.n, references: references.length });

    const startedAt = Date.now();
    const failed = { provider: SYNAPSE_PROVIDER, model: SYNAPSE_IMAGE_TASK, attempt: 0 };
    let response: SynapseImageResponse;
    try {
      response = await this.callSynapse(route, this.runSignalFor(ctx), async signal => {
        try {
          return await this.synapse.images(body, { signal });
        } catch (err) {
          await this.recordImageCall(ctx, route, { ...failed, status: failureStatus(err), latencyMs: Date.now() - startedAt, error: failureDetail(err) });
          throw err;
        }
      });
    } catch (err) {
      if (refusedReferences(err)) throw AppErrorCode.AI_010.create({ count: references.length }, err);
      throw AppError.is(err, AppErrorCode.AI_007) ? AppErrorCode.AI_005.create(undefined, err) : err;
    }

    const { provider, model, costUsd, costSource } = synapseBilling(response.synapse);
    const served = { provider, model, attempt: 0, latencyMs: Date.now() - startedAt, costUsd, costSource };
    const images = decodeImages(response.data);
    if (images.length > 0) {
      await this.recordImageCall(ctx, route, { ...served, status: 'ok' });
      return images;
    }
    this.logger.error('Synapse answered an image call with no image data', { projectId: ctx.projectId, model });
    await this.recordImageCall(ctx, route, { ...served, status: 'transport_error', error: { message: 'synapse returned no image data' } });
    throw AppErrorCode.AI_005.create();
  }

  private async recordImageCall(ctx: TelemetryContext, { costTier, contentMode }: ModelRoute, call: ImageCallRecord): Promise<void> {
    await this.db
      .insert(schema.modelCalls)
      .values({
        projectId: ctx.projectId,
        runId: ctx.runId,
        node: ctx.node,
        role: ctx.role,
        provider: call.provider,
        model: call.model,
        tier: costTier,
        contentMode,
        promptKey: ctx.promptKey,
        promptVersion: ctx.promptVersion,
        status: call.status,
        latencyMs: call.latencyMs,
        costUsd: call.costUsd === undefined ? null : String(call.costUsd),
        ...(call.costSource ? { costSource: call.costSource } : {}),
        attempt: call.attempt,
        error: call.error ?? null,
      })
      .catch(insertErr => this.logger.warn('Failed to write model_calls row for an image call', { err: insertErr }));
  }

  private parseOutput<T>(promptModule: PromptModule<T>, data: unknown): SchemaParseResult<T> {
    const normalized = normalizeForSchema(promptModule.schema, data);
    return applyPostValidate(parseSchema<T>(promptModule.schema, normalized), promptModule.postValidate);
  }

  // Advisory rules count only here, beside the blocking ones, so one repair request carries both. An output that fails
  // only advisory rules stays `usable`: tolerant extraction cannot rebuild a top-level array, so it is the fallback
  // that keeps an advisory issue from ever failing the call.
  private parseFirstAttempt<T>(promptModule: PromptModule<T>, data: unknown): { parsed: SchemaParseResult<T>; usable?: T } {
    const parsed = parseSchema<T>(promptModule.schema, normalizeForSchema(promptModule.schema, data));
    if (!parsed.success) return { parsed };
    const blocking = promptModule.postValidate?.(parsed.data) ?? [];
    const advisory = promptModule.advise?.(parsed.data) ?? [];
    if (blocking.length === 0 && advisory.length === 0) return { parsed };
    const issues: SchemaIssue[] = [...blocking, ...advisory].map(message => ({ path: [], message }));
    return { parsed: { success: false, issues }, usable: blocking.length === 0 ? parsed.data : undefined };
  }

  // cacheStrategy modules get cache_control breakpoints (Synapse keeps or strips them per model). The JSON schema always travels in-band, since creative prompts never
  // mention JSON; it closes the conversation, except on a gateway-session call, where it is a system message so appended turns keep earlier messages in place.
  private async buildMessages<T>(
    promptModule: PromptModule<T>,
    input: Record<string, unknown>,
    { policy, image, schemaInSystem }: { policy?: ForgeCallPolicy; image?: string; schemaInSystem: boolean },
  ): Promise<BaseMessage[]> {
    const schemaInstruction = `Respond with ONLY one valid JSON object matching this JSON schema — all prose goes inside the JSON string fields, nothing outside the JSON, no markdown fences:\n${JSON.stringify(toHostedPromptSchema(promptModule.schema))}`;
    const formatted = await promptModule.template.formatMessages(input);
    let messages = withPluginSystemMessages(schemaInSystem ? afterLeadingSystemMessages(formatted, [new SystemMessage(schemaInstruction)]) : formatted, policy);
    if (image !== undefined) messages = withImageAttached(messages, image);
    if (promptModule.cacheStrategy) messages = applyAnthropicCacheControl(messages);
    return schemaInSystem ? messages : [...messages, new HumanMessage(schemaInstruction)];
  }

  /** The parsed answer of a `chatFor` client (judge, validation), screened for its role before the caller keeps or forwards it. */
  async screenOutput(role: AiRole, output: unknown, ctx: TelemetryContext, project?: ProjectConfig, policy?: ForgeCallPolicy): Promise<void> {
    const route = this.routeModel(role, project, policy);
    await this.refuseHardLine(route, outputScreens(output, role), ctx, false);
  }

  private hardLineGuard(route: ModelRoute): RequestGuard | undefined {
    if (route.contentMode !== 'unrestricted') return undefined;
    return {
      systemLine: HARD_LINE_SYSTEM_LINE,
      screen: messages => {
        const hit = screenTexts(wireMessageTexts(messages).map(text => ({ text, scope: 'background', source: 'The request' })));
        if (hit) throw hardLineError(hit);
      },
    };
  }

  // Unrestricted routes only: a standard model holds this line itself, and screening its traffic would put the lexicon's false refusals in
  // front of every author. The refusal is recorded as a `refused` call so the run's trail shows why no model answered.
  // `record`: a refused request writes its own `refused` row; a refused output's call already has its row from the telemetry handler.
  private async refuseHardLine(route: ModelRoute, screens: readonly ScreenedText[], ctx: TelemetryContext, record = true): Promise<void> {
    if (route.contentMode !== 'unrestricted') return;
    const hit = screenTexts(screens);
    if (!hit) return;
    this.logger.warn('hard line refused an unrestricted call', {
      projectId: ctx.projectId,
      runId: ctx.runId,
      role: ctx.role,
      rule: hit.rule,
      source: hit.source,
      sourceRefs: hit.sourceRefs,
    });
    if (!record) throw hardLineError(hit);
    await this.db
      .insert(schema.modelCalls)
      .values({
        projectId: ctx.projectId,
        runId: ctx.runId,
        node: ctx.node,
        role: ctx.role,
        provider: SYNAPSE_PROVIDER,
        model: route.task,
        tier: route.costTier,
        contentMode: route.contentMode,
        promptKey: ctx.promptKey,
        promptVersion: ctx.promptVersion,
        chapter: ctx.chapter ?? null,
        status: 'refused',
        latencyMs: 0,
        attempt: 0,
        error: { code: AppErrorCode.AI_015.code, rule: hit.rule, source: hit.source, sourceRefs: hit.sourceRefs },
      })
      .catch(err => this.logger.warn('Failed to write the model_calls row for a refused call', { err }));
    throw hardLineError(hit);
  }

  // What an unrestricted model wrote is held to the full rule before it is cached or handed back, so a refused output is never persisted.
  private async refuseOutput(route: ModelRoute, role: AiRole, output: unknown, ctx: TelemetryContext, relay: ReplyStreamRelay | null): Promise<void> {
    try {
      await this.refuseHardLine(route, outputScreens(output, role), ctx, false);
    } catch (err) {
      relay?.restart();
      throw err;
    }
  }

  private async acceptOutput<T>(
    route: ModelRoute,
    role: AiRole,
    ctx: TelemetryContext,
    relay: ReplyStreamRelay | null,
    output: T,
    cache: { requestHash: string | null; promptModule: PromptModule<T>; raw: string },
  ): Promise<T> {
    await this.refuseOutput(route, role, output, ctx, relay);
    await this.cacheResponse(cache.requestHash, ctx, route, cache.promptModule, cache.raw);
    relay?.settle(cache.raw);
    return output;
  }

  // Invoke config: telemetry callback + attribution metadata, all read by the telemetry handler; `costTier` and `contentMode` sit beside
  // `nfTelemetry` and become `model_calls.tier` / `model_calls.content_mode`. The served model and effort are known only from the response,
  // which `TelemetryHandler` reads them from, so the task stands in until it answers.
  private invokeConfig(ctx: TelemetryContext, route: ModelRoute, policy: ForgeCallPolicy | undefined, attempt: number): TelemetryConfig {
    const { task, costTier, contentMode } = route;
    const stamps = policy?.plugins.length ? { plugins: policy.plugins, policyDigest: policy.digest } : {};
    return {
      callbacks: [this.telemetry],
      metadata: {
        nfTelemetry: {
          ...ctx,
          projectId: String(ctx.projectId),
          provider: SYNAPSE_PROVIDER,
          model: task,
          attempt,
          ...stamps,
        },
        costTier,
        contentMode,
      },
    };
  }

  private invokeOnce(llm: BaseChatModel, messages: BaseMessage[], config: object, route: ModelRoute, runSignal?: AbortSignal, onAnswered?: AnsweredHook): Promise<string> {
    return this.callSynapse(route, runSignal, async signal => {
      const result = await llm.invoke(messages, { ...config, signal });
      reportAnswer(result.response_metadata, onAnswered);
      return messageText(result.content);
    });
  }

  private streamOnce(
    llm: BaseChatModel,
    messages: BaseMessage[],
    config: object,
    route: ModelRoute,
    relay: ReplyStreamRelay,
    runSignal?: AbortSignal,
    onAnswered?: AnsweredHook,
  ): Promise<string> {
    relay.restart();
    const sink: StreamSink = { chunk: text => relay.push(text), reset: () => relay.restart() };
    return this.callSynapse(route, runSignal, signal => this.consumeStream(llm, messages, config, signal, sink, onAnswered));
  }

  // Synapse fails over between deployments and the client retries a refused connection once, so a call here is made exactly once. The deadline
  // and a cancelled run both abort the HTTP request itself; `consumeStream` returns its partial text on abort, which the signal check discards.
  private async callSynapse<R>(route: ModelRoute, runSignal: AbortSignal | undefined, call: (signal: AbortSignal) => Promise<R>): Promise<R> {
    if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
    const deadline = AbortSignal.timeout(this.llmTimeoutMs);
    const signal = runSignal ? AbortSignal.any([deadline, runSignal]) : deadline;
    let err: unknown;
    try {
      const result = await call(signal);
      if (!signal.aborted) return result;
    } catch (caught) {
      err = caught;
    }
    if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
    if (isHardLineRefusal(err)) throw err;
    const failure = deadline.aborted ? modelCallFailed(new ModelCallTimeoutError(this.llmTimeoutMs)) : synapseCallFailed(err, route.contentMode);
    this.logger.error('Synapse call failed', { task: route.task, contentMode: route.contentMode, code: failure.code, err });
    throw failure;
  }

  // The `aborted` check is what makes abandonment provider-independent: it drops the chunk before the sink
  // sees it, and breaking the `for await` closes the iterator even where the signal was ignored. A reset is Synapse
  // searching the web after text it already sent: that text was never the answer.
  private async consumeStream(llm: BaseChatModel, messages: BaseMessage[], config: object, signal: AbortSignal, sink: StreamSink, onAnswered?: AnsweredHook): Promise<string> {
    let accumulated = '';
    for await (const chunk of await llm.stream(messages, { ...config, signal })) {
      if (signal.aborted) break;
      reportAnswer(chunk.response_metadata, onAnswered);
      if (isSynapseReset(chunk)) {
        accumulated = '';
        sink.reset();
        continue;
      }
      const text = streamChunkText(chunk.content);
      if (!text) continue;
      accumulated += text;
      sink.chunk(text);
    }
    return accumulated;
  }

  // `llm_cache.requestHash` is global, not project-scoped, so without the digest a plugin-shaped result is
  // served verbatim to another novel; a plugin-free policy contributes no key. `routing` holds the call's task, selectors and catalog
  // version, so a retarget misses the old answers.
  private hashRequest(promptModule: { key: string; version: string }, input: Record<string, unknown>, routing: Record<string, unknown>, policy?: ForgeCallPolicy): string {
    const policyKey = policy?.digest ? { policy: policy.digest } : {};
    const payload = JSON.stringify({
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      input,
      ...policyKey,
      ...routing,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  /** `undefined` when the catalog version cannot be read: the call then neither reads nor writes `llm_cache`, so no answer outlives a retarget. */
  private async synapseCacheRouting(route: ModelRoute): Promise<Record<string, unknown> | undefined> {
    const { task } = route;
    const selectors = synapseSelectors(route);
    const version = await this.catalogVersion(task, selectors);
    if (version === undefined) return undefined;
    return { task, selectors, catalogVersion: version };
  }

  private async catalogVersion(task: string, selectors: Record<string, string>): Promise<number | undefined> {
    try {
      return (await this.synapse.catalog({ task, selectors })).catalog_version;
    } catch (err) {
      this.logger.warn('Synapse catalog unreadable, so the call skips the llm_cache', { task, selectors, err });
      return undefined;
    }
  }

  private async cacheResponse(
    requestHash: string | null,
    ctx: TelemetryContext,
    route: ModelRoute,
    promptModule: { key: string; version: string },
    response: string,
  ): Promise<void> {
    if (!requestHash) return;
    await this.db
      .insert(schema.llmCache)
      .values({
        projectId: ctx.projectId,
        role: promptModule.key,
        promptKey: promptModule.key,
        promptVersion: promptModule.version,
        provider: SYNAPSE_PROVIDER,
        model: route.task,
        requestHash,
        response,
      })
      .onConflictDoNothing({ target: schema.llmCache.requestHash })
      .catch(err => this.logger.warn('Failed to write llm_cache row', { err }));
  }
}
