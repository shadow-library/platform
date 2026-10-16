import { describe, expect, it } from 'bun:test';

import { parseServedModel, parseUsage, toOpenAiUsage } from '@modules/providers/usage.util';

describe('parseUsage', () => {
  it('should read OpenAI usage with its cached and reasoning token details', () => {
    const usage = parseUsage({
      prompt_tokens: 1200,
      completion_tokens: 300,
      total_tokens: 1500,
      prompt_tokens_details: { cached_tokens: 1000 },
      completion_tokens_details: { reasoning_tokens: 120 },
    });

    expect(usage).toEqual({ inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 300, reasoningTokens: 120 });
  });

  it("should carry OpenRouter's usage cost", () => {
    expect(parseUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.0213 }, { withCost: true })).toEqual({
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
      reasoningTokens: 0,
      upstreamCostUsd: 0.0213,
    });
  });

  it("should read the gateway's usage, ignoring its cache write count and its vendor-equivalent cost", () => {
    const usage = parseUsage({
      prompt_tokens: 4000,
      completion_tokens: 50,
      total_tokens: 4050,
      prompt_tokens_details: { cached_tokens: 3500, cache_write_tokens: 400 },
      cost: 0.4,
    });

    expect(usage).toEqual({ inputTokens: 4000, cachedInputTokens: 3500, outputTokens: 50, reasoningTokens: 0 });
  });

  it("should read Ollama's bare token counts", () => {
    expect(parseUsage({ prompt_tokens: 26, completion_tokens: 9, total_tokens: 35 })).toEqual({ inputTokens: 26, cachedInputTokens: 0, outputTokens: 9, reasoningTokens: 0 });
  });

  it('should read embedding usage, which has no completion count', () => {
    expect(parseUsage({ prompt_tokens: 8, total_tokens: 8 })).toEqual({ inputTokens: 8, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 });
  });

  it('should fold cache reads back into an input count that reports them beside it rather than inside it', () => {
    expect(parseUsage({ prompt_tokens: 2, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 900 } })).toMatchObject({ inputTokens: 902, cachedInputTokens: 900 });
  });

  it('should ignore negative, fractional-overflow and non-numeric counts', () => {
    expect(parseUsage({ prompt_tokens: -3, completion_tokens: 'many', cost: Number.NaN }, { withCost: true })).toBeUndefined();
    expect(parseUsage({ prompt_tokens: 10.7, completion_tokens: 2 })).toMatchObject({ inputTokens: 10, outputTokens: 2 });
  });

  it('should answer undefined for a missing or empty usage', () => {
    for (const raw of [undefined, null, 'usage', [], {}]) expect(parseUsage(raw)).toBeUndefined();
  });
});

describe('parseServedModel', () => {
  it('should read the model the gateway ran from its gateway block', () => {
    expect(parseServedModel({ gateway: { served_by: 'claude', served_model: 'claude-sonnet-5', openrouter: false } })).toBe('claude-sonnet-5');
  });

  it('should answer undefined without a gateway block', () => {
    expect(parseServedModel({ usage: {} })).toBeUndefined();
    expect(parseServedModel({ gateway: { served_model: '' } })).toBeUndefined();
  });
});

describe('toOpenAiUsage', () => {
  it('should write normalised usage back as OpenAI usage fields', () => {
    expect(toOpenAiUsage({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningTokens: 5, upstreamCostUsd: 1 })).toEqual({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 5 },
    });
  });
});
