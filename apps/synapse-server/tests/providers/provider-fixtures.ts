import { type SynapseEnvelope } from '@shadow-library/synapse';

import { type ModelCapabilities, type ModelSpec, type ProviderSpec } from '@modules/catalog/catalog.types';
import { type ChatRequestBody, type ProviderTarget } from '@modules/providers/provider.types';

export const OPENROUTER: ProviderSpec = {
  kind: 'openai',
  flavor: 'openrouter',
  url: 'https://openrouter.test/api/v1/',
  apiKeyConfig: 'synapse.provider.openrouter.api-key',
  locality: 'third_party',
  cost: 'metered',
};

export const GATEWAY: ProviderSpec = {
  kind: 'openai',
  flavor: 'subscription-gateway',
  url: 'http://gateway.test/v1',
  locality: 'host',
  cost: 'zero',
  features: ['sessions', 'native_web_search'],
};

/** Plain OpenAI: even given every feature and a metered cost, it gets none of the other flavors' quirks */
export const OPENAI_COMPATIBLE: ProviderSpec = {
  kind: 'openai',
  flavor: 'openai-compatible',
  url: 'https://llm.test/v1',
  locality: 'third_party',
  cost: 'metered',
  features: ['sessions', 'native_web_search'],
};

export const OLLAMA: ProviderSpec = { kind: 'ollama', url: 'http://ollama.test:11434', apiKeyConfig: 'synapse.provider.openrouter.api-key', locality: 'host', cost: 'zero' };

export const MOCK: ProviderSpec = { kind: 'mock', url: 'mock://local', locality: 'in_cluster', cost: 'zero' };

export const ENVELOPE: SynapseEnvelope = { request_id: 'req-1', subject: { type: 'user', id: 'u-1' } };

export function modelSpec(capabilities: Partial<ModelCapabilities> = {}): ModelSpec {
  return {
    label: 'Model',
    capabilities: {
      tools: true,
      structuredOutput: 'native',
      vision: false,
      reasoning: 'optional',
      efforts: ['none', 'low', 'high'],
      promptCache: 'none',
      sampling: true,
      ...capabilities,
    },
    pricePerMTok: { input: 1, output: 2 },
    deployments: [{ provider: 'openrouter', id: 'vendor/model' }],
  };
}

export function chatBody(overrides: Partial<ChatRequestBody> = {}): ChatRequestBody {
  return { model: 'novel-forge.chat', messages: [{ role: 'user', content: 'Hello' }], synapse: ENVELOPE, ...overrides };
}

export function targetFor(providerKey: string, provider: ProviderSpec, deploymentId = 'vendor/model', model: ModelSpec = modelSpec()): ProviderTarget {
  return { providerKey, provider, deploymentId, model };
}

export function streamOf(...parts: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(typeof part === 'string' ? encoder.encode(part) : part);
      controller.close();
    },
  });
}

/** A stream that delivers `parts` and then stays open, recording whether it was cancelled */
export function openStreamOf(...parts: string[]): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

export function sse(...frames: (object | string)[]): string {
  return frames.map(frame => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`).join('');
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
