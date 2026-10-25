import { describe, expect, it } from 'bun:test';

import { readAliases, readBudgets, readModels, readProviders, readTasks, selectorValues, selectorVocabulary, splitTaskKey } from '../src/features/catalog/catalog-readers';
import { catalogFixture, CREDENTIAL_ID } from './catalog-fixture';

describe('splitTaskKey', () => {
  it('should split the app off at the first dot only', () => {
    expect(splitTaskKey('novel-forge.chat.v2')).toEqual({ app: 'novel-forge', name: 'chat.v2' });
  });

  it('should refuse a key without an app or a name', () => {
    for (const key of ['chat', '.chat', 'novel-forge.']) expect(splitTaskKey(key)).toBeNull();
  });
});

describe('readTasks', () => {
  it('should read every field of a well-formed task', () => {
    expect(readTasks(catalogFixture())[0]).toEqual({
      key: 'novel-forge.chat',
      app: 'novel-forge',
      name: 'chat',
      kind: 'chat',
      label: 'Chat',
      description: 'Talk the story through with an assistant.',
      requires: ['tools'],
      effort: { default: 'medium', min: 'low', max: 'high' },
      dataPolicy: 'any',
      aliases: ['opus', 'sonnet'],
      pinned: false,
      routes: [{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'opus-5.5' }],
    });
  });

  it('should default the optional fields of a minimal task', () => {
    expect(readTasks(catalogFixture())[1]).toEqual({
      key: 'memoir.receipt-structuring',
      app: 'memoir',
      name: 'receipt-structuring',
      kind: 'chat',
      requires: [],
      dataPolicy: 'any',
      aliases: [],
      pinned: false,
      routes: [{ model: 'llama3.1' }],
    });
  });

  it('should skip tasks that are not objects, lack an app, or miss their kind, data policy or routes', () => {
    const tasks = {
      junk: 7,
      nodot: { kind: 'chat', dataPolicy: 'any', routes: [] },
      'app.badkind': { kind: 'audio', dataPolicy: 'any', routes: [] },
      'app.nopolicy': { kind: 'chat', routes: [] },
      'app.noroutes': { kind: 'chat', dataPolicy: 'any' },
    };
    expect(readTasks({ tasks })).toEqual([]);
  });

  it('should read an empty selector set as the default route, and drop an effort without a valid default', () => {
    const tasks = {
      'app.task': { kind: 'chat', dataPolicy: 'any', effort: { default: 'extreme', min: 'low' }, requires: ['tools', 'telepathy'], routes: [{ when: {}, model: 'a' }] },
    };
    const [task] = readTasks({ tasks });
    expect(task?.effort).toBeUndefined();
    expect(task?.requires).toEqual(['tools']);
    expect(task?.routes).toEqual([{ model: 'a' }]);
  });

  it('should skip a task with any malformed route rather than read it as a narrower, broader or missing rule', () => {
    const malformed = [{ when: { tier: 3 }, model: 'b' }, { when: { tier: 'economy', plan: null }, model: 'b' }, { when: 'economy', model: 'b' }, { model: 4 }, 'route'];
    for (const route of malformed) {
      const tasks = { 'app.task': { kind: 'chat', dataPolicy: 'any', routes: [route, { model: 'a' }] } };
      expect(readTasks({ tasks })).toEqual([]);
    }
  });
});

describe('readAliases', () => {
  it('should read well-formed aliases and skip entries that are not one', () => {
    const aliases = { ...catalogFixture().aliases, odd: { label: 'Odd', model: 'opus-5.5', state: 'deprecated' }, junk: 7 };
    expect(readAliases({ aliases })).toEqual([
      { key: 'opus', label: 'Opus', model: 'opus-5.5', state: 'active', showVersion: true, available: { tier: ['balanced', 'premium'] } },
      { key: 'sonnet', label: 'Sonnet', model: 'sonnet-5.5', state: 'active', showVersion: false },
    ]);
  });

  it('should skip an alias whose availability is malformed rather than read it as offered more widely', () => {
    for (const available of [{ tier: 'premium' }, { tier: ['premium', 3] }, ['premium']]) {
      expect(readAliases({ aliases: { opus: { label: 'Opus', model: 'opus-5.5', state: 'active', available } } })).toEqual([]);
    }
  });

  it('should read nothing from a document without an aliases object', () => {
    expect(readAliases({ aliases: [] })).toEqual([]);
  });
});

describe('readModels', () => {
  it('should read prices, capabilities and deployments in failover order', () => {
    expect(readModels(catalogFixture())[0]).toEqual({ key: 'opus-5.5', ...catalogFixture().models['opus-5.5'] });
  });

  it('should read a missing capability flag as its most conservative value', () => {
    const models = { bare: { label: 'Bare', capabilities: {}, pricePerMTok: { input: 1, output: 2 }, deployments: [{ provider: 'p', id: 'x' }, { provider: 'q' }] } };
    expect(readModels({ models })).toEqual([
      {
        key: 'bare',
        label: 'Bare',
        capabilities: { tools: false, structuredOutput: 'prompt', vision: false, reasoning: 'none', promptCache: 'none', sampling: false },
        pricePerMTok: { input: 1, output: 2 },
        deployments: [{ provider: 'p', id: 'x' }],
      },
    ]);
  });

  it("should keep a deployment's ignored hosts and drop anything that is not a host", () => {
    const deployments = [
      { provider: 'openrouter', id: 'x', ignoreHosts: ['azure', 7] },
      { provider: 'openrouter', id: 'y', ignoreHosts: [] },
    ];
    const models = { m: { label: 'M', capabilities: {}, pricePerMTok: { input: 1, output: 2 }, deployments } };
    expect(readModels({ models })[0]?.deployments).toEqual([
      { provider: 'openrouter', id: 'x', ignoreHosts: ['azure'] },
      { provider: 'openrouter', id: 'y' },
    ]);
  });

  it('should skip models without both prices, capabilities or deployments', () => {
    const models = {
      noprice: { label: 'A', capabilities: {}, pricePerMTok: { input: 1 }, deployments: [] },
      nocapabilities: { label: 'B', pricePerMTok: { input: 1, output: 1 }, deployments: [] },
      nodeployments: { label: 'C', capabilities: {}, pricePerMTok: { input: 1, output: 1 } },
      junk: 'model',
    };
    expect(readModels({ models })).toEqual([]);
  });
});

describe('readProviders', () => {
  it('should read every field of a provider', () => {
    expect(readProviders(catalogFixture())).toEqual([
      {
        key: 'openrouter',
        kind: 'openai',
        flavor: 'openrouter',
        url: 'https://openrouter.ai/api/v1',
        credential: CREDENTIAL_ID,
        locality: 'third_party',
        cost: 'metered',
        features: ['native_web_search'],
      },
      {
        key: 'subscription',
        kind: 'openai',
        flavor: 'subscription-gateway',
        url: 'http://gateway.host:8080',
        locality: 'host',
        cost: 'zero',
        features: ['sessions', 'native_web_search'],
        maxInflightPerReplica: 4,
      },
      { key: 'ollama', kind: 'ollama', url: 'http://ollama:11434', locality: 'in_cluster', cost: 'zero', features: [] },
    ]);
  });

  it('should read invalid values as not set rather than skip the provider', () => {
    expect(readProviders({ providers: { bare: { kind: 'anthropic', locality: 'moon', features: ['teleport'], apiKeyConfig: 'synapse.key' }, junk: 1 } })).toEqual([
      { key: 'bare', url: '', apiKeyConfig: 'synapse.key', features: [] },
    ]);
  });

  it('should read no providers from a document without a providers object', () => {
    expect(readProviders({})).toEqual([]);
    expect(readProviders({ providers: [] })).toEqual([]);
  });
});

describe('readBudgets', () => {
  it('should keep each budget at its position in the document, counting the malformed ones skipped', () => {
    const budgets = [{ app: 'memoir', per: 'team', window: '1h', maxCalls: 1 }, 'junk', { app: 'memoir', per: 'app', window: '1d', maxCalls: 5, maxListCostUsd: 'ten' }];
    expect(readBudgets({ budgets })).toEqual([{ index: 2, app: 'memoir', per: 'app', window: '1d', maxCalls: 5 }]);
  });

  it('should read nothing when budgets is not an array', () => {
    expect(readBudgets({ budgets: {} })).toEqual([]);
  });
});

describe('selectorVocabulary', () => {
  it('should collect selectors and values from routes and alias availability, sorted and without duplicates', () => {
    const document = catalogFixture();
    const rule = { when: { tier: 'premium', content_mode: 'mature' }, model: 'opus-5.5' };
    document.tasks['novel-forge.chat'].routes.unshift(rule);
    expect(selectorVocabulary(document)).toEqual({ content_mode: ['mature'], tier: ['balanced', 'economy', 'premium'] });
  });

  it('should be empty for a catalog without selectors', () => {
    expect(selectorVocabulary({ tasks: { 'app.task': { kind: 'chat', dataPolicy: 'any', routes: [{ model: 'm' }] } } })).toEqual({});
  });
});

describe('selectorValues', () => {
  it('should list the values used for a selector', () => {
    expect(selectorValues({ tier: ['balanced', 'premium'] }, 'tier')).toEqual(['balanced', 'premium']);
    expect(selectorValues({ tier: ['balanced'] }, 'plan')).toEqual([]);
  });

  it('should find nothing for a selector named like a prototype key', () => {
    for (const selector of ['constructor', '__proto__', 'toString']) expect(selectorValues({ tier: ['balanced'] }, selector)).toEqual([]);
  });

  it('should read a selector really named like a prototype key', () => {
    const vocabulary = selectorVocabulary({
      tasks: { 'novel-forge.chat': { kind: 'chat', dataPolicy: 'any', routes: [JSON.parse('{"when":{"__proto__":"x"},"model":"m"}'), { model: 'm' }] } },
    });
    expect(selectorValues(vocabulary, '__proto__')).toEqual(['x']);
    expect(selectorValues(vocabulary, 'constructor')).toEqual([]);
  });
});
