import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { isSynapseError, type SynapseChatResponse, SynapseClient, type SynapseErrorCode } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

export type InferenceTask = 'memoir.insight' | 'memoir.receipt-structuring';

export type InferencePlan = 'free' | 'paid';

export interface InferencePrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface InferenceRequest extends InferencePrompt {
  task: InferenceTask;
  subjectId: string;
  plan: InferencePlan;
}

export interface InferenceResult {
  content: unknown;
  model: string;
}

const TEMPERATURE = 0.2;

const TERMINAL_CODES: ReadonlySet<string> = new Set<SynapseErrorCode>(['SYN_INVALID_REQUEST', 'SYN_POLICY_DENIED']);

/**
 * The single model seam for the whole service (ARCHITECTURE §15.6 and §14.3 step 2). A class token rather
 * than a TS interface for the same reason `OcrStructuringClient` is one: DI binds against something that
 * survives to runtime. It returns parsed JSON and the model that answered — each caller owns its own
 * response contract, and neither shape leaks into the transport.
 */
export abstract class InferenceClient {
  abstract completeJson(request: InferenceRequest): Promise<InferenceResult>;
}

/** Transient failures (budget, outage, timeout, off-contract output) are `AI_009` and retried; a request Synapse or the model refuses outright is `AI_013` and is not. */
@Injectable()
export class SynapseInferenceClient extends InferenceClient {
  private readonly logger = Logger.getLogger(APP_NAME, SynapseInferenceClient.name);

  constructor(private readonly synapse: SynapseClient) {
    super();
  }

  async completeJson(request: InferenceRequest): Promise<InferenceResult> {
    const response = await this.synapse
      .chat(
        {
          model: request.task,
          temperature: TEMPERATURE,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          synapse: { subject: { type: 'user', id: request.subjectId }, selectors: { plan: request.plan } },
        },
        { signal: AbortSignal.timeout(Config.get('ai.inference-timeout-ms')) },
      )
      .catch((error: unknown) => {
        throw this.toAppError(request.task, error);
      });

    return { content: this.parseContent(response), model: response.synapse?.model ?? response.model };
  }

  private parseContent(response: SynapseChatResponse): unknown {
    const message = response.choices?.[0]?.message;
    if (message?.refusal || response.choices[0]?.finish_reason === 'content_filter') throw AppErrorCode.AI_013.create();
    if (!message?.content) throw AppErrorCode.AI_009.create();

    try {
      return JSON.parse(message.content);
    } catch {
      throw AppErrorCode.AI_009.create();
    }
  }

  private toAppError(task: InferenceTask, error: unknown): AppError {
    const terminal = isSynapseError(error) && TERMINAL_CODES.has(error.code);
    this.logger.warn('Synapse inference call failed', {
      task,
      terminal,
      code: isSynapseError(error) ? error.code : undefined,
      status: isSynapseError(error) ? error.status : undefined,
    });
    return terminal ? AppErrorCode.AI_013.create() : AppErrorCode.AI_009.create();
  }
}
