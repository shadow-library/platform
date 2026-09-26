import { describe, expect, it } from 'bun:test';
import { AIMessageChunk } from '@langchain/core/messages';
import { type LLMResult } from '@langchain/core/outputs';

import { TelemetryHandler } from '@modules/ai/telemetry.handler';

interface Row {
  costSource?: string | null;
  costUsd?: string | null;
  tier?: string | null;
  contentMode?: string | null;
}

function makeHandler(): { handler: TelemetryHandler; rows: Row[] } {
  const rows: Row[] = [];
  const db = { insert: () => ({ values: async (row: Row) => void rows.push(row) }) };
  return { handler: new TelemetryHandler({ getPostgresClient: () => db } as never), rows };
}

const ctx = { projectId: '1', promptKey: 'judge', promptVersion: '1.0.0', role: 'judge', provider: 'openrouter', model: 'anthropic/claude-sonnet-5', attempt: 0 };

function start(handler: TelemetryHandler, runId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  return handler.handleLLMStart({} as never, ['hi'], runId, undefined, undefined, undefined, { nfTelemetry: ctx, ...metadata });
}

function result(additionalKwargs?: Record<string, unknown>): LLMResult {
  return {
    generations: [[{ text: 'ok', message: { additional_kwargs: additionalKwargs } }]],
    llmOutput: { usage: { prompt_tokens: 10, completion_tokens: 4 } },
  } as unknown as LLMResult;
}

describe('TelemetryHandler cost_source classification', () => {
  it('should classify a direct OpenRouter response (usage.cost, no gateway object) as provider', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r1');
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.002 } } }), 'r1');

    expect(rows[0]?.costSource).toBe('provider');
    expect(rows[0]?.costUsd).toBe('0.002');
  });

  it("should classify the gateway's OpenRouter leg as provider", async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r2');
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.002 }, gateway: { served_by: 'gw', openrouter: true } } }), 'r2');

    expect(rows[0]?.costSource).toBe('provider');
  });

  it("should classify the gateway's own subscription leg as gateway", async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r3');
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.002 }, gateway: { served_by: 'gw', openrouter: false } } }), 'r3');

    expect(rows[0]?.costSource).toBe('gateway');
  });

  it('should classify a response with no reported cost as estimate, falling back to the list-price estimate', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r4');
    await handler.handleLLMEnd(result({ __raw_response: { usage: {} } }), 'r4');

    expect(rows[0]?.costSource).toBe('estimate');
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });

  it('should classify a streamed call by reading response_metadata.gateway off the message LangChain concatenates from real stream chunks', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r5');
    // Shaped like the real stream: ordinary text-delta chunks carry no `response_metadata`, and only the
    // synthetic usage chunk `GatewayChatOpenAI` emits after its loop (see `gateway-chat-openai.ts`) carries
    // `usage`/`gateway` — concatenating them (LangChain's own merge, not a hand-built LLMResult) is what
    // `handleLLMEnd` actually receives for a streamed call.
    const textChunk = new AIMessageChunk({ content: 'hi' });
    const usageChunk = new AIMessageChunk({ content: '', response_metadata: { usage: { cost: 0.0007 }, gateway: { served_by: 'gw', openrouter: false } } });
    const merged = textChunk.concat(usageChunk);
    await handler.handleLLMEnd({ generations: [[{ text: 'hi', message: merged }]], llmOutput: {} } as unknown as LLMResult, 'r5');

    expect(rows[0]?.costSource).toBe('gateway');
    expect(rows[0]?.costUsd).toBe('0.0007');
  });
});

describe('TelemetryHandler tier/content_mode persistence', () => {
  it('should persist tier and content_mode when the invoke config metadata carries them', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r6', { costTier: 'performant', contentMode: 'unrestricted' });
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.001 } } }), 'r6');

    expect(rows[0]?.tier).toBe('performant');
    expect(rows[0]?.contentMode).toBe('unrestricted');
  });

  it('should persist null when the invoke config metadata omits them', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r7');
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.001 } } }), 'r7');

    expect(rows[0]?.tier).toBeNull();
    expect(rows[0]?.contentMode).toBeNull();
  });

  it('should ignore a value outside the known enum rather than persist garbage', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r8', { costTier: 'premium' });
    await handler.handleLLMEnd(result({ __raw_response: { usage: { cost: 0.001 } } }), 'r8');

    expect(rows[0]?.tier).toBeNull();
  });

  it('should persist tier and content_mode on an errored call too', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r9', { costTier: 'economy', contentMode: 'standard' });
    await handler.handleLLMError(new Error('boom'), 'r9');

    expect(rows[0]?.tier).toBe('economy');
    expect(rows[0]?.contentMode).toBe('standard');
  });
});
