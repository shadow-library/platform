import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type Serialized } from '@langchain/core/load/serializable';
import { type LLMResult } from '@langchain/core/outputs';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type PluginStamp } from '../plugins/plugin-policy.service';
import { countTokens } from './context/token-budget';

export interface TelemetryContext {
  projectId: bigint;
  runId?: string;
  node?: string;
  promptKey: string;
  promptVersion: string;
  role: string;
}

interface PendingCall {
  startedAt: number;
  ctx: TelemetryContext;
  provider: string;
  model: string;
  attempt: number;
  promptTokensEstimate: number;
  plugins?: PluginStamp[];
  policyDigest?: string;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
}

type UsageBag = Record<string, unknown> | undefined;

const INPUT_KEYS = ['input_tokens', 'prompt_tokens', 'promptTokens', 'prompt_eval_count'];
const OUTPUT_KEYS = ['output_tokens', 'completion_tokens', 'completionTokens', 'eval_count'];
const CACHE_READ_KEYS = ['cache_read', 'cached_tokens', 'cache_read_input_tokens'];
const CACHE_CREATION_KEYS = ['cache_creation', 'cache_creation_input_tokens', 'cache_creation_tokens'];

// `minimum` is what separates a reported count from a missing one: @langchain/ollama seeds
// `usage_metadata` with zeros and @langchain/core's `mergeUsageMetadata` zero-fills every field it
// merges across stream chunks, while @langchain/openai only assigns `usage_metadata.input_tokens`
// when the provider sent a truthy `prompt_tokens`. So a 0 prompt/completion count means "not
// reported" and must keep falling through — while a 0 cache read genuinely means "no cache hit".
function readTokens(sources: UsageBag[], keys: string[], minimum = 1): number | undefined {
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= minimum) return value;
    }
  }
  return undefined;
}

export function extractTokenUsage(output: LLMResult, promptTokensEstimate: number, rawOutput: string): TokenUsage {
  const llmOutput = output.llmOutput as Record<string, UsageBag> | undefined;
  const generation = output.generations?.[0]?.[0] as
    { message?: { usage_metadata?: Record<string, unknown> & { input_token_details?: UsageBag } }; generationInfo?: UsageBag } | undefined;
  const usageMetadata = generation?.message?.usage_metadata;
  // Counts live in a different place per provider and in a different spelling per transport: cloud SDKs
  // put them on `llmOutput.usage`, LangChain normalises them onto the message's `usage_metadata`,
  // @langchain/openai reports camelCase `tokenUsage` (or `estimatedTokenUsage` when streaming), and
  // Ollama reports raw `*_eval_count` on the generation info.
  const sources: UsageBag[] = [llmOutput?.['usage'], usageMetadata, llmOutput?.['tokenUsage'], generation?.generationInfo, llmOutput?.['estimatedTokenUsage']];
  const cacheSources: UsageBag[] = [usageMetadata?.input_token_details, llmOutput?.['usage']?.['prompt_tokens_details'] as UsageBag, ...sources];

  const cacheRead = readTokens(cacheSources, CACHE_READ_KEYS, 0);
  const cachedPrefix = (cacheRead ?? 0) + (readTokens(cacheSources, CACHE_CREATION_KEYS, 0) ?? 0);
  const reportedInput = readTokens(sources, INPUT_KEYS);
  // Anthropic bills the cached prefix separately, so `prompt_tokens` arriving from an Anthropic-backed
  // OpenAI-compatible endpoint is the uncached tail alone — a fully cached prompt lands as 2 — whereas
  // OpenAI reports it inclusive of its cached subset. Fold the prefix back in only when it plainly sits
  // outside the reported count, then floor on the measured prompt so a provider that reports no cache
  // accounting at all still cannot record a thousand-token prompt as two tokens.
  const providerInput = reportedInput === undefined ? cachedPrefix : reportedInput < cachedPrefix ? reportedInput + cachedPrefix : reportedInput;

  return {
    inputTokens: Math.max(providerInput, promptTokensEstimate),
    cachedInputTokens: cacheRead ?? null,
    outputTokens: readTokens(sources, OUTPUT_KEYS) ?? countTokens(rawOutput),
  };
}

@Injectable()
export class TelemetryHandler extends BaseCallbackHandler {
  name = 'novel-forge-telemetry';

  private readonly logger = Logger.getLogger(APP_NAME, TelemetryHandler.name);
  private readonly db: PrimaryDatabase;
  private readonly pending = new Map<string, PendingCall>();

  constructor(private readonly databaseService: DatabaseService) {
    super();
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Attribution flows in through the invoke config's `metadata` under `nfTelemetry`. Reading it here —
  // rather than pre-registering by a langchain runId we can't know ahead of a prompt.pipe(llm) chain —
  // is what keeps every model_calls row tagged with its project/run/node/attempt.
  override async handleLLMStart(
    _llm: Serialized,
    prompts: unknown[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (this.pending.has(runId)) return;

    // Not every provider reports token usage, so the prompt is measured up front and used as a
    // fallback estimate when the provider stays silent.
    const promptTokensEstimate = countTokens(prompts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n'));

    const nf = metadata?.['nfTelemetry'] as
      (TelemetryContext & { projectId: string; provider: string; model: string; attempt: number; plugins?: PluginStamp[]; policyDigest?: string }) | undefined;
    if (nf) {
      const { provider, model, attempt, projectId, plugins, policyDigest, ...ctx } = nf;
      this.logger.debug('LLM call started', {
        runId,
        provider,
        model,
        attempt,
        role: ctx.role,
        promptKey: ctx.promptKey,
        node: ctx.node,
        workflowRunId: ctx.runId,
        promptTokensEstimate,
      });
      this.pending.set(runId, { startedAt: Date.now(), ctx: { ...ctx, projectId: BigInt(projectId) }, provider, model, attempt, promptTokensEstimate, plugins, policyDigest });
      return;
    }

    this.logger.debug('LLM call started without attribution metadata', { runId, promptTokensEstimate });

    this.pending.set(runId, {
      startedAt: Date.now(),
      ctx: { projectId: BigInt(0), promptKey: 'unknown', promptVersion: '0', role: 'unknown' },
      provider: 'unknown',
      model: 'unknown',
      attempt: 0,
      promptTokensEstimate,
    });
  }

  override async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const call = this.pending.get(runId);
    if (!call) return;
    this.pending.delete(runId);

    const latencyMs = Date.now() - call.startedAt;
    const generation = output.generations?.[0]?.[0];
    const rawOutput = generation ? (typeof generation.text === 'string' ? generation.text : JSON.stringify(generation)) : '';
    const { inputTokens, cachedInputTokens, outputTokens } = extractTokenUsage(output, call.promptTokensEstimate, rawOutput);

    this.logger.debug('LLM call completed', { runId, role: call.ctx.role, model: call.model, latencyMs, inputTokens, cachedInputTokens, outputTokens, attempt: call.attempt });

    try {
      await this.db.insert(schema.modelCalls).values({
        projectId: call.ctx.projectId,
        runId: call.ctx.runId ?? null,
        node: call.ctx.node ?? null,
        role: call.ctx.role,
        provider: call.provider,
        model: call.model,
        promptKey: call.ctx.promptKey,
        promptVersion: call.ctx.promptVersion,
        status: 'ok',
        plugins: call.plugins ?? null,
        policyDigest: call.policyDigest ?? null,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        latencyMs,
        attempt: call.attempt,
        rawOutput,
      });
    } catch (err) {
      this.logger.error('Failed to write model_call telemetry row', { err, runId });
    }
  }

  override async handleLLMError(err: Error, runId: string): Promise<void> {
    const call = this.pending.get(runId);
    if (!call) return;
    this.pending.delete(runId);

    this.logger.warn('LLM call errored', { runId, role: call.ctx.role, model: call.model, attempt: call.attempt, err });

    try {
      await this.db.insert(schema.modelCalls).values({
        projectId: call.ctx.projectId,
        runId: call.ctx.runId ?? null,
        node: call.ctx.node ?? null,
        role: call.ctx.role,
        provider: call.provider,
        model: call.model,
        promptKey: call.ctx.promptKey,
        promptVersion: call.ctx.promptVersion,
        status: 'transport_error',
        plugins: call.plugins ?? null,
        policyDigest: call.policyDigest ?? null,
        latencyMs: Date.now() - call.startedAt,
        attempt: call.attempt,
        rawOutput: '',
        error: { class: err.constructor.name, message: err.message },
      });
    } catch (writeErr) {
      this.logger.error('Failed to write model_call error telemetry row', { writeErr });
    }
  }
}
