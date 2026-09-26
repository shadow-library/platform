import { describe, expect, it } from 'bun:test';
import { AIMessageChunk, HumanMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';

import { GatewayChatOpenAI, stampGatewayOnUsageChunk, tapGatewayFrames } from '@modules/ai/gateway-chat-openai';

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

async function* fakeStream<T>(frames: T[]): AsyncGenerator<T> {
  for (const frame of frames) yield frame;
}

describe('tapGatewayFrames', () => {
  it('should pass every frame through unchanged', async () => {
    const frames = [{ choices: [{ delta: { content: 'hi' } }] }, { choices: [], usage: { cost: 0.001 } }];

    const result = await collect(tapGatewayFrames(fakeStream(frames), () => {}));

    expect(result).toEqual(frames);
  });

  it("should call onGateway with the choice-less final frame's gateway object", async () => {
    const seen: unknown[] = [];
    const frames = [{ choices: [{ delta: { content: 'hi' } }] }, { choices: [], usage: { cost: 0.001 }, gateway: { served_by: 'cli-gateway', openrouter: false } }];

    await collect(tapGatewayFrames(fakeStream(frames), gateway => seen.push(gateway)));

    expect(seen).toEqual([{ served_by: 'cli-gateway', openrouter: false }]);
  });

  it('should never call onGateway when no frame carries a gateway object', async () => {
    const seen: unknown[] = [];
    const frames = [{ choices: [{ delta: { content: 'hi' } }] }, { choices: [], usage: { cost: 0.001 } }];

    await collect(tapGatewayFrames(fakeStream(frames), gateway => seen.push(gateway)));

    expect(seen).toHaveLength(0);
  });
});

describe('stampGatewayOnUsageChunk', () => {
  // Matches the real chunk `ChatOpenAICompletions._streamResponseChunks` emits after its frame loop: no
  // message content, `usage_metadata` set from the usage frame, and `response_metadata.usage` alongside it.
  function usageChunk(): ChatGenerationChunk {
    return new ChatGenerationChunk({
      text: '',
      message: new AIMessageChunk({
        content: '',
        response_metadata: { usage: { cost: 0.001 } },
        usage_metadata: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
      }),
    });
  }

  function responseMetadata(chunk: ChatGenerationChunk): Record<string, unknown> {
    return chunk.message.response_metadata as Record<string, unknown>;
  }

  it('should attach gateway onto the chunk that already carries usage_metadata', () => {
    const chunk = usageChunk();

    stampGatewayOnUsageChunk(chunk, { served_by: 'cli-gateway', openrouter: false });

    expect(responseMetadata(chunk)['gateway']).toEqual({ served_by: 'cli-gateway', openrouter: false });
    expect(responseMetadata(chunk)['usage']).toEqual({ cost: 0.001 });
  });

  it('should leave a plain text-delta chunk (no usage_metadata) untouched', () => {
    const chunk = new ChatGenerationChunk({ text: 'hi', message: new AIMessageChunk({ content: 'hi' }) });

    stampGatewayOnUsageChunk(chunk, { served_by: 'cli-gateway', openrouter: false });

    expect(responseMetadata(chunk)['gateway']).toBeUndefined();
  });

  it('should not stamp a chunk that carries response_metadata.usage but no usage_metadata', () => {
    const chunk = new ChatGenerationChunk({ text: '', message: new AIMessageChunk({ content: '', response_metadata: { usage: { cost: 0.001 } } }) });

    stampGatewayOnUsageChunk(chunk, { served_by: 'cli-gateway', openrouter: false });

    expect(responseMetadata(chunk)['gateway']).toBeUndefined();
  });

  it('should do nothing when there is no gateway to attach', () => {
    const chunk = usageChunk();

    stampGatewayOnUsageChunk(chunk, undefined);

    expect(responseMetadata(chunk)['gateway']).toBeUndefined();
  });
});

function rawFrame(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 0, model: 'fake-model', choices: [], ...overrides };
}

function textFrame(content: string): Record<string, unknown> {
  return rawFrame({ choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] });
}

function usageFrame(gateway: { served_by: string; openrouter: boolean }): Record<string, unknown> {
  return rawFrame({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }, gateway });
}

async function* fakeChatStream(frames: Record<string, unknown>[]): AsyncGenerator<Record<string, unknown>> {
  for (const f of frames) yield f;
}

function makeClient(): GatewayChatOpenAI {
  return new GatewayChatOpenAI({ model: 'fake-model', apiKey: 'test-key' });
}

function stubNetwork(client: GatewayChatOpenAI, create: () => AsyncGenerator<Record<string, unknown>>): void {
  const completions = (client as unknown as { completions: { client: unknown } }).completions;
  completions.client = { chat: { completions: { create } } };
}

async function collectMerged(stream: AsyncIterable<AIMessageChunk>): Promise<AIMessageChunk> {
  let merged: AIMessageChunk | undefined;
  for await (const chunk of stream) merged = merged ? merged.concat(chunk) : chunk;
  if (!merged) throw new Error('empty stream');
  return merged;
}

function gatewayOf(message: AIMessageChunk): unknown {
  return (message.response_metadata as Record<string, unknown>)['gateway'];
}

describe('GatewayChatOpenAI wiring', () => {
  it('should carry response_metadata.gateway through a plain .stream() call', async () => {
    const client = makeClient();
    stubNetwork(client, () => fakeChatStream([textFrame('hi'), usageFrame({ served_by: 'cli-gateway', openrouter: false })]));

    const merged = await collectMerged(await client.stream([new HumanMessage('hi')]));

    expect(gatewayOf(merged)).toEqual({ served_by: 'cli-gateway', openrouter: false });
  });

  it('should still carry it through .bindTools([]).stream()', async () => {
    const client = makeClient();
    stubNetwork(client, () => fakeChatStream([textFrame('hi'), usageFrame({ served_by: 'cli-gateway', openrouter: false })]));

    const merged = await collectMerged(await client.bindTools([]).stream([new HumanMessage('hi')]));

    expect(gatewayOf(merged)).toEqual({ served_by: 'cli-gateway', openrouter: false });
  });

  it('should still carry it through .withConfig({}).stream(), which reconstructs a plain ChatOpenAI from `fields`', async () => {
    const client = makeClient();
    stubNetwork(client, () => fakeChatStream([textFrame('hi'), usageFrame({ served_by: 'cli-gateway', openrouter: false })]));
    const configured = client.withConfig({});

    const merged = await collectMerged(await configured.stream([new HumanMessage('hi')]));

    expect(gatewayOf(merged)).toEqual({ served_by: 'cli-gateway', openrouter: false });
  });

  it('should not cross-wire two concurrent streams sharing the same client', async () => {
    const client = makeClient();
    let calls = 0;
    stubNetwork(client, () => {
      const callIndex = ++calls;
      return fakeChatStream([textFrame(`hi-${callIndex}`), usageFrame({ served_by: `gw-${callIndex}`, openrouter: false })]);
    });

    const [mergedA, mergedB] = await Promise.all([collectMerged(await client.stream([new HumanMessage('a')])), collectMerged(await client.stream([new HumanMessage('b')]))]);

    const gateways = [gatewayOf(mergedA), gatewayOf(mergedB)].map(g => (g as { served_by: string }).served_by).sort();
    expect(gateways).toEqual(['gw-1', 'gw-2']);
  });
});
