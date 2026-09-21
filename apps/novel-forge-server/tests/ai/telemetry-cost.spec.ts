import { describe, expect, it } from 'bun:test';
import { type LLMResult } from '@langchain/core/outputs';

import { extractProviderCost } from '@modules/ai/telemetry.handler';

function buildResult(additionalKwargs?: Record<string, unknown>, responseMetadata?: Record<string, unknown>): LLMResult {
  return {
    generations: [[{ text: 'hi', message: { additional_kwargs: additionalKwargs, response_metadata: responseMetadata } }]],
    llmOutput: {},
  } as unknown as LLMResult;
}

describe('extractProviderCost', () => {
  it("should read cost from OpenRouter's raw response, preserved via __includeRawResponse", () => {
    const result = buildResult({ __raw_response: { usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.00014 } } });

    expect(extractProviderCost(result)).toBe(0.00014);
  });

  it('should fall back to response_metadata.usage.cost when the raw response was not preserved', () => {
    const result = buildResult(undefined, { usage: { cost: 0.0012 } });

    expect(extractProviderCost(result)).toBe(0.0012);
  });

  it('should return undefined when the provider reported no cost', () => {
    const result = buildResult({ __raw_response: { usage: { prompt_tokens: 10, completion_tokens: 4 } } });

    expect(extractProviderCost(result)).toBeUndefined();
  });

  it('should return undefined for a non-numeric cost field rather than propagate garbage', () => {
    const result = buildResult({ __raw_response: { usage: { cost: 'unknown' } } });

    expect(extractProviderCost(result)).toBeUndefined();
  });

  it('should return undefined when there is no generation at all', () => {
    expect(extractProviderCost({ generations: [] } as unknown as LLMResult)).toBeUndefined();
  });
});
