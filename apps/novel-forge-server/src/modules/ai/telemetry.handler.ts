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
    _messages: unknown[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (this.pending.has(runId)) return;

    const nf = metadata?.['nfTelemetry'] as (TelemetryContext & { projectId: string; provider: string; model: string; attempt: number }) | undefined;
    if (nf) {
      const { provider, model, attempt, projectId, ...ctx } = nf;
      this.pending.set(runId, { startedAt: Date.now(), ctx: { ...ctx, projectId: BigInt(projectId) }, provider, model, attempt });
      return;
    }

    this.pending.set(runId, {
      startedAt: Date.now(),
      ctx: { projectId: BigInt(0), promptKey: 'unknown', promptVersion: '0', role: 'unknown' },
      provider: 'unknown',
      model: 'unknown',
      attempt: 0,
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
    const inputTokens: number | undefined = usage?.input_tokens ?? usage?.prompt_tokens;
    const outputTokens: number | undefined = usage?.output_tokens ?? usage?.completion_tokens;

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
      this.logger.error('Failed to write model_call telemetry row', { err });
    }
  }

  override async handleLLMError(err: Error, runId: string): Promise<void> {
    const call = this.pending.get(runId);
    if (!call) return;
    this.pending.delete(runId);

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
