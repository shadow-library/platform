import { describe, expect, it } from 'bun:test';
import { type LLMResult } from '@langchain/core/outputs';

import { classifyCostSource } from '@modules/ai/quota';
import { extractGatewayInfo, extractProviderCost } from '@modules/ai/telemetry.handler';

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

describe('extractGatewayInfo', () => {
  it('should read the gateway object from the raw response', () => {
    const result = buildResult({ __raw_response: { gateway: { served_by: 'cli-gateway', served_model: 'anthropic/claude-sonnet-5', openrouter: false } } });

    expect(extractGatewayInfo(result)).toEqual({ servedBy: 'cli-gateway', servedModel: 'anthropic/claude-sonnet-5', openrouter: false });
  });

  it('should return undefined when the raw response carries no gateway object', () => {
    const result = buildResult({ __raw_response: { usage: { cost: 0.001 } } });

    expect(extractGatewayInfo(result)).toBeUndefined();
  });

  it('should return undefined when the gateway object omits the openrouter flag', () => {
    const result = buildResult({ __raw_response: { gateway: { served_by: 'cli-gateway' } } });

    expect(extractGatewayInfo(result)).toBeUndefined();
  });
});

describe('classifyCostSource', () => {
  it('should classify a direct OpenRouter response (no gateway object) as provider', () => {
    expect(classifyCostSource(0.001, undefined)).toBe('provider');
  });

  it("should classify the gateway's OpenRouter leg as provider", () => {
    expect(classifyCostSource(0.001, { openrouter: true })).toBe('provider');
  });

  it("should classify the gateway's own subscription leg as gateway", () => {
    expect(classifyCostSource(0.001, { openrouter: false })).toBe('gateway');
  });

  it('should classify a call that reported no cost as estimate, gateway or not', () => {
    expect(classifyCostSource(undefined, undefined)).toBe('estimate');
    expect(classifyCostSource(undefined, { openrouter: false })).toBe('estimate');
    expect(classifyCostSource(undefined, { openrouter: true })).toBe('estimate');
  });
});
