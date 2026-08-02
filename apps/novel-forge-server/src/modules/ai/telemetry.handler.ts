/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type Serialized } from '@langchain/core/load/serializable';
import { type LLMResult } from '@langchain/core/outputs';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { countTokens } from './context/token-budget';

/**
 * Defining types
 */

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
}

/**
 * Declaring the constants
 */

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

    const nf = metadata?.['nfTelemetry'] as (TelemetryContext & { projectId: string; provider: string; model: string; attempt: number }) | undefined;
    if (nf) {
      const { provider, model, attempt, projectId, ...ctx } = nf;
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
      this.pending.set(runId, { startedAt: Date.now(), ctx: { ...ctx, projectId: BigInt(projectId) }, provider, model, attempt, promptTokensEstimate });
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
    const usage = output.llmOutput?.usage ?? output.llmOutput?.tokenUsage ?? null;
    // Token counts live in different places by provider: cloud SDKs put them on `llmOutput.usage`;
    // LangChain normalises them onto the message's `usage_metadata`; Ollama reports raw `*_eval_count`
    // on the generation info. Fall through all three so local runs report real token usage too.
    const meta = generation as
      { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } }; generationInfo?: { prompt_eval_count?: number; eval_count?: number } } | undefined;
    // When no layer reports usage, fall back to tokenizer estimates so the run detail and usage
    // dashboards never show blank counts.
    const inputTokens: number =
      usage?.input_tokens ?? usage?.prompt_tokens ?? meta?.message?.usage_metadata?.input_tokens ?? meta?.generationInfo?.prompt_eval_count ?? call.promptTokensEstimate;
    const outputTokens: number =
      usage?.output_tokens ?? usage?.completion_tokens ?? meta?.message?.usage_metadata?.output_tokens ?? meta?.generationInfo?.eval_count ?? countTokens(rawOutput);

    this.logger.debug('LLM call completed', { runId, role: call.ctx.role, model: call.model, latencyMs, inputTokens, outputTokens, attempt: call.attempt });

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
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
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
