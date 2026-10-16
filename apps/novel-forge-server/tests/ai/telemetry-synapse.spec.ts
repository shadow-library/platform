import { describe, expect, it } from 'bun:test';

import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { type LLMResult } from '@langchain/core/outputs';

import { classifySynapseCostSource } from '@modules/ai/quota';
import { extractSynapseBlock, synapseBilling, TelemetryHandler } from '@modules/ai/telemetry.handler';

import { SYNAPSE_BLOCK } from './synapse-fakes';

type Row = Record<string, unknown>;

const NF_TELEMETRY = { projectId: '1', promptKey: 'judge', promptVersion: '1.0.0', role: 'judge', provider: 'synapse', model: 'novel-forge.review', attempt: 0 };

function makeHandler(): { handler: TelemetryHandler; rows: Row[] } {
  const rows: Row[] = [];
  const db = { insert: () => ({ values: async (row: Row) => void rows.push(row) }) };
  return { handler: new TelemetryHandler({ getPostgresClient: () => db } as never), rows };
}

const result = (message: AIMessage | AIMessageChunk, generationInfo?: Record<string, unknown>): LLMResult =>
  ({ generations: [[{ text: 'ok', message, generationInfo }]], llmOutput: {} }) as unknown as LLMResult;

describe('classifySynapseCostSource', () => {
  it('should call a billed figure the provider’s, a free one at a list price the gateway’s, and anything else an estimate', () => {
    expect(classifySynapseCostSource({ list_usd: 0.02, billed_usd: 0.02 })).toBe('provider');
    expect(classifySynapseCostSource({ list_usd: 0.02, billed_usd: 0 })).toBe('gateway');
    expect(classifySynapseCostSource({ list_usd: 0, billed_usd: 0 })).toBe('estimate');
  });
});

describe('synapseBilling', () => {
  it('should bill the model that answered at its list price, with the effort Synapse applied', () => {
    expect(synapseBilling({ ...SYNAPSE_BLOCK, effort: null })).toEqual({ provider: 'openrouter', model: 'gpt-5.6-luna', costUsd: 0.004, costSource: 'provider' });
    expect(synapseBilling(SYNAPSE_BLOCK).reasoningEffort).toBe('low');
  });

  it('should treat a missing or non-numeric cost as nothing spent', () => {
    expect(synapseBilling({ ...SYNAPSE_BLOCK, cost: { list_usd: Number.NaN } } as never)).toMatchObject({ costUsd: 0, costSource: 'estimate' });
  });
});

describe('extractSynapseBlock', () => {
  it('should read the block off the message, or off the generation info, and ignore a malformed one', () => {
    expect(extractSynapseBlock(result(new AIMessage({ content: 'ok', response_metadata: { synapse: SYNAPSE_BLOCK } })))).toBe(SYNAPSE_BLOCK);
    expect(extractSynapseBlock(result(new AIMessage('ok'), { synapse: SYNAPSE_BLOCK }))).toBe(SYNAPSE_BLOCK);
    expect(extractSynapseBlock(result(new AIMessage({ content: 'ok', response_metadata: { synapse: { model: 7 } } })))).toBeUndefined();
  });
});

describe('TelemetryHandler on a Synapse response', () => {
  it('should record what Synapse served in place of what the router expected', async () => {
    const { handler, rows } = makeHandler();
    await handler.handleLLMStart({} as never, ['hi'], 'r1', undefined, undefined, undefined, { nfTelemetry: NF_TELEMETRY });
    const streamed = new AIMessageChunk({ content: 'ok' }).concat(
      new AIMessageChunk({ content: '', response_metadata: { synapse: SYNAPSE_BLOCK }, usage_metadata: { input_tokens: 1200, output_tokens: 30, total_tokens: 1230 } }),
    );
    await handler.handleLLMEnd(result(streamed), 'r1');

    expect(rows[0]).toMatchObject({
      provider: 'openrouter',
      model: 'gpt-5.6-luna',
      costUsd: '0.004',
      costSource: 'provider',
      reasoningEffort: 'low',
      inputTokens: 1200,
      outputTokens: 30,
    });
  });
});
