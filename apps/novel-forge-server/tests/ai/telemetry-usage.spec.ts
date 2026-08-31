import { describe, expect, it } from 'bun:test';
import { type LLMResult } from '@langchain/core/outputs';

import { countTokens } from '@modules/ai/context/token-budget';
import { extractTokenUsage } from '@modules/ai/telemetry.handler';

const TEXT = 'The lighthouse keeper counted the waves and wrote the number in his ledger. ';

interface ResultOptions {
  llmOutput?: Record<string, unknown>;
  usageMetadata?: Record<string, unknown>;
  generationInfo?: Record<string, unknown>;
}

function buildResult(text: string, options: ResultOptions = {}): LLMResult {
  return {
    generations: [[{ text, message: { usage_metadata: options.usageMetadata }, generationInfo: options.generationInfo }]],
    llmOutput: options.llmOutput,
  } as unknown as LLMResult;
}

describe('extractTokenUsage', () => {
  it('should keep an OpenAI prompt count that already includes its cached subset', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 4000, output_tokens: 512, input_token_details: { cache_read: 3500 } },
      llmOutput: { tokenUsage: { promptTokens: 4000, completionTokens: 512, totalTokens: 4512 } },
    });

    expect(extractTokenUsage(result, 3800, TEXT)).toEqual({ inputTokens: 4000, cachedInputTokens: 3500, outputTokens: 512 });
  });

  it('should fold a separately billed cached prefix into the input count', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 2, output_tokens: 4131, input_token_details: { cache_creation: 3000 } },
    });

    expect(extractTokenUsage(result, 100, TEXT)).toEqual({ inputTokens: 3002, cachedInputTokens: null, outputTokens: 4131 });
  });

  it('should fold a cache hit back into the two-token input count anthropic reports', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 2, output_tokens: 4131, input_token_details: { cache_read: 3000 } },
    });

    expect(extractTokenUsage(result, 100, TEXT)).toEqual({ inputTokens: 3002, cachedInputTokens: 3000, outputTokens: 4131 });
  });

  it('should fold both halves of the prefix on the call that writes the cache', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 2, output_tokens: 4131, input_token_details: { cache_read: 3000, cache_creation: 1200 } },
    });

    expect(extractTokenUsage(result, 100, TEXT)).toEqual({ inputTokens: 4202, cachedInputTokens: 3000, outputTokens: 4131 });
  });

  it('should treat the prefix as one aggregate rather than folding each half against the reported input', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 3500, output_tokens: 512, input_token_details: { cache_read: 3000, cache_creation: 1200 } },
    });

    expect(extractTokenUsage(result, 100, TEXT).inputTokens).toBe(7700);
  });

  it('should floor on the measured prompt when the provider reports only the uncached tail', () => {
    const result = buildResult(TEXT, {
      usageMetadata: { input_tokens: 2, output_tokens: 4131 },
      llmOutput: { tokenUsage: { promptTokens: 2, completionTokens: 4131, totalTokens: 4133 } },
    });

    expect(extractTokenUsage(result, 3206, TEXT)).toEqual({ inputTokens: 3206, cachedInputTokens: null, outputTokens: 4131 });
  });

  it('should read the camelCase token usage @langchain/openai puts on llmOutput', () => {
    const result = buildResult(TEXT, { llmOutput: { tokenUsage: { promptTokens: 1804, completionTokens: 296, totalTokens: 2100 } } });

    expect(extractTokenUsage(result, 1700, TEXT)).toEqual({ inputTokens: 1804, cachedInputTokens: null, outputTokens: 296 });
  });

  it('should read the estimated token usage of the streaming path', () => {
    const result = buildResult(TEXT, { llmOutput: { estimatedTokenUsage: { promptTokens: 1804, completionTokens: 296, totalTokens: 2100 } } });

    expect(extractTokenUsage(result, 1700, TEXT)).toEqual({ inputTokens: 1804, cachedInputTokens: null, outputTokens: 296 });
  });

  it('should treat a zero-filled token usage as unreported and fall back to measurement', () => {
    const result = buildResult(TEXT, { llmOutput: { tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } });

    expect(extractTokenUsage(result, 2048, TEXT)).toEqual({ inputTokens: 2048, cachedInputTokens: null, outputTokens: countTokens(TEXT) });
  });

  it('should keep a reported zero cache read distinct from an unreported one', () => {
    const result = buildResult(TEXT, { usageMetadata: { input_tokens: 1804, output_tokens: 296, input_token_details: { cache_read: 0 } } });

    expect(extractTokenUsage(result, 1700, TEXT).cachedInputTokens).toBe(0);
    expect(extractTokenUsage(buildResult(TEXT, { usageMetadata: { input_tokens: 1804, output_tokens: 296 } }), 1700, TEXT).cachedInputTokens).toBeNull();
  });

  it('should read the eval counts ollama reports on the generation info', () => {
    const result = buildResult(TEXT, { generationInfo: { prompt_eval_count: 1804, eval_count: 296 } });

    expect(extractTokenUsage(result, 1700, TEXT)).toEqual({ inputTokens: 1804, cachedInputTokens: null, outputTokens: 296 });
  });

  it('should read the OpenRouter cache read nested under prompt_tokens_details', () => {
    const result = buildResult(TEXT, { llmOutput: { usage: { prompt_tokens: 4000, completion_tokens: 512, prompt_tokens_details: { cached_tokens: 3500 } } } });

    expect(extractTokenUsage(result, 3800, TEXT)).toEqual({ inputTokens: 4000, cachedInputTokens: 3500, outputTokens: 512 });
  });
});
