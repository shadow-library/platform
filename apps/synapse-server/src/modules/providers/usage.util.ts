import { type NormalizedUsage, type OpenAiUsage } from './provider.types';
import { asRecord } from './upstream-payload.util';

export interface UsageParseOptions {
  /** Only OpenRouter's `usage.cost` is a price; the gateway sends the same field as what a CLI answer would have cost on the vendor's API */
  withCost?: boolean;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export function parseUsage(raw: unknown, options: UsageParseOptions = {}): NormalizedUsage | undefined {
  const usage = asRecord(raw);
  if (!usage) return undefined;
  const prompt = count(usage['prompt_tokens']);
  const completion = count(usage['completion_tokens']);
  const cost = options.withCost ? usage['cost'] : undefined;
  const upstreamCostUsd = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : undefined;
  if (prompt === undefined && completion === undefined && upstreamCostUsd === undefined) return undefined;

  const cached = count(asRecord(usage['prompt_tokens_details'])?.['cached_tokens']) ?? 0;
  const reasoning = count(asRecord(usage['completion_tokens_details'])?.['reasoning_tokens']) ?? 0;
  const reported = prompt ?? 0;
  // A provider that reports its cache reads beside the prompt count rather than inside it would otherwise price a negative uncached tail.
  const inputTokens = cached > reported ? reported + cached : reported;
  return { inputTokens, cachedInputTokens: cached, outputTokens: completion ?? 0, reasoningTokens: reasoning, ...(upstreamCostUsd === undefined ? {} : { upstreamCostUsd }) };
}

/** The model the host gateway actually ran, from its `gateway` extension block; for logs only */
export function parseServedModel(payload: unknown): string | undefined {
  const servedModel = asRecord(asRecord(payload)?.['gateway'])?.['served_model'];
  return typeof servedModel === 'string' && servedModel.length > 0 ? servedModel : undefined;
}

export function toOpenAiUsage(usage: NormalizedUsage): OpenAiUsage {
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens,
    prompt_tokens_details: { cached_tokens: usage.cachedInputTokens },
    completion_tokens_details: { reasoning_tokens: usage.reasoningTokens },
  };
}
