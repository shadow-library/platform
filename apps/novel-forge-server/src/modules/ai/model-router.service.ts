import { createHash } from 'node:crypto';

import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage, HumanMessage, type MessageContent, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type SchemaClass } from '@shadow-library/class-schema';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type OwnerFields } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type ForgeCallPolicy } from '../plugins/plugin-policy.service';
import {
  type AiRole,
  getGroupDefaults,
  getProfileDefaults,
  isRegisteredModel,
  isUnrestrictedAllowed,
  type ResolvedModel,
  resolveReasoningEffort,
  ROLE_GROUP,
  UNRESTRICTED_DEFAULTS,
} from './defaults';
import { type AccountModelGroup, AccountSettingsService } from './account-settings.service';
import { AiQuotaService } from './ai-quota.service';
import { MODEL_MAP } from './models';
import { applyAnthropicCacheControl } from './prompt-caching';
import { type PromptModule } from './prompts/types';
import { ReplyStreamScanner } from './reply-stream-scanner';
import { parseSchema, renderSchemaIssues, type SchemaIssue, type SchemaParseResult, toJsonSchemaFormat } from './schemas/validate';
import { type TelemetryContext, TelemetryHandler } from './telemetry.handler';

export type ProjectConfig = OwnerFields & {
  contentMode?: string;
  config?: { models?: Partial<Record<AiRole, ResolvedModel>> } | null;
};

export interface ImageRequest {
  prompt: string;
  n: number;
  /**
   * Reference images for image-to-image work, as HTTP(S) or `data:` URLs. OpenRouter's images endpoint
   * accepts up to 14; how many a given model honours varies by provider.
   */
  inputReferences?: string[];
}

export interface GeneratedImage {
  bytes: Uint8Array;
  contentType: string;
}

interface OpenRouterImageResponse {
  data?: { b64_json?: string; media_type?: string }[];
  usage?: { cost?: number };
}

// Deterministic verification/extraction roles: identical input must yield identical output, so their
// results are safe to cache. Creative roles (generation, revision, plan, outline, chat…) are never
// cached — caching them would make a re-request return byte-identical prose.
const CACHEABLE_ROLES = new Set<AiRole>(['judge', 'validation', 'continuity', 'extraction', 'review', 'audit', 'compact']);
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// An explicitly resolved provider always wins: Unrestricted allowlist, the AI_PROFILE defaults and a per-project
// pin all choose provider and model together, so a model id that also happens to sit in MODEL_REGISTRY
// must not silently reroute that choice. The registry is only the fallback when no provider was resolved.
export function resolveProvider(resolved: ResolvedModel): string {
  return resolved.provider || (MODEL_MAP[resolved.model]?.provider ?? '');
}

// OpenRouter forwards Anthropic's native `cache_control` blocks verbatim to `anthropic/*` models and
// ignores them elsewhere, so the breakpoints are worth injecting for exactly that vendor prefix.
export function supportsPromptCaching(resolved: ResolvedModel): boolean {
  return resolveProvider(resolved) === 'openrouter' && resolved.model.startsWith('anthropic/');
}

// `prompt.contribute` (§5.5): contributions land directly after the module's own leading system messages and
// before cache control, so the three Anthropic breakpoints still key on the module's static system message.
function withPluginSystemMessages(messages: BaseMessage[], policy?: ForgeCallPolicy): BaseMessage[] {
  if (!policy?.systemMessages.length) return messages;
  let insertAt = 0;
  while (messages[insertAt]?.getType() === 'system') insertAt++;
  return [...messages.slice(0, insertAt), ...policy.systemMessages.map(message => new SystemMessage(message.content)), ...messages.slice(insertAt)];
}

function withImageAttached(messages: BaseMessage[], image: string): BaseMessage[] {
  const imagePart = { type: 'image_url', image_url: { url: image } };
  const lastHuman = messages.map(message => message.getType()).lastIndexOf('human');
  if (lastHuman === -1) return [...messages, new HumanMessage({ content: [imagePart] })];
  const { content } = messages[lastHuman] as BaseMessage;
  const textParts = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  return messages.map((message, index) => (index === lastHuman ? new HumanMessage({ content: [...textParts, imagePart] }) : message));
}

function extractJsonBlock(text: string): unknown {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return extractJsonBlock(raw);
  }
}

// Ollama's JSON mode biases toward objects, so a schema expecting a top-level array frequently arrives
// wrapped as `{ <key>: [...] }`. When the schema is a top-level array and the parsed value is an object
// with exactly one array-valued property, unwrap that array so it validates.
function normalizeForSchema(schema: SchemaClass, data: unknown): unknown {
  if (!Array.isArray(schema)) return data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : data;
}

// Runs postValidate (if declared) after schema validation succeeds, folding any returned issue
// messages into the same success/failure shape so the repair ladder treats them identically.
function applyPostValidate<T>(result: SchemaParseResult<T>, postValidate?: (data: T) => string[]): SchemaParseResult<T> {
  if (!result.success || !postValidate) return result;
  const messages = postValidate(result.data);
  if (messages.length === 0) return result;
  const issues: SchemaIssue[] = messages.map(message => ({ path: [], message }));
  return { success: false, issues };
}

export interface ReplyStreamHandlers {
  /** Newly decoded text of the response's top-level `reply` field; never called with an empty string. */
  onDelta: (text: string) => void;
  /** Everything emitted so far is void: a transport retry restarted the response, or repair replaced it. */
  onReset?: () => void;
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
class ReplyStreamRelay {
  private scanner = new ReplyStreamScanner();
  private streamed = '';
  private retired = false;

  constructor(
    private readonly handlers: ReplyStreamHandlers,
    private readonly onSinkError: (err: unknown) => void,
  ) {}

  get replyFound(): boolean {
    return this.scanner.replyFound;
  }

  push(chunk: string): void {
    const text = this.scanner.push(chunk);
    if (!text) return;
    this.streamed += text;
    this.emit(() => this.handlers.onDelta(text));
  }

  restart(): void {
    this.scanner = new ReplyStreamScanner();
    if (!this.streamed) return;
    this.streamed = '';
    this.emit(() => this.handlers.onReset?.());
  }

  settle(rawResponse: string): void {
    if (!this.streamed || this.streamed === new ReplyStreamScanner().push(rawResponse)) return;
    this.emit(() => this.handlers.onReset?.());
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
  // Local models (e.g. qwen3:14b) legitimately spend 60–120s on the heavier authoring stages, so the
  // per-call budget defaults generously; tune ai.llm.timeout-ms downward for fast hosted providers.
  private readonly llmTimeoutMs = Config.get('ai.llm.timeout-ms') ?? 300_000;
  private readonly llmMaxRetries = Config.get('ai.llm.max-retries') ?? 2;
  private readonly llmBackoffMs = Config.get('ai.llm.backoff-ms') ?? 500;
  // Process-local by design (rail-stop-admin §2.1): a cancel only reaches a run owned by the replica
  // that received it, exactly like ProjectEventService's in-process fan-out.
  private readonly runAborts = new Map<string, AbortController>();

  constructor(
    private readonly telemetry: TelemetryHandler,
    private readonly databaseService: DatabaseService,
    private readonly quota: AiQuotaService,
    private readonly accountSettings: AccountSettingsService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Opens the cancellation channel for a run: every subsequent call carrying this `runId` in its
   * telemetry context is made under the returned signal. `WorkflowRunService` owns the pairing and must
   * call `releaseRunSignal` on every exit path.
   */
  bindRunSignal(runId: string): AbortSignal {
    const controller = this.runAborts.get(runId) ?? new AbortController();
    this.runAborts.set(runId, controller);
    return controller.signal;
  }

  releaseRunSignal(runId: string): void {
    this.runAborts.delete(runId);
  }

  /** Returns whether a run was registered on this replica; aborting an already-aborted run is a no-op. */
  abortRun(runId: string): boolean {
    const controller = this.runAborts.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  // `call.route`: a plugin may raise this call to the permissive class, and no policy can lower a project
  // whose own contentMode is already unrestricted — the raise-only rule is structural at the routing sink.
  // `account` is the project owner's own defaults, which `resolveFor` loads; an unregistered one is skipped rather than
  // failed, since the registry can drop a model long after the author picked it.
  resolveModel(role: AiRole, project?: ProjectConfig, policy?: ForgeCallPolicy, account?: Partial<Record<AccountModelGroup, ResolvedModel>>): ResolvedModel {
    const accountModel = account?.[ROLE_GROUP[role] as AccountModelGroup];
    const accountDefault = accountModel && isRegisteredModel(accountModel) ? accountModel : undefined;
    if (project?.contentMode === 'unrestricted' || policy?.writerClass === 'permissive') {
      const unrestrictedDefault = UNRESTRICTED_DEFAULTS[role] ?? UNRESTRICTED_DEFAULTS.generation;
      const models = project?.config?.models as Record<string, ResolvedModel> | undefined;
      const projectModel = models?.[role] ?? (role === 'chat' && models?.['plan'] ? models['plan'] : undefined);
      if (projectModel && isUnrestrictedAllowed(role, projectModel)) return projectModel;
      if (accountDefault && isUnrestrictedAllowed(role, accountDefault)) return accountDefault;
      return unrestrictedDefault;
    }
    // The settings UI writes one selection across every role in a group, so group members resolve identically.
    const models = project?.config?.models as Record<string, ResolvedModel> | undefined;
    const projectModel = models?.[role] ?? (role === 'chat' ? models?.['plan'] : undefined);
    if (projectModel) {
      // Fail closed at the sink: a persisted override whose model id is not in the registry — including
      // one written before write-time validation existed — must never reach the platform credential.
      if (!MODEL_MAP[projectModel.model]) throw AppErrorCode.AI_002.create();
      return projectModel;
    }
    return accountDefault ?? getProfileDefaults()[role] ?? getGroupDefaults().writing;
  }

  async resolveFor(role: AiRole, project?: ProjectConfig, projectId?: bigint, policy?: ForgeCallPolicy): Promise<ResolvedModel> {
    const account = await this.accountSettings.defaultsFor(project, projectId);
    return this.resolveModel(role, project, policy, account);
  }

  // Lets a caller (e.g. the reference resolver) learn how many reference images the image model that
  // would actually be used can accept, before it composes a request. No `policy` parameter: `images()`
  // itself resolves without one, so accepting one here could answer for a model it would never enforce.
  async referenceCapacity(project?: ProjectConfig, projectId?: bigint): Promise<number> {
    const resolved = await this.resolveFor('image', project, projectId);
    return MODEL_MAP[resolved.model]?.maxInputReferences ?? 0;
  }

  // Every hosted vendor is reached through OpenRouter's OpenAI-compatible endpoint, so one client
  // covers them all; `ai.openrouter.api.url` redirects the leg at an in-cluster gateway speaking the
  // same wire protocol. Ollama stays local and keeps its own client.
  buildClient(resolved: ResolvedModel, opts?: { format?: string | Record<string, unknown>; role?: AiRole }): BaseChatModel {
    // Fail-closed backstop: the sink never dispatches a model absent from the registry. An id that is
    // present but explicitly paired with a different provider is left alone — that precedence is by
    // design (see resolveProvider) and routes to that provider, never the platform's OpenRouter key.
    if (!MODEL_MAP[resolved.model]) throw AppErrorCode.AI_002.create();
    switch (resolveProvider(resolved)) {
      case 'openrouter': {
        // OpenRouter takes reasoning control as a top-level `reasoning: { effort }` body field, which is
        // not part of the OpenAI chat-completions schema — modelKwargs is what ChatOpenAI splices into
        // the request verbatim. Omitting it entirely is what disables reasoning on `optional` models.
        const effort = opts?.role ? resolveReasoningEffort(resolved.model, ROLE_GROUP[opts.role]) : undefined;
        // Without this, ChatOpenAI falls back to OPENAI_API_KEY, fails deep inside the SDK, and the
        // missing-configuration fault surfaces three pointless retries later as a 400 "unparseable response".
        const apiKey = Config.get('ai.openrouter.api.key');
        if (!apiKey) throw AppErrorCode.AI_006.create();
        // `invokeResilient` owns retries. Left at LangChain's default of 6, each of its attempts became seven
        // with exponential backoff, and a gateway refusing in milliseconds took five minutes to fail a turn.
        return new ChatOpenAI({
          model: resolved.model,
          apiKey,
          maxRetries: 0,
          configuration: { baseURL: Config.get('ai.openrouter.api.url') },
          ...(effort ? { modelKwargs: { reasoning: { effort } } } : {}),
        });
      }
      case 'ollama':
        // Local reasoning models (e.g. qwen3) otherwise wrap answers in <think> blocks and prose that
        // make structured output unparseable. Disable thinking on every call, and — for structured
        // requests — grammar-constrain decoding to the exact JSON schema so field names/shape match.
        // Prose roles (generation/revision) pass no format and stay free-form.
        return new ChatOllama({
          model: resolved.model,
          baseUrl: Config.get('ai.ollama.host'),
          temperature: 0,
          think: false,
          // Bun's fetch aborts after ~300s without socket activity, and a long-context prompt eval
          // streams no bytes for minutes — so long generations die as DOMException transport errors.
          // Disable that idle timeout (Bun RequestInit extension); the per-call timeout budget still bounds the call.
          fetch: ((input, init) => fetch(input, { ...init, ...({ timeout: false } as object) })) as typeof fetch,
          ...(opts?.format ? { format: opts.format } : {}),
        });
      default:
        throw AppErrorCode.AI_002.create();
    }
  }

  // `projectId` is optional only so the smoke/local harnesses can build a raw client without a project;
  // every product caller passes it, which is what gates the judge/validation raw-client paths on quota.
  async chatFor(role: AiRole, project?: ProjectConfig, projectId?: bigint, policy?: ForgeCallPolicy): Promise<BaseChatModel> {
    if (projectId !== undefined) await this.quota.enforce(projectId);
    const resolved = await this.resolveFor(role, project, projectId, policy);
    this.logger.debug(`Routing role=${role} to provider=${resolved.provider} model=${resolved.model}`);
    return this.buildClient(resolved, { role });
  }

  async structured<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, ctx: TelemetryContext, project?: ProjectConfig, policy?: ForgeCallPolicy): Promise<T> {
    return this.runStructured(promptModule, input, ctx, project, policy);
  }

  /**
   * `structured` with one image attached to the prompt's last human message. `image` is an HTTP(S) or `data:` URL; it is kept
   * out of `input` so the debug snapshot and request hash never carry it, and the response is never served from `llm_cache`.
   */
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
   * `structured` that also streams the response's `reply` field as it decodes. The stream is advisory (design D6):
   * the returned value is the same parsed-and-repaired object `structured` returns, and `onReset` fires whenever
   * what was already emitted is void — a transport retry restarted the response, or repair changed the reply.
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
    await this.quota.enforce(ctx.projectId);
    const role = promptModule.role ?? (promptModule.key as AiRole);
    const resolved = await this.resolveFor(role, project, ctx.projectId, policy);
    if (image !== undefined && !MODEL_MAP[resolved.model]?.supportsImageInput) throw AppErrorCode.AI_011.create({ model: resolved.model });
    const llm = this.buildClient(resolved, { format: toJsonSchemaFormat(promptModule.schema), role });
    const messages = await this.buildMessages(promptModule, input, resolved, policy, image);
    const relay = stream ? new ReplyStreamRelay(stream, err => this.logger.warn('Reply stream sink failed — finishing the turn unstreamed', { role, err })) : null;
    // Input carries the rendered context pack and user prose — sensitive/large, so it rides on debug
    // (dev-only) as a full snapshot to reproduce the exact model call locally.
    this.logger.debug('structured: invoking model', {
      role,
      provider: resolved.provider,
      model: resolved.model,
      promptKey: promptModule.key,
      promptVersion: promptModule.version,
      runId: ctx.runId,
      node: ctx.node,
      inputKeys: Object.keys(input),
      input,
      withImage: image !== undefined,
    });

    const requestHash = image === undefined && CACHEABLE_ROLES.has(role) ? this.hashRequest(resolved, promptModule, input, policy) : null;
    if (requestHash) {
      const cached = await this.db.query.llmCache.findFirst({ where: eq(schema.llmCache.requestHash, requestHash) });
      if (cached) {
        const parsedCached = this.parseOutput(promptModule, tryParseJson(cached.response));
        if (parsedCached.success) {
          this.logger.debug('LLM cache hit — skipping model call', { role, requestHash });
          relay?.push(cached.response);
          return parsedCached.data;
        }
        this.logger.debug('LLM cache row present but no longer parses — re-invoking', { role, requestHash });
      }
    }

    const runSignal = ctx.runId ? this.runAborts.get(ctx.runId)?.signal : undefined;
    const firstConfig = this.invokeConfig(ctx, resolved, 0, policy);
    const rawOutput1 = relay
      ? await this.streamResilient(llm, messages, firstConfig, role, relay, runSignal)
      : await this.invokeResilient(llm, messages, firstConfig, role, runSignal);
    // Design §4.1: a response carrying no top-level `reply` string produced no delta at all, so the author
    // saw a dead composer until `done`. (The scanner is key-order agnostic — `changeSet` first only costs
    // latency — so this is the whole of the degradation.) Logged per provider/model/prompt to make it
    // measurable; never a failure, since the ladder still returns a reply.
    if (relay && !relay.replyFound) {
      this.logger.warn('Model defeated the reply stream — no delta was emitted', {
        provider: resolveProvider(resolved),
        model: resolved.model,
        promptKey: promptModule.key,
        promptVersion: promptModule.version,
        role,
        runId: ctx.runId,
      });
    }

    const parsed1 = this.parseOutput(promptModule, tryParseJson(rawOutput1));
    if (parsed1.success) {
      this.logger.debug('structured: parsed on first attempt', { role, runId: ctx.runId, outputLength: rawOutput1.length });
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput1);
      relay?.settle(rawOutput1);
      return parsed1.data;
    }

    this.logger.warn('Attempt 1 parse failed — repairing', { role, issues: parsed1.issues.length });
    this.logger.debug('Attempt 1 raw output and issues', { role, runId: ctx.runId, rawOutput: rawOutput1, issues: renderSchemaIssues(parsed1.issues) });

    const repairMessages: BaseMessage[] = [
      ...messages,
      new AIMessage(rawOutput1),
      new HumanMessage(
        `That response could not be used. Issues:\n${renderSchemaIssues(parsed1.issues)}\n\nRespond again with ONLY one valid JSON object matching the required schema — fix the listed issues, keep the content, no prose outside the JSON, no markdown fences.`,
      ),
    ];

    const rawOutput2 = await this.invokeResilient(llm, repairMessages, this.invokeConfig(ctx, resolved, 1, policy), role, runSignal);
    const parsed2 = this.parseOutput(promptModule, tryParseJson(rawOutput2));
    if (parsed2.success) {
      this.logger.debug('structured: parsed after repair', { role, runId: ctx.runId, outputLength: rawOutput2.length });
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput2);
      relay?.settle(rawOutput2);
      return parsed2.data;
    }

    this.logger.warn('Repair parse failed — trying tolerant extraction', { role });
    this.logger.debug('Repair raw output and issues', { role, runId: ctx.runId, rawOutput: rawOutput2, issues: renderSchemaIssues(parsed2.issues) });
    const extracted = extractJsonBlock(rawOutput2);
    if (extracted) {
      const parsed3 = this.parseOutput(promptModule, extracted);
      if (parsed3.success) {
        this.logger.debug('structured: parsed via tolerant extraction', { role, runId: ctx.runId });
        const extractedRaw = JSON.stringify(extracted);
        await this.cacheResponse(requestHash, ctx, resolved, promptModule, extractedRaw);
        relay?.settle(extractedRaw);
        return parsed3.data;
      }
    }

    this.logger.error('All parse attempts failed', { role, runId: ctx.runId, rawOutput1: rawOutput1.slice(0, 200) });
    // Full outputs only on debug (dev) — an operator can read the exact prose the model returned.
    this.logger.debug('All parse attempts failed — full raw outputs', { role, runId: ctx.runId, rawOutput1, rawOutput2 });
    throw AppErrorCode.AI_001.create();
  }

  /**
   * Image generation through OpenRouter's dedicated images endpoint, which speaks its own wire format
   * rather than chat completions — so it cannot ride LangChain's callback telemetry and writes its own
   * `model_calls` row instead. It gets the same timeout budget and transient-error backoff as a chat
   * call. `inputReferences` is the endpoint's image-to-image channel; models that ignore it degrade to
   * plain text-to-image rather than failing.
   */
  async images(request: ImageRequest, ctx: TelemetryContext, project?: ProjectConfig): Promise<GeneratedImage[]> {
    await this.quota.enforce(ctx.projectId);
    const resolved = await this.resolveFor('image', project, ctx.projectId);
    const maxInputReferences = MODEL_MAP[resolved.model]?.maxInputReferences ?? 0;
    const referenceCount = request.inputReferences?.length ?? 0;
    if (referenceCount > maxInputReferences) throw AppErrorCode.AI_010.create({ model: resolved.model, max: maxInputReferences, count: referenceCount });
    const apiKey = Config.get('ai.openrouter.api.key');
    if (!apiKey) throw AppErrorCode.AI_004.create();
    const url = `${Config.get('ai.openrouter.api.url')}/images`;
    const body = JSON.stringify({
      model: resolved.model,
      prompt: request.prompt,
      n: request.n,
      ...(request.inputReferences?.length ? { input_references: request.inputReferences.map(image => ({ type: 'image_url', image_url: { url: image } })) } : {}),
    });

    this.logger.debug('images: requesting', {
      projectId: ctx.projectId,
      model: resolved.model,
      n: request.n,
      references: request.inputReferences?.length ?? 0,
      prompt: request.prompt,
    });

    const startedAt = Date.now();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.llmMaxRetries; attempt++) {
      try {
        const res = await this.withTimeout(
          fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body }),
          this.llmTimeoutMs,
        );
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));

        const payload = (await res.json()) as OpenRouterImageResponse;
        const images = (payload.data ?? [])
          .filter(item => item.b64_json)
          .map(item => ({ bytes: new Uint8Array(Buffer.from(item.b64_json as string, 'base64')), contentType: item.media_type ?? 'image/png' }));
        if (images.length === 0) throw new Error('provider returned no image data');

        await this.recordImageCall(ctx, resolved, 'ok', attempt, Date.now() - startedAt, payload.usage?.cost);
        return images;
      } catch (err) {
        lastErr = err;
        if (attempt < this.llmMaxRetries) await sleep(this.llmBackoffMs * 2 ** attempt);
      }
    }

    this.logger.error('Image call failed after retries', { projectId: ctx.projectId, model: resolved.model, err: lastErr });
    await this.recordImageCall(ctx, resolved, 'transport_error', this.llmMaxRetries, Date.now() - startedAt, undefined, lastErr);
    throw AppErrorCode.AI_005.create();
  }

  private async recordImageCall(
    ctx: TelemetryContext,
    resolved: ResolvedModel,
    status: 'ok' | 'transport_error',
    attempt: number,
    latencyMs: number,
    costUsd?: number,
    err?: unknown,
  ): Promise<void> {
    await this.db
      .insert(schema.modelCalls)
      .values({
        projectId: ctx.projectId,
        runId: ctx.runId,
        node: ctx.node,
        role: ctx.role,
        provider: resolveProvider(resolved),
        model: resolved.model,
        promptKey: ctx.promptKey,
        promptVersion: ctx.promptVersion,
        status,
        latencyMs,
        costUsd: costUsd === undefined ? null : String(costUsd),
        attempt,
        error: err ? { message: err instanceof Error ? err.message : String(err) } : null,
      })
      .catch(insertErr => this.logger.warn('Failed to write model_calls row for an image call', { err: insertErr }));
  }

  // Normalise the raw parsed value for the module's schema (unwrapping object-wrapped arrays from
  // local JSON mode), validate it, then fold in any postValidate business rules.
  private parseOutput<T>(promptModule: PromptModule<T>, data: unknown): SchemaParseResult<T> {
    const normalized = normalizeForSchema(promptModule.schema, data);
    return applyPostValidate(parseSchema<T>(promptModule.schema, normalized), promptModule.postValidate);
  }

  // Formats the module's template into messages, applying two provider-specific adjustments:
  // Anthropic models get cache_control breakpoints on cacheStrategy modules, and every provider EXCEPT
  // Ollama gets the required JSON schema appended in-band — grammar-constrained decoding only exists
  // on Ollama, so API models must be told the exact output shape or the creative roles (whose prompts
  // never mention JSON) answer with plain prose.
  private async buildMessages<T>(
    promptModule: PromptModule<T>,
    input: Record<string, unknown>,
    resolved: ResolvedModel,
    policy?: ForgeCallPolicy,
    image?: string,
  ): Promise<BaseMessage[]> {
    const provider = resolveProvider(resolved);
    let messages = withPluginSystemMessages(await promptModule.template.formatMessages(input), policy);
    if (image !== undefined) messages = withImageAttached(messages, image);
    if (promptModule.cacheStrategy && supportsPromptCaching(resolved)) messages = applyAnthropicCacheControl(messages);
    if (provider !== 'ollama') {
      messages = [
        ...messages,
        new HumanMessage(
          `Respond with ONLY one valid JSON object matching this JSON schema — all prose goes inside the JSON string fields, nothing outside the JSON, no markdown fences:\n${JSON.stringify(toJsonSchemaFormat(promptModule.schema))}`,
        ),
      ];
    }
    return messages;
  }

  // Invoke config: telemetry callback + attribution metadata (read by TelemetryHandler.handleLLMStart).
  private invokeConfig(
    ctx: TelemetryContext,
    resolved: ResolvedModel,
    attempt: number,
    policy?: ForgeCallPolicy,
  ): { callbacks: TelemetryHandler[]; metadata: Record<string, unknown> } {
    const stamps = policy?.plugins.length ? { plugins: policy.plugins, policyDigest: policy.digest } : {};
    return {
      callbacks: [this.telemetry],
      metadata: { nfTelemetry: { ...ctx, projectId: String(ctx.projectId), provider: resolved.provider, model: resolved.model, attempt, ...stamps } },
    };
  }

  // Invoke the model with a per-call timeout budget and transient-error backoff. Retries only cover
  // transport/timeout failures; a returned (parseable-or-not) response is never retried here, and a
  // cancelled run leaves the ladder at once rather than being mistaken for a transport error.
  private async invokeResilient(llm: BaseChatModel, messages: BaseMessage[], config: object, role: string, runSignal?: AbortSignal): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.llmMaxRetries; attempt++) {
      if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
      try {
        const result = await this.withTimeout(llm.invoke(messages, { ...config, signal: runSignal }), this.llmTimeoutMs);
        if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
        return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      } catch (err) {
        if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
        lastErr = err;
        if (attempt < this.llmMaxRetries) {
          const backoff = this.llmBackoffMs * 2 ** attempt;
          this.logger.warn('LLM transport error — backing off before retry', { role, attempt, backoff, err });
          await sleep(backoff);
        }
      }
    }
    this.logger.error('LLM call failed after retries', { role, attempts: this.llmMaxRetries + 1, err: lastErr });
    throw AppErrorCode.AI_007.create();
  }

  // The streaming twin of `invokeResilient` — same budget, same backoff, same transport-only retry rule —
  // plus the two things `withTimeout` alone cannot do, since it only races and never cancels: the abort is
  // taken before the backoff sleep rather than after it, so an abandoned attempt cannot go on feeding the
  // relay for the whole backoff window, and it reaches the provider so the losing HTTP leg is not leaked.
  private async streamResilient(llm: BaseChatModel, messages: BaseMessage[], config: object, role: string, relay: ReplyStreamRelay, runSignal?: AbortSignal): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.llmMaxRetries; attempt++) {
      if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
      const abandon = new AbortController();
      const signal = runSignal ? AbortSignal.any([abandon.signal, runSignal]) : abandon.signal;
      try {
        relay.restart();
        const output = await this.withTimeout(
          this.consumeStream(llm, messages, config, signal, chunk => relay.push(chunk)),
          this.llmTimeoutMs,
        );
        // `consumeStream` returns the partial text it had when the signal fired, so without this a
        // cancelled stream would feed the repair ladder and buy another model call.
        if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
        return output;
      } catch (err) {
        abandon.abort();
        if (runSignal?.aborted) throw AppErrorCode.AI_013.create();
        lastErr = err;
        if (attempt < this.llmMaxRetries) {
          const backoff = this.llmBackoffMs * 2 ** attempt;
          this.logger.warn('LLM stream transport error — backing off before retry', { role, attempt, backoff, err });
          await sleep(backoff);
        }
      }
    }
    this.logger.error('LLM stream failed after retries', { role, attempts: this.llmMaxRetries + 1, err: lastErr });
    throw AppErrorCode.AI_007.create();
  }

  // The `aborted` check is what makes abandonment provider-independent: it drops the chunk before the sink
  // sees it, and breaking the `for await` closes the iterator even where the signal was ignored.
  private async consumeStream(llm: BaseChatModel, messages: BaseMessage[], config: object, signal: AbortSignal, onChunk: (text: string) => void): Promise<string> {
    let accumulated = '';
    for await (const chunk of await llm.stream(messages, { ...config, signal })) {
      if (signal.aborted) break;
      const text = streamChunkText(chunk.content);
      if (!text) continue;
      accumulated += text;
      onChunk(text);
    }
    return accumulated;
  }

  private withTimeout<R>(promise: Promise<R>, ms: number): Promise<R> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`LLM call exceeded ${ms}ms timeout budget`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // `llm_cache.requestHash` is global, not project-scoped, so without the digest a plugin-shaped result is
  // served verbatim to another novel; a plugin-free policy contributes no key and keeps its existing entries.
  private hashRequest(resolved: ResolvedModel, promptModule: { key: string; version: string }, input: Record<string, unknown>, policy?: ForgeCallPolicy): string {
    const policyKey = policy?.digest ? { policy: policy.digest } : {};
    const payload = JSON.stringify({ provider: resolved.provider, model: resolved.model, promptKey: promptModule.key, promptVersion: promptModule.version, input, ...policyKey });
    return createHash('sha256').update(payload).digest('hex');
  }

  private async cacheResponse(
    requestHash: string | null,
    ctx: TelemetryContext,
    resolved: ResolvedModel,
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
        provider: resolved.provider,
        model: resolved.model,
        requestHash,
        response,
      })
      .onConflictDoNothing({ target: schema.llmCache.requestHash })
      .catch(err => this.logger.warn('Failed to write llm_cache row', { err }));
  }
}
