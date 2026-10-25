import { describe, expect, it } from 'bun:test';

import { changedSections } from '@modules/catalog/catalog-diff';

import { catalogDocument } from './catalog.fixtures';

describe('changedSections', () => {
  it('should name only the sections whose content differs', () => {
    const next = catalogDocument(document => {
      document.tasks['memoir.insight']!.effort = { default: 'low' };
      document.budgets[0]!.maxCalls = 2000;
    });
    expect(changedSections(next, catalogDocument())).toEqual(new Set(['tasks', 'budgets'] as const));
  });

  it('should flag a provider change so it can require providers:write', () => {
    const next = catalogDocument(document => (document.providers.openrouter!.url = 'https://openrouter.example/api/v1'));
    expect(changedSections(next, catalogDocument())).toEqual(new Set(['providers'] as const));
  });

  it('should treat key order as no change', () => {
    const next = catalogDocument(document => (document.budgets[0] = { maxListCostUsd: 50, maxCalls: 1000, window: '1h', per: 'subject', app: 'novel-forge' }));
    expect(changedSections(next, catalogDocument()).size).toBe(0);
  });

  it('should compare against empty sections when nothing is published', () => {
    const next = catalogDocument(document => {
      document.providers = {};
      document.budgets = [];
    });
    expect(changedSections(next, null)).toEqual(new Set(['models', 'aliases', 'tasks'] as const));
  });

  it('should judge a document that does not parse, treating an absent section as empty', () => {
    const next = { providers: catalogDocument().providers, tasks: 'broken' };
    expect(changedSections(next, catalogDocument())).toEqual(new Set(['models', 'aliases', 'tasks', 'budgets'] as const));
    expect(changedSections('not a document', null)).toEqual(new Set());
  });
});
