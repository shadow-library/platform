export const CREDENTIAL_ID = '6f1c1c9e-3a52-4c63-9d7d-0d3d6a5b0c11';

const CATALOG = {
  providers: {
    openrouter: {
      kind: 'openai',
      flavor: 'openrouter',
      url: 'https://openrouter.ai/api/v1',
      credential: CREDENTIAL_ID,
      locality: 'third_party',
      cost: 'metered',
      features: ['native_web_search'],
    },
    subscription: {
      kind: 'openai',
      flavor: 'subscription-gateway',
      url: 'http://gateway.host:8080',
      locality: 'host',
      cost: 'zero',
      features: ['sessions', 'native_web_search'],
      maxInflightPerReplica: 4,
    },
    ollama: { kind: 'ollama', url: 'http://ollama:11434', locality: 'in_cluster', cost: 'zero' },
  },
  models: {
    'opus-5.5': {
      label: 'Opus 5.5',
      version: '5.5',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 200_000,
        reasoning: 'optional',
        efforts: ['low', 'medium', 'high'],
        promptCache: 'anthropic',
        sampling: false,
      },
      pricePerMTok: { input: 15, cachedInput: 1.5, output: 75 },
      deployments: [
        { provider: 'subscription', id: 'opus' },
        { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' },
      ],
    },
    'sonnet-5.5': {
      label: 'Sonnet 5.5',
      capabilities: { tools: true, structuredOutput: 'native', vision: true, reasoning: 'optional', promptCache: 'anthropic', sampling: true },
      pricePerMTok: { input: 3, output: 15 },
      deployments: [{ provider: 'openrouter', id: 'anthropic/claude-sonnet-5.5' }],
    },
    'llama3.1': {
      label: 'Llama 3.1',
      capabilities: { tools: true, structuredOutput: 'prompt', vision: false, reasoning: 'none', promptCache: 'none', sampling: true },
      pricePerMTok: { input: 0, output: 0 },
      deployments: [{ provider: 'ollama', id: 'llama3.1' }],
    },
  },
  aliases: {
    opus: { label: 'Opus', model: 'opus-5.5', state: 'active', showVersion: true, available: { tier: ['balanced', 'premium'] } },
    sonnet: { label: 'Sonnet', model: 'sonnet-5.5', state: 'active' },
  },
  tasks: {
    'novel-forge.chat': {
      label: 'Chat',
      description: 'Talk the story through with an assistant.',
      kind: 'chat',
      requires: ['tools'],
      effort: { default: 'medium', min: 'low', max: 'high' },
      dataPolicy: 'any',
      aliases: ['opus', 'sonnet'],
      routes: [{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'opus-5.5' }],
    },
    'memoir.receipt-structuring': { kind: 'chat', requires: [], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] },
  },
  budgets: [
    { app: 'novel-forge', per: 'subject', window: '1h', maxListCostUsd: 50 },
    { app: 'memoir', per: 'app', window: '30d', maxCalls: 1000 },
  ],
};

export type CatalogFixture = typeof CATALOG;

/** A small but complete catalog; each call returns a fresh copy a test may mutate. */
export function catalogFixture(): CatalogFixture {
  return structuredClone(CATALOG);
}
