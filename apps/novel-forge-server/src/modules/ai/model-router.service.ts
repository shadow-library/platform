/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { ChatAnthropic } from '@langchain/anthropic';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatXAI } from '@langchain/xai';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
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
import { type PromptModule } from './prompts/types';
import { type SchemaIssue, type SchemaParseResult, parseSchema, renderSchemaIssues } from './schemas/validate';
import { ChatClaudeCode, ChatCodex } from './subprocess-providers';
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
// results are safe to cache. Creative roles (generation, revision, plan, outline…) are never cached —
// caching them would make a re-request return byte-identical prose.
const CACHEABLE_ROLES = new Set<AiRole>(['judge', 'validation', 'continuity', 'extraction', 'review']);
const LLM_TIMEOUT_MS = Number(process.env['AI_LLM_TIMEOUT_MS'] ?? 120_000);
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
    // 2. per-project config override
    const projectModel = (project?.config?.models as Record<string, ResolvedModel> | undefined)?.[role];
    if (projectModel) return projectModel;
    // 3. AI_PROFILE defaults
    return getProfileDefaults()[role] ?? { provider: 'xai', model: Config.get('ai.grok.llm.model') };
  }

  buildClient(resolved: ResolvedModel): BaseChatModel {
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
        return new ChatOllama({ model: resolved.model, baseUrl: Config.get('ai.ollama.host'), temperature: 0 });
      case 'anthropic-claude-code':
        if (!Config.get('ai.claude-code.enabled')) throw new ServerError(AppErrorCode.AI_002);
        return new ChatClaudeCode(Config.get('ai.claude-code.bin'));
      case 'openai-codex':
        if (!Config.get('ai.codex.enabled')) throw new ServerError(AppErrorCode.AI_002);
        return new ChatCodex(Config.get('ai.codex.bin'));
      default:
        throw new ServerError(AppErrorCode.AI_002);
    }
  }

  chatFor(role: AiRole, project?: ProjectConfig): BaseChatModel {
    const resolved = this.resolveModel(role, project);
    this.logger.debug(`Routing role=${role} to provider=${resolved.provider} model=${resolved.model}`);
    return this.buildClient(resolved);
  }

  async structured<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, ctx: TelemetryContext, project?: ProjectConfig): Promise<T> {
    const role = promptModule.key as AiRole;
    const resolved = this.resolveModel(role, project);
    const llm = this.buildClient(resolved);
    const chain = promptModule.template.pipe(llm);

    // ─── Cache read-through (deterministic roles only) ────────────────────────
    const requestHash = CACHEABLE_ROLES.has(role) ? this.hashRequest(resolved, promptModule, input) : null;
    if (requestHash) {
      const cached = await this.db.query.llmCache.findFirst({ where: eq(schema.llmCache.requestHash, requestHash) });
      if (cached) {
        const parsedCached = applyPostValidate(parseSchema<T>(promptModule.schema, tryParseJson(cached.response)), promptModule.postValidate);
        if (parsedCached.success) {
          this.logger.debug('LLM cache hit — skipping model call', { role, requestHash });
          return parsedCached.data;
        }
      }
    }

    // ─── Attempt 1: invoke ───────────────────────────────────────────────────
    const rawOutput1 = await this.invokeResilient(chain, input, this.invokeConfig(ctx, resolved, 0), role);
    const parsed1 = applyPostValidate(parseSchema<T>(promptModule.schema, tryParseJson(rawOutput1)), promptModule.postValidate);
    if (parsed1.success) {
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput1);
      return parsed1.data;
    }

    this.logger.warn('Attempt 1 parse failed — repairing', { role, issues: parsed1.issues.length });

    // ─── Attempt 2: repair ───────────────────────────────────────────────────
    const repairInput = {
      ...input,
      priorOutput: rawOutput1,
      parseIssues: renderSchemaIssues(parsed1.issues),
      instruction: 'The previous response could not be parsed. Fix the JSON so it matches the required schema. Output ONLY valid JSON.',
    };

    const rawOutput2 = await this.invokeResilient(chain, repairInput, this.invokeConfig(ctx, resolved, 1), role);
    const parsed2 = applyPostValidate(parseSchema<T>(promptModule.schema, tryParseJson(rawOutput2)), promptModule.postValidate);
    if (parsed2.success) {
      await this.cacheResponse(requestHash, ctx, resolved, promptModule, rawOutput2);
      return parsed2.data;
    }

    // ─── Attempt 3: tolerant extraction ──────────────────────────────────────
    this.logger.warn('Repair parse failed — trying tolerant extraction', { role });
    const extracted = extractJsonBlock(rawOutput2);
    if (extracted) {
      const parsed3 = applyPostValidate(parseSchema<T>(promptModule.schema, extracted), promptModule.postValidate);
      if (parsed3.success) {
        await this.cacheResponse(requestHash, ctx, resolved, promptModule, JSON.stringify(extracted));
        return parsed3.data;
      }
    }

    // ─── Fail ────────────────────────────────────────────────────────────────
    this.logger.error('All parse attempts failed', { role, rawOutput1: rawOutput1.slice(0, 200) });
    throw new ServerError(AppErrorCode.AI_001);
  }

  // Invoke config: telemetry callback + attribution metadata (read by TelemetryHandler.handleLLMStart).
  private invokeConfig(ctx: TelemetryContext, resolved: ResolvedModel, attempt: number): { callbacks: TelemetryHandler[]; metadata: Record<string, unknown> } {
    return {
      callbacks: [this.telemetry],
      metadata: { nfTelemetry: { ...ctx, projectId: String(ctx.projectId), provider: resolved.provider, model: resolved.model, attempt } },
    };
  }

  // Invoke the chain with a per-call timeout budget and transient-error backoff. Retries only cover
  // transport/timeout failures; a returned (parseable-or-not) response is never retried here.
  private async invokeResilient(
    chain: { invoke: (input: Record<string, unknown>, config: object) => Promise<{ content: unknown }> },
    input: Record<string, unknown>,
    config: object,
    role: string,
  ): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      try {
        const result = await this.withTimeout(chain.invoke(input, config), LLM_TIMEOUT_MS);
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
    throw new ServerError(AppErrorCode.AI_001);
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
