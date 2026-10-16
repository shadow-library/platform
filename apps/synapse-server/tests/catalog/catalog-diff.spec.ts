import { describe, expect, it } from 'bun:test';

import { changedSections, diffCatalog } from '@modules/catalog/catalog-diff';

import { catalogDocument } from './catalog.fixtures';

describe('diffCatalog', () => {
  it('should find no difference between identical documents', () => {
    expect(diffCatalog(catalogDocument(), catalogDocument())).toEqual({ added: [], removed: [], changed: [] });
  });

  it('should report added, removed and changed paths at their shallowest point', () => {
    const draft = catalogDocument(document => {
      document.tasks['memoir.digest'] = { kind: 'chat', requires: [], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] };
      delete document.aliases.preview;
      document.aliases.opus!.label = 'Opus Max';
      document.models['grok-4.6']!.version = '4.6';
      document.tasks['novel-forge.chat']!.routes[1]!.model = 'grok-4.6';
    });
    expect(diffCatalog(draft, catalogDocument())).toEqual({
      added: ['models.grok-4.6.version', 'tasks.memoir.digest'],
      removed: ['aliases.preview'],
      changed: ['aliases.opus.label', 'tasks.novel-forge.chat.routes[1].model'],
    });
  });

  it('should report array items by index', () => {
    const draft = catalogDocument(document => {
      document.budgets.push({ app: 'memoir', per: 'app', window: '1d', maxCalls: 10 });
      document.tasks['novel-forge.chat']!.aliases!.pop();
    });
    expect(diffCatalog(draft, catalogDocument())).toEqual({ added: ['budgets[1]'], removed: ['tasks.novel-forge.chat.aliases[3]'], changed: [] });
  });

  it('should report every section as added when nothing is published', () => {
    expect(diffCatalog(catalogDocument(), null).added).toEqual(['providers', 'models', 'aliases', 'tasks', 'budgets']);
  });
});

describe('changedSections', () => {
  it('should name only the sections whose content differs', () => {
    const draft = catalogDocument(document => {
      document.tasks['memoir.insight']!.effort = { default: 'low' };
      document.budgets[0]!.maxCalls = 2000;
    });
    expect(changedSections(draft, catalogDocument())).toEqual(new Set(['tasks', 'budgets'] as const));
  });

  it('should flag a provider change so it can require providers:write', () => {
    const draft = catalogDocument(document => (document.providers.openrouter!.url = 'https://openrouter.example/api/v1'));
    expect(changedSections(draft, catalogDocument())).toEqual(new Set(['providers'] as const));
  });

  it('should treat key order as no change', () => {
    const draft = catalogDocument(document => (document.budgets[0] = { maxListCostUsd: 50, maxCalls: 1000, window: '1h', per: 'subject', app: 'novel-forge' }));
    expect(changedSections(draft, catalogDocument()).size).toBe(0);
  });

  it('should compare against empty sections when nothing is published', () => {
    const draft = catalogDocument(document => {
      document.providers = {};
      document.budgets = [];
    });
    expect(changedSections(draft, null)).toEqual(new Set(['models', 'aliases', 'tasks'] as const));
  });

  it('should judge a draft that does not parse, treating an absent section as empty', () => {
    const draft = { providers: catalogDocument().providers, tasks: 'broken' };
    expect(changedSections(draft, catalogDocument())).toEqual(new Set(['models', 'aliases', 'tasks', 'budgets'] as const));
    expect(changedSections('not a document', null)).toEqual(new Set());
  });
});
