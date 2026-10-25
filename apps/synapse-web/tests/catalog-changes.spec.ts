import { describe, expect, it } from 'bun:test';

import { describeChanges, describeWhen } from '../src/features/catalog/catalog-changes';
import { catalogFixture, type CatalogFixture } from './catalog-fixture';

type Catalog = CatalogFixture;

const CHAT = 'novel-forge.chat';

function changed(mutate: (document: Catalog) => void): Catalog {
  const document = catalogFixture();
  mutate(document);
  return document;
}

function budgetAt(document: Catalog, index: number): Catalog['budgets'][number] {
  const budget = document.budgets[index];
  if (!budget) throw new RangeError(`The fixture has no budget ${index}`);
  return budget;
}

const sentences = (after: Catalog | Record<string, unknown>): string[] => describeChanges(catalogFixture(), after).map(change => change.sentence);

describe('describeWhen', () => {
  it('should read selectors as words, and no selectors as everyone else', () => {
    expect(describeWhen({ tier: 'economy', content_mode: 'standard' })).toBe('When tier is economy and content mode is standard');
    expect(describeWhen(undefined)).toBe('Everyone else');
  });
});

describe('describeChanges', () => {
  const premiumRule = { when: { tier: 'premium', content_mode: 'mature' }, model: 'opus-5.5' };

  const cases: [string, (document: Catalog) => void, string[]][] = [
    ['a task default model', document => (document.tasks[CHAT].routes[1] = { model: 'sonnet-5.5' }), ['Novel Forge · Chat — default model: Opus 5.5 → Sonnet 5.5']],
    [
      'an added rule',
      document => document.tasks[CHAT].routes.unshift(premiumRule),
      ['Novel Forge · Chat — rule added: When tier is premium and content mode is mature → Opus 5.5'],
    ],
    ['a removed rule', document => document.tasks[CHAT].routes.shift(), ['Novel Forge · Chat — rule removed: When tier is economy → Llama 3.1']],
    [
      'a rule that picks another model',
      document => (document.tasks[CHAT].routes[0] = { when: { tier: 'economy' }, model: 'sonnet-5.5' }),
      ['Novel Forge · Chat — When tier is economy: Llama 3.1 → Sonnet 5.5'],
    ],
    ['an effort change', document => (document.tasks[CHAT].effort.default = 'high'), ['Novel Forge · Chat — default effort: Medium → High']],
    [
      'a task without a label',
      document => (document.tasks['memoir.receipt-structuring'].routes[0] = { model: 'sonnet-5.5' }),
      ['Memoir · Receipt structuring — default model: Llama 3.1 → Sonnet 5.5'],
    ],
    ['an alias retarget', document => (document.aliases.sonnet.model = 'opus-5.5'), ['Model name Sonnet — points to: Sonnet 5.5 → Opus 5.5']],
    ['a budget limit', document => Object.assign(budgetAt(document, 0), { maxListCostUsd: 80 }), ['Budget for Novel Forge, each user, per hour — cost limit: $50.00 → $80.00']],
    [
      'an added budget',
      document => document.budgets.push({ app: 'novel-forge', per: 'app', window: '1d', maxCalls: 500 }),
      ['Budget for Novel Forge, whole app, per day — added with no cost limit and a call limit of 500'],
    ],
    ['a removed budget, matching the rest by what they are rather than position', document => document.budgets.shift(), ['Budget for Novel Forge, each user, per hour — removed']],
    [
      'a budget window, matched by position',
      document => Object.assign(budgetAt(document, 0), { window: '1d' }),
      ['Budget for Novel Forge, each user, per hour — window: per hour → per day'],
    ],
    ['a model price', document => (document.models['opus-5.5'].pricePerMTok.input = 12), ['Model Opus 5.5 — input price: $15.00 → $12.00 per million tokens']],
    [
      'a model renamed, without reporting every place that names it',
      document => (document.models['opus-5.5'].label = 'Opus 5.5 Max'),
      ['Model Opus 5.5 Max — name: Opus 5.5 → Opus 5.5 Max'],
    ],
    [
      'a provider URL',
      document => (document.providers.ollama.url = 'http://ollama.internal:11434'),
      ['Provider Ollama — address: http://ollama:11434 → http://ollama.internal:11434'],
    ],
    ['a removed credential', document => Reflect.deleteProperty(document.providers.openrouter, 'credential'), ['Provider OpenRouter — API key removed']],
    ['an unknown task field', document => Object.assign(document.tasks[CHAT], { temperature: 0.2 }), ['Novel Forge · Chat — temperature changed']],
    ['an unknown top-level key', document => Object.assign(document, { notes: 'x' }), ['Catalog — notes changed']],
    ['a task the console cannot read any more', document => Object.assign(document.tasks[CHAT], { routes: 'every' }), ['Novel Forge · Chat — other settings changed']],
    [
      'an added task',
      document => Object.assign(document.tasks, { 'memoir.insight': { label: 'Insight', kind: 'chat', requires: [], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] } }),
      ['Memoir · Insight — added'],
    ],
  ];

  for (const [name, mutate, expected] of cases) {
    it(`should describe ${name}`, () => {
      expect(sentences(changed(mutate))).toEqual(expected);
    });
  }

  it('should pair an untouched budget with itself before pairing duplicates by order', () => {
    const tight = { app: 'novel-forge', per: 'subject', window: '1h', maxListCostUsd: 50 };
    const loose = { app: 'novel-forge', per: 'subject', window: '1h', maxListCostUsd: 80 };
    expect(describeChanges({ budgets: [tight, loose] }, { budgets: [loose] }).map(change => change.sentence)).toEqual(['Budget for Novel Forge, each user, per hour — removed']);
  });

  it('should report a budget moved to another app as removed and added, never as a change', () => {
    const changes = describeChanges(
      catalogFixture(),
      changed(document => Object.assign(budgetAt(document, 0), { app: 'memoir' })),
    );
    expect(changes.map(change => change.kind).sort()).toEqual(['added', 'removed']);
  });

  it('should show a price change smaller than a cent', () => {
    const before = changed(document => (document.models['sonnet-5.5'].pricePerMTok.input = 0.15));
    const after = changed(document => (document.models['sonnet-5.5'].pricePerMTok.input = 0.155));
    expect(describeChanges(before, after).map(change => change.sentence)).toEqual(['Model Sonnet 5.5 — input price: $0.15 → $0.155 per million tokens']);
  });

  it('should report a reordered rule list', () => {
    const document = changed(catalog => catalog.tasks[CHAT].routes.unshift(premiumRule));
    const reordered = changed(catalog => catalog.tasks[CHAT].routes.splice(1, 0, premiumRule));
    expect(describeChanges(document, reordered).map(change => change.field)).toEqual(['routes.order']);
  });

  it('should carry the field and both values of a change', () => {
    const [change] = describeChanges(
      catalogFixture(),
      changed(document => (document.models['opus-5.5'].pricePerMTok.input = 12)),
    );
    expect(change).toEqual({
      area: 'model',
      entityKey: 'opus-5.5',
      entityLabel: 'Model Opus 5.5',
      kind: 'changed',
      field: 'pricePerMTok.input',
      before: '$15.00',
      after: '$12.00',
      sentence: 'Model Opus 5.5 — input price: $15.00 → $12.00 per million tokens',
    });
  });

  it('should key a budget by what identifies it', () => {
    const [change] = describeChanges(
      catalogFixture(),
      changed(document => Object.assign(budgetAt(document, 1), { maxCalls: 2000 })),
    );
    expect(change).toMatchObject({ area: 'budget', entityKey: 'memoir/app/30d', field: 'maxCalls', before: '1,000', after: '2,000' });
  });

  it('should find nothing between identical documents, whatever their key order', () => {
    const { budgets, tasks, aliases, models, providers } = catalogFixture();
    expect(describeChanges(catalogFixture(), { budgets, tasks, aliases, models, providers })).toEqual([]);
  });

  it('should read everything as added when nothing is published', () => {
    const changes = describeChanges(null, catalogFixture());
    expect(changes).toHaveLength(12);
    expect(changes.every(change => change.kind === 'added')).toBe(true);
    expect(changes.map(change => change.sentence)).toContain('Novel Forge · Chat — added');
  });

  it('should still count a difference no reader understands', () => {
    expect(describeChanges({ ...catalogFixture(), budgets: 'none' }, { ...catalogFixture(), budgets: 'all' })).toHaveLength(1);
  });
});
