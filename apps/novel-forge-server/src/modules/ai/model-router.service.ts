/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { ChatAnthropic } from '@langchain/anthropic';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatXAI } from '@langchain/xai';
import { Injectable } from '@shadow-library/app';
import { type SchemaClass } from '@shadow-library/class-schema';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type AiRole, type ResolvedModel, getProfileDefaults } from './defaults';
import { MODEL_MAP } from './models';
import { applyAnthropicCacheControl } from './prompt-caching';
import { type PromptModule } from './prompts/types';
import { type SchemaIssue, type SchemaParseResult, parseSchema, renderSchemaIssues, toJsonSchemaFormat } from './schemas/validate';
import { ChatClaudeCode, ChatCodex, ChatGrokBuild } from './subprocess-providers';
import { type TelemetryContext, TelemetryHandler } from './telemetry.handler';

/**
 * Defining types
 */

export interface ProjectConfig {
  contentMode?: string;
  config?: { models?: Partial<Record<AiRole, ResolvedModel>> } | null;
}

/**
 * Declaring the constants
 */

// Deterministic verification/extraction roles: identical input must yield identical output, so their
// results are safe to cache. Creative roles (generation, revision, plan, outline, chat…) are never
// cached — caching them would make a re-request return byte-identical prose.
const CACHEABLE_ROLES = new Set<AiRole>(['judge', 'validation', 'continuity', 'extraction', 'review', 'audit', 'compact']);
// Local models (e.g. qwen3:14b) legitimately spend 60–120s on the heavier authoring stages, so the
// per-call budget defaults generously; override AI_LLM_TIMEOUT_MS downward for fast hosted providers.
const LLM_TIMEOUT_MS = Number(process.env['AI_LLM_TIMEOUT_MS'] ?? 300_000);
const LLM_MAX_RETRIES = Number(process.env['AI_LLM_MAX_RETRIES'] ?? 2);
const LLM_BACKOFF_MS = Number(process.env['AI_LLM_BACKOFF_MS'] ?? 500);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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

@Injectable()
export class ModelRouterService {
  private readonly logger = Logger.getLogger(APP_NAME, ModelRouterService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly telemetry: TelemetryHandler,
    private readonly databaseService: DatabaseService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  resolveModel(role: AiRole, project?: ProjectConfig): ResolvedModel {
    // 1. grok_only forces xAI on every role
    if (project?.contentMode === 'grok_only') return { provider: 'xai', model: Config.get('ai.grok.llm.model') };
    // 2. per-project config override (stored per fine-grained role; the settings UI writes one value
    //    across every role in a group, so a group's members resolve identically).
    const models = project?.config?.models as Record<string, ResolvedModel> | undefined;
    const projectModel = models?.[role];
    if (projectModel) return projectModel;
    // 3. refinement chat is its own dial but, left unset, follows the author's planning selection
    if (role === 'chat' && models?.['plan']) return models['plan'];
    // 4. AI_PROFILE defaults
    return getProfileDefaults()[role] ?? { provider: 'xai', model: Config.get('ai.grok.llm.model') };
  }

  buildClient(resolved: ResolvedModel, opts?: { format?: string | Record<string, unknown> }): BaseChatModel {
    const entry = MODEL_MAP[resolved.model];
    const provider = entry?.provider ?? resolved.provider;

    switch (provider) {
      case 'xai':
        return new ChatXAI({ model: resolved.model, apiKey: Config.get('ai.xai.api.key') });
      case 'anthropic':
        return new ChatAnthropic({ model: resolved.model, apiKey: Config.get('ai.anthropic.api.key') });
      case 'openai':
        return new ChatOpenAI({ model: resolved.model, apiKey: Config.get('ai.openai.api.key') });
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
          // Disable that idle timeout (Bun RequestInit extension); LLM_TIMEOUT_MS still bounds the call.
          fetch: ((input, init) => fetch(input, { ...init, ...({ timeout: false } as object) })) as typeof fetch,
          ...(opts?.format ? { format: opts.format } : {}),
        });
      case 'anthropic-claude-code':
        if (!Config.get('ai.claude-code.enabled')) throw AppErrorCode.AI_002.create();
        return new ChatClaudeCode(Config.get('ai.claude-code.bin'), resolved.model);
      case 'openai-codex':
        if (!Config.get('ai.codex.enabled')) throw AppErrorCode.AI_002.create();
        return new ChatCodex(Config.get('ai.codex.bin'), resolved.model);
      case 'xai-grok-build':
        if (!Config.get('ai.grok-build.enabled')) throw AppErrorCode.AI_002.create();
        return new ChatGrokBuild(Config.get('ai.grok-build.bin'));
      default:
        throw AppErrorCode.AI_002.create();
    }
  }

  chatFor(role: AiRole, project?: ProjectConfig): BaseChatModel {
    const resolved = this.resolveModel(role, project);
    this.logger.debug(`Routing role=${role} to provider=${resolved.provider} model=${resolved.model}`);
    return this.buildClient(resolved);
  }

  async structured<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, ctx: TelemetryContext, project?: ProjectConfig): Promise<T> {
    const role = promptModule.role ?? (promptModule.key as AiRole);
    const resolved = this.resolveModel(role, project);
    const llm = this.buildClient(resolved, { format: toJsonSchemaFormat(promptModule.schema) });
    const messages = await this.buildMessages(promptModule, input, resolved);
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
    });

    // ─── Cache read-through (deterministic roles only) ────────────────────────
    const requestHash = CACHEABLE_ROLES.has(role) ? this.hashRequest(resolved, promptModule, input) : null;
    if (requestHash) {
      const cached = await this.db.query.llmCache.findFirst({ where: eq(schema.llmCache.requestHash, requestHash) });
      if (cached) {
        const parsedCached = this.parseOutput(promptModule, tryParseJson(cached.response));
        if (parsedCached.success) {
          this.logger.debug('LLM cache hit — skipping model call', { role, requestHash });
          return parsedCached.data;
        }
        this.logger.debug('LLM cache row present but no longer parses — re-invoking', { role, requestHash });
      }
    }

    // ─── Attempt 1: invoke ───────────────────────────────────────────────────
    const rawOutput1 = await this.invokeResilient(llm, messages, this.invokeConfig(ctx, resolved, 0), role);
    const parsed1 = this.parseOutput(promptModule, tryParseJson(rawOutput1));
    if (parsed1.success) {
      this.logger.debug('structured: parsed on first attempt', { role, runId: ctx.runId, outputLength: rawOutput1.length });
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput1);
      return parsed1.data;
    }

    this.logger.warn('Attempt 1 parse failed — repairing', { role, issues: parsed1.issues.length });
    this.logger.debug('Attempt 1 raw output and issues', { role, runId: ctx.runId, rawOutput: rawOutput1, issues: renderSchemaIssues(parsed1.issues) });

    // ─── Attempt 2: repair — continue the conversation with the actual issues ──
    const repairMessages: BaseMessage[] = [
      ...messages,
      new AIMessage(rawOutput1),
      new HumanMessage(
        `That response could not be used. Issues:\n${renderSchemaIssues(parsed1.issues)}\n\nRespond again with ONLY one valid JSON object matching the required schema — fix the listed issues, keep the content, no prose outside the JSON, no markdown fences.`,
      ),
    ];

    const rawOutput2 = await this.invokeResilient(llm, repairMessages, this.invokeConfig(ctx, resolved, 1), role);
    const parsed2 = this.parseOutput(promptModule, tryParseJson(rawOutput2));
    if (parsed2.success) {
      this.logger.debug('structured: parsed after repair', { role, runId: ctx.runId, outputLength: rawOutput2.length });
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput2);
      return parsed2.data;
    }

    // ─── Attempt 3: tolerant extraction ──────────────────────────────────────
    this.logger.warn('Repair parse failed — trying tolerant extraction', { role });
    this.logger.debug('Repair raw output and issues', { role, runId: ctx.runId, rawOutput: rawOutput2, issues: renderSchemaIssues(parsed2.issues) });
    const extracted = extractJsonBlock(rawOutput2);
    if (extracted) {
      const parsed3 = this.parseOutput(promptModule, extracted);
      if (parsed3.success) {
        this.logger.debug('structured: parsed via tolerant extraction', { role, runId: ctx.runId });
        await this.cacheResponse(requestHash, ctx, resolved, promptModule, JSON.stringify(extracted));
        return parsed3.data;
      }
    }

    // ─── Fail ────────────────────────────────────────────────────────────────
    this.logger.error('All parse attempts failed', { role, runId: ctx.runId, rawOutput1: rawOutput1.slice(0, 200) });
    // Full outputs only on debug (dev) — an operator can read the exact prose the model returned.
    this.logger.debug('All parse attempts failed — full raw outputs', { role, runId: ctx.runId, rawOutput1, rawOutput2 });
    throw AppErrorCode.AI_001.create();
  }

  // Normalise the raw parsed value for the module's schema (unwrapping object-wrapped arrays from
  // local JSON mode), validate it, then fold in any postValidate business rules.
  private parseOutput<T>(promptModule: PromptModule<T>, data: unknown): SchemaParseResult<T> {
    const normalized = normalizeForSchema(promptModule.schema, data);
    return applyPostValidate(parseSchema<T>(promptModule.schema, normalized), promptModule.postValidate);
  }

  // Formats the module's template into messages, applying two provider-specific adjustments:
  // Anthropic gets cache_control breakpoints on cacheStrategy modules, and every provider EXCEPT
  // Ollama gets the required JSON schema appended in-band — grammar-constrained decoding only exists
  // on Ollama, so API and CLI-subprocess models must be told the exact output shape or the creative
  // roles (whose prompts never mention JSON) answer with plain prose.
  private async buildMessages<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, resolved: ResolvedModel): Promise<BaseMessage[]> {
    const provider = MODEL_MAP[resolved.model]?.provider ?? resolved.provider;
    let messages = await promptModule.template.formatMessages(input);
    if (promptModule.cacheStrategy && provider === 'anthropic') messages = applyAnthropicCacheControl(messages);
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
  private invokeConfig(ctx: TelemetryContext, resolved: ResolvedModel, attempt: number): { callbacks: TelemetryHandler[]; metadata: Record<string, unknown> } {
    return {
      callbacks: [this.telemetry],
      metadata: { nfTelemetry: { ...ctx, projectId: String(ctx.projectId), provider: resolved.provider, model: resolved.model, attempt } },
    };
  }

  // Invoke the model with a per-call timeout budget and transient-error backoff. Retries only cover
  // transport/timeout failures; a returned (parseable-or-not) response is never retried here.
  private async invokeResilient(llm: BaseChatModel, messages: BaseMessage[], config: object, role: string): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      try {
        const result = await this.withTimeout(llm.invoke(messages, config), LLM_TIMEOUT_MS);
        return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      } catch (err) {
        lastErr = err;
        if (attempt < LLM_MAX_RETRIES) {
          const backoff = LLM_BACKOFF_MS * 2 ** attempt;
          this.logger.warn('LLM transport error — backing off before retry', { role, attempt, backoff, err });
          await sleep(backoff);
        }
      }
    }
    this.logger.error('LLM call failed after retries', { role, err: lastErr });
    throw AppErrorCode.AI_001.create();
  }

  private withTimeout<R>(promise: Promise<R>, ms: number): Promise<R> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`LLM call exceeded ${ms}ms timeout budget`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  private hashRequest(resolved: ResolvedModel, promptModule: { key: string; version: string }, input: Record<string, unknown>): string {
    const payload = JSON.stringify({ provider: resolved.provider, model: resolved.model, promptKey: promptModule.key, promptVersion: promptModule.version, input });
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
