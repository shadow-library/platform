import { describe, expect, it } from 'bun:test';

import { activeVersionOf, issuePathLabel, parseCatalog } from '../src/features/catalog/catalog-document';
import { type CatalogVersionSummaryResponse } from '../src/lib/apis/api-types.gen';

const summary = (version: number, state: CatalogVersionSummaryResponse['state']): CatalogVersionSummaryResponse => ({
  version,
  state,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdByName: null,
});

describe('parseCatalog', () => {
  it('should accept a JSON object', () => {
    expect(parseCatalog('{"aliases":{}}')).toEqual({ ok: true, document: { aliases: {} } });
  });

  it('should report malformed JSON with the parser message', () => {
    const parsed = parseCatalog('{"aliases":');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
  });

  it('should refuse JSON that is not an object', () => {
    for (const source of ['[]', '"text"', 'null', '3']) expect(parseCatalog(source)).toEqual({ ok: false, error: 'The catalog must be a JSON object' });
  });
});

describe('activeVersionOf', () => {
  it('should pick the highest published version whatever the order', () => {
    expect(activeVersionOf([summary(2, 'ARCHIVED'), summary(3, 'PUBLISHED'), summary(5, 'PUBLISHED'), summary(4, 'ARCHIVED')])?.version).toBe(5);
  });

  it('should find none when only archived versions exist', () => {
    expect(activeVersionOf([summary(1, 'ARCHIVED')])).toBeUndefined();
  });
});

describe('issuePathLabel', () => {
  it('should name the whole catalog for an empty path', () => {
    expect(issuePathLabel('')).toBe('(whole catalog)');
    expect(issuePathLabel('tasks.novel-forge.chat.routes[1].model')).toBe('tasks.novel-forge.chat.routes[1].model');
  });
});
