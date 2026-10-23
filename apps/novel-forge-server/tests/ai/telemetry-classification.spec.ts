import { describe, expect, it } from 'bun:test';
import { type LLMResult } from '@langchain/core/outputs';

import { TelemetryHandler } from '@modules/ai/telemetry.handler';

interface Row {
  provider?: string;
  model?: string;
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

const ctx = { projectId: '1', promptKey: 'judge', promptVersion: '1.0.0', role: 'judge', provider: 'synapse', model: 'novel-forge.review', attempt: 0 };

function start(handler: TelemetryHandler, runId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  return handler.handleLLMStart({} as never, ['hi'], runId, undefined, undefined, undefined, { nfTelemetry: ctx, ...metadata });
}

function result(): LLMResult {
  return {
    generations: [[{ text: 'ok', message: {} }]],
    llmOutput: { usage: { prompt_tokens: 10, completion_tokens: 4 } },
  } as unknown as LLMResult;
}

describe('TelemetryHandler without a Synapse block', () => {
  it('should record the routed task with no cost when the response names no served model', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r1');
    await handler.handleLLMEnd(result(), 'r1');

    expect(rows[0]).toMatchObject({ provider: 'synapse', model: 'novel-forge.review', costUsd: '0', costSource: 'estimate' });
  });
});

describe('TelemetryHandler tier/content_mode persistence', () => {
  it('should persist tier and content_mode when the invoke config metadata carries them', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r6', { costTier: 'performant', contentMode: 'unrestricted' });
    await handler.handleLLMEnd(result(), 'r6');

    expect(rows[0]?.tier).toBe('performant');
    expect(rows[0]?.contentMode).toBe('unrestricted');
  });

  it('should persist null when the invoke config metadata omits them', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r7');
    await handler.handleLLMEnd(result(), 'r7');

    expect(rows[0]?.tier).toBeNull();
    expect(rows[0]?.contentMode).toBeNull();
  });

  it('should ignore a value outside the known enum rather than persist garbage', async () => {
    const { handler, rows } = makeHandler();
    await start(handler, 'r8', { costTier: 'premium' });
    await handler.handleLLMEnd(result(), 'r8');

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
