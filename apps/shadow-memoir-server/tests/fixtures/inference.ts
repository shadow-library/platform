import { Injectable } from '@shadow-library/app';

import { type InferenceDraft } from '@modules/ai-worker';
import { InferenceClient, type InferenceRequest } from '@modules/inference';

const DEFAULT_DRAFT: InferenceDraft = {
  answer: 'Evening quests are completed far less often than morning ones, and the misses cluster on late-work days.',
  patterns: ['Evening misses line up with days carrying a late expense.'],
  suggestions: [],
  limitationNote: null,
};

/**
 * The deterministic double the executor specs bind in place of `OllamaInferenceClient`: it records the
 * prompt it was handed (so a spec can assert what the model was actually shown) and answers from a
 * scripted queue, an entry of which may be an `Error` to exercise the retry/refund paths without a
 * flaky network.
 */
@Injectable()
export class ScriptedInferenceClient extends InferenceClient {
  static prompts: InferenceRequest[] = [];
  static responses: (unknown | Error)[] = [];
  static defaultDraft: InferenceDraft = DEFAULT_DRAFT;

  static reset(): void {
    ScriptedInferenceClient.prompts = [];
    ScriptedInferenceClient.responses = [];
    ScriptedInferenceClient.defaultDraft = DEFAULT_DRAFT;
  }

  async completeJson(request: InferenceRequest): Promise<unknown> {
    ScriptedInferenceClient.prompts.push(request);
    const next = ScriptedInferenceClient.responses.shift();
    if (next instanceof Error) throw next;
    return next ?? ScriptedInferenceClient.defaultDraft;
  }
}
