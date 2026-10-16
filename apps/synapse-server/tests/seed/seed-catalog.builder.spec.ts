import { beforeAll, describe, expect, it } from 'bun:test';

import { LEGACY_SLUG_ALIAS } from '@shadow-library/synapse';

import { buildSeedCatalog } from '@server/database/seed';

import { clampEffort, resolve } from '@modules/catalog/catalog-resolver';
import { checkCatalogDocument } from '@modules/catalog/catalog-validator';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { EXPECTED_EFFORTS, EXPECTED_MODEL_KEYS, EXPECTED_MODELS, GATEWAY_ALLOWLIST, LEGACY_ALIAS_KEYS, SEED_URLS, UNRESTRICTED_SLUGS } from './seed.fixtures';

const STANDARD_SEED = buildSeedCatalog('standard', SEED_URLS);
const LOCAL_SEED = buildSeedCatalog('local-only', SEED_URLS);
const GROUPS = Object.keys(EXPECTED_MODELS.balanced.standard) as (keyof typeof EXPECTED_MODELS.balanced.standard)[];

let rebuilt: CatalogDocument;
let differentUrls: CatalogDocument;

beforeAll(() => {
  const changed = buildSeedCatalog('standard', SEED_URLS);
  changed.models['grok-4.6']!.capabilities.efforts!.pop();
  changed.models['claude-opus-5.5']!.deployments[0]!.id = 'changed';
  changed.aliases.opus!.available!.content_mode!.push('changed');
  changed.tasks['novel-forge.chat']!.routes[0]!.model = 'changed';
  changed.budgets[0]!.maxCalls = 0;
  rebuilt = buildSeedCatalog('standard', SEED_URLS);
  differentUrls = buildSeedCatalog('standard', {
    subscription: 'http://other-subscription.test/v1',
    openrouter: 'http://other-openrouter.test/v1',
    local: 'http://other-local.test',
  });
});

describe('buildSeedCatalog', () => {
  for (const [profile, document] of Object.entries({ standard: STANDARD_SEED, 'local-only': LOCAL_SEED })) {
    it(`should validate the ${profile} profile`, () => {
      expect(checkCatalogDocument(document, null)).toMatchObject({ valid: true });
    });

    it(`should include every registry model, alias, task and budget in the ${profile} profile`, () => {
      expect(Object.keys(document.models).sort()).toEqual([...EXPECTED_MODEL_KEYS].sort());
      expect(Object.keys(document.aliases)).toHaveLength(12);
      expect(Object.keys(document.tasks).sort()).toEqual([...GROUPS.map(group => `novel-forge.${group}`), 'memoir.insight', 'memoir.receipt-structuring'].sort());
      expect(document.budgets).toEqual([{ app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 50 }]);
    });

    it(`should retain every legacy alias and offer all twelve in chat in the ${profile} profile`, () => {
      expect(Object.keys(document.aliases).sort()).toEqual([...LEGACY_ALIAS_KEYS].sort());
      expect(document.tasks['novel-forge.chat']!.aliases).toEqual(LEGACY_ALIAS_KEYS);
      for (const alias of Object.values(document.aliases)) expect(alias).toMatchObject({ state: 'active', showVersion: false });
    });

    it(`should map every legacy slug alias onto a seed alias in the ${profile} profile`, () => {
      for (const alias of Object.values(LEGACY_SLUG_ALIAS)) expect(document.aliases[alias]).toBeDefined();
    });

    it(`should offer unrestricted aliases only for targets in the original allowlist in the ${profile} profile`, () => {
      const expectedAliases = ['grok', 'kimi', 'glm', 'deepseek'];
      for (const alias of Object.values(document.aliases)) {
        const originalDeployments = STANDARD_SEED.models[alias.model]!.deployments;
        const allowlisted = originalDeployments.some(deployment => UNRESTRICTED_SLUGS.includes(deployment.id));
        expect(alias.available).toEqual({ content_mode: allowlisted ? ['standard', 'unrestricted'] : ['standard'] });
      }
      expect(
        Object.entries(document.aliases)
          .filter(([, alias]) => alias.available!.content_mode!.includes('unrestricted'))
          .map(([key]) => key),
      ).toEqual(expectedAliases);
      expect(document.aliases.glm!.model).toBe('glm-5.2');
      expect(document.aliases.glm!.available).toEqual({ content_mode: ['standard', 'unrestricted'] });
    });
  }

  it('should give every subscription deployment a vendor-prefixed id on the gateway allowlist', () => {
    const ids = Object.values(STANDARD_SEED.models).flatMap(model =>
      model.deployments.filter(deployment => deployment.provider === 'subscription').map(deployment => deployment.id),
    );
    expect(ids).toHaveLength(7);
    for (const id of ids) {
      expect(id).toContain('/');
      expect(GATEWAY_ALLOWLIST).toContain(id.split('/')[1]!);
    }
  });

  it('should keep every model entry and task identical across profiles apart from deployments', () => {
    expect(LOCAL_SEED.tasks).toEqual(STANDARD_SEED.tasks);
    expect(LOCAL_SEED.aliases).toEqual(STANDARD_SEED.aliases);
    for (const [key, model] of Object.entries(STANDARD_SEED.models)) expect({ ...LOCAL_SEED.models[key]!, deployments: [] }).toEqual({ ...model, deployments: [] });
  });

  it('should resolve every task in local-only with the needs it has in standard', () => {
    const needs: Record<string, { tools?: boolean; vision?: boolean }> = { review: { tools: true }, vision: { vision: true }, chat: { tools: true } };
    for (const group of GROUPS) {
      const request = { app: 'novel-forge', task: `novel-forge.${group}`, selectors: { tier: 'balanced', content_mode: 'standard' }, needs: needs[group] };
      const local = resolve(LOCAL_SEED, request);
      expect(local.modelKey).toBe(resolve(STANDARD_SEED, request).modelKey);
      expect(local.deployments.length).toBeGreaterThan(0);
    }
  });

  it('should resolve provider URLs and configure the subscription gateway and OpenRouter credential key', () => {
    expect(STANDARD_SEED.providers).toEqual({
      local: { kind: 'ollama', url: SEED_URLS.local, locality: 'host', cost: 'zero' },
      subscription: {
        kind: 'openai',
        flavor: 'subscription-gateway',
        url: SEED_URLS.subscription,
        locality: 'host',
        cost: 'zero',
        features: ['sessions', 'native_web_search'],
        maxInflightPerReplica: 2,
      },
      openrouter: {
        kind: 'openai',
        flavor: 'openrouter',
        url: SEED_URLS.openrouter,
        apiKeyConfig: 'synapse.provider.openrouter.api-key',
        locality: 'third_party',
        cost: 'metered',
      },
    });
    expect(differentUrls.providers.subscription!.url).toBe('http://other-subscription.test/v1');
    expect(differentUrls.providers.openrouter!.url).toBe('http://other-openrouter.test/v1');
    expect(differentUrls.providers.local!.url).toBe('http://other-local.test');
  });

  it('should put only pinned gateway models on subscription before their OpenRouter fallback', () => {
    const gatewayKeys = ['claude-sonnet-5', 'claude-opus-5.5', 'claude-opus-5', 'claude-haiku-4.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'grok-4.6'];
    const actualKeys = Object.entries(STANDARD_SEED.models)
      .filter(([, model]) => model.deployments.some(deployment => deployment.provider === 'subscription'))
      .map(([key]) => key);
    expect(actualKeys.sort()).toEqual(gatewayKeys.sort());
    for (const [key, model] of Object.entries(STANDARD_SEED.models)) {
      if (gatewayKeys.includes(key)) {
        expect(model.deployments[0]).toEqual({ provider: 'subscription', id: model.deployments[1]!.id });
        expect(model.deployments[1]!.provider).toBe('openrouter');
        expect(model.deployments[1]!.id.split('/').at(-1)).toBe(key);
        expect(model.deployments).toHaveLength(2);
      } else if (key === 'llama3.1' || key === 'qwen3-embedding:0.6b') expect(model.deployments).toEqual([{ provider: 'local', id: key }]);
      else {
        expect(model.deployments).toHaveLength(1);
        expect(model.deployments[0]!.provider).toBe('openrouter');
        expect(model.deployments[0]!.id.split('/').at(-1)).toBe(key);
      }
    }
  });

  it('should preserve prices, reasoning efforts and capabilities for representative model families', () => {
    expect(STANDARD_SEED.models['claude-opus-5.5']).toMatchObject({
      label: 'Claude Opus 5.5',
      version: '5.5',
      pricePerMTok: { input: 4, output: 20 },
      capabilities: {
        context: 1000000,
        tools: true,
        structuredOutput: 'native',
        vision: true,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low'],
        promptCache: 'anthropic',
        sampling: true,
      },
    });
    expect(STANDARD_SEED.models['glm-5.3']!.capabilities).toMatchObject({ vision: false, reasoning: 'mandatory', efforts: ['max', 'high', 'low'] });
    expect(STANDARD_SEED.models['qwen3-embedding:0.6b']).toMatchObject({ label: 'Qwen3 Embedding 0.6B', capabilities: { embedding: { dimensions: 1024 } } });
    for (const key of ['grok-imagine-image-2.0', 'gpt-5.4-image-2']) {
      expect(STANDARD_SEED.models[key]).toMatchObject({
        capabilities: { tools: false, structuredOutput: 'prompt', vision: false, imageOutput: true, reasoning: 'none' },
        pricePerMTok: { input: 0, output: 0, perImage: 0.04 },
      });
    }
  });

  it('should preserve the embedding pin and route both memoir tasks to Llama', () => {
    expect(STANDARD_SEED.tasks['novel-forge.embedding']!.pinned).toBe(true);
    for (const task of ['memoir.insight', 'memoir.receipt-structuring']) {
      expect(STANDARD_SEED.tasks[task]).toEqual({ kind: 'chat', requires: ['structured_output'], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] });
    }
  });

  it('should build independent documents without retaining changes between calls or profiles', () => {
    expect(rebuilt).toEqual(STANDARD_SEED);
    expect(LOCAL_SEED.aliases).toEqual(STANDARD_SEED.aliases);
    expect(LOCAL_SEED.tasks).toEqual(STANDARD_SEED.tasks);
    expect(LOCAL_SEED.budgets).toEqual(STANDARD_SEED.budgets);
    expect(LOCAL_SEED.models['grok-4.6']!.capabilities).toEqual(STANDARD_SEED.models['grok-4.6']!.capabilities);
  });

  it('should use only zero-cost local or mock deployments in the local-only profile', () => {
    expect(Object.keys(LOCAL_SEED.providers).sort()).toEqual(['local', 'mock']);
    expect(LOCAL_SEED.providers.mock).toEqual({ kind: 'mock', url: 'http://mock.synapse', locality: 'in_cluster', cost: 'zero' });
    for (const provider of Object.values(LOCAL_SEED.providers)) {
      expect(provider.locality).not.toBe('third_party');
      expect(provider.cost).toBe('zero');
    }
    for (const model of Object.values(LOCAL_SEED.models)) {
      expect(model.deployments.length).toBeGreaterThan(0);
      const expected = model.capabilities.imageOutput
        ? { provider: 'mock', id: 'mock-image' }
        : { provider: 'local', id: model.capabilities.embedding ? 'qwen3-embedding:0.6b' : 'llama3.1' };
      expect(model.deployments).toEqual([expected]);
      for (const deployment of model.deployments) expect(['subscription', 'openrouter']).not.toContain(deployment.provider);
    }
  });
});

describe('resolve seed routes', () => {
  for (const tier of ['economy', 'balanced', 'performant'] as const) {
    for (const contentMode of ['standard', 'unrestricted'] as const) {
      for (const group of GROUPS) {
        it(`should preserve the ${tier}/${contentMode}/${group} model`, () => {
          for (const document of [STANDARD_SEED, LOCAL_SEED]) {
            const resolution = resolve(document, { app: 'novel-forge', task: `novel-forge.${group}`, selectors: { tier, content_mode: contentMode } });
            expect(resolution.modelKey).toBe(EXPECTED_MODELS[tier][contentMode][group]);
          }
        });
      }
    }
  }

  for (const group of GROUPS) {
    it(`should use one balanced/standard default and six fully specified selector routes for ${group}`, () => {
      const task = STANDARD_SEED.tasks[`novel-forge.${group}`]!;
      expect(task.routes).toHaveLength(7);
      expect(task.routes.filter(route => route.when === undefined)).toEqual([{ model: EXPECTED_MODELS.balanced.standard[group] }]);
      for (const route of task.routes.filter(route => route.when !== undefined)) expect(Object.keys(route.when!).sort()).toEqual(['content_mode', 'tier']);
      expect(resolve(STANDARD_SEED, { app: 'novel-forge', task: `novel-forge.${group}` }).modelKey).toBe(EXPECTED_MODELS.balanced.standard[group]);
    });
  }
});

describe('clampEffort seed parity', () => {
  for (const tier of ['economy', 'balanced', 'performant'] as const) {
    for (const contentMode of ['standard', 'unrestricted'] as const) {
      for (const group of GROUPS) {
        it(`should preserve the ${tier}/${contentMode}/${group} reasoning effort`, () => {
          const resolution = resolve(STANDARD_SEED, { app: 'novel-forge', task: `novel-forge.${group}`, selectors: { tier, content_mode: contentMode } });
          expect(clampEffort(resolution.task, resolution.model)).toBe(EXPECTED_EFFORTS[tier][contentMode][group]);
        });
      }
    }
  }
});
