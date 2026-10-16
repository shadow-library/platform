import { type CatalogDocument, type ModelSpec } from '@modules/catalog/catalog.types';

const CHAT_CAPABILITIES: ModelSpec['capabilities'] = {
  tools: true,
  structuredOutput: 'native',
  vision: true,
  reasoning: 'optional',
  efforts: ['low', 'medium', 'high', 'max'],
  promptCache: 'anthropic',
  sampling: false,
};

const DOCUMENT: CatalogDocument = {
  providers: {
    subscription: {
      kind: 'openai',
      flavor: 'subscription-gateway',
      url: 'http://host.docker.internal:7431/v1',
      locality: 'host',
      cost: 'zero',
      features: ['sessions', 'native_web_search'],
      maxInflightPerReplica: 2,
    },
    openrouter: {
      kind: 'openai',
      flavor: 'openrouter',
      url: 'https://openrouter.ai/api/v1',
      apiKeyConfig: 'synapse.provider.openrouter.api-key',
      locality: 'third_party',
      cost: 'metered',
    },
    local: { kind: 'ollama', url: 'http://ollama.synapse:11434', locality: 'in_cluster', cost: 'zero' },
  },
  models: {
    'claude-opus-5.5': {
      label: 'Claude Opus 5.5',
      version: '5.5',
      capabilities: CHAT_CAPABILITIES,
      pricePerMTok: { input: 5, cachedInput: 0.5, output: 25 },
      deployments: [
        { provider: 'subscription', id: 'claude-opus-5.5' },
        { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' },
      ],
    },
    'grok-4.6': {
      label: 'Grok 4.6',
      capabilities: { ...CHAT_CAPABILITIES, reasoning: 'mandatory', efforts: ['xhigh', 'high', 'medium', 'low'], promptCache: 'none', sampling: true },
      pricePerMTok: { input: 2, output: 6 },
      deployments: [{ provider: 'openrouter', id: 'x-ai/grok-4.6' }],
    },
    'llama3.1': {
      label: 'Llama 3.1',
      capabilities: { tools: false, structuredOutput: 'prompt', vision: false, reasoning: 'none', promptCache: 'none', sampling: true },
      pricePerMTok: { input: 0, output: 0 },
      deployments: [{ provider: 'local', id: 'llama3.1' }],
    },
    'qwen3-embedding': {
      label: 'Qwen3 Embedding',
      capabilities: { tools: false, structuredOutput: 'prompt', vision: false, embedding: { dimensions: 1024 }, reasoning: 'none', promptCache: 'none', sampling: false },
      pricePerMTok: { input: 0.01, output: 0 },
      deployments: [{ provider: 'local', id: 'qwen3-embedding:0.6b' }],
    },
    'image-1': {
      label: 'Image One',
      capabilities: { tools: false, structuredOutput: 'prompt', vision: true, imageOutput: true, reasoning: 'none', promptCache: 'none', sampling: false },
      pricePerMTok: { input: 1, output: 4, perImage: 0.04 },
      deployments: [{ provider: 'openrouter', id: 'vendor/image-1' }],
    },
  },
  aliases: {
    opus: { label: 'Opus', model: 'claude-opus-5.5', state: 'active' },
    grok: { label: 'Grok', model: 'grok-4.6', state: 'active', available: { content_mode: ['standard', 'unrestricted'] } },
    llama: { label: 'Llama', model: 'llama3.1', state: 'retired' },
    preview: { label: 'Preview', model: 'grok-4.6', state: 'hidden' },
  },
  tasks: {
    'novel-forge.chat': {
      kind: 'chat',
      requires: ['tools', 'streaming'],
      effort: { default: 'low', min: 'low', max: 'high' },
      dataPolicy: 'any',
      aliases: ['opus', 'grok', 'llama', 'preview'],
      routes: [
        { when: { tier: 'economy' }, model: 'grok-4.6' },
        { when: { tier: 'performant', content_mode: 'standard' }, model: 'claude-opus-5.5' },
        { model: 'claude-opus-5.5' },
      ],
    },
    'novel-forge.embedding': { kind: 'embedding', requires: ['embedding'], dataPolicy: 'any', pinned: true, routes: [{ model: 'qwen3-embedding' }] },
    'novel-forge.image': { kind: 'image', requires: ['image_output'], dataPolicy: 'any', routes: [{ model: 'image-1' }] },
    'memoir.insight': { kind: 'chat', requires: ['structured_output'], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] },
  },
  budgets: [{ app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 50 }],
};

export function catalogDocument(change?: (document: CatalogDocument) => void): CatalogDocument {
  const document = structuredClone(DOCUMENT);
  change?.(document);
  return document;
}
