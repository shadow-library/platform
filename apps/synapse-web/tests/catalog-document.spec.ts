import { describe, expect, it } from 'bun:test';

import {
  activeVersionOf,
  describeAvailability,
  draftExpectation,
  editorSourceOf,
  EMPTY_CATALOG,
  issuePathLabel,
  parseCatalog,
  readAliases,
  readModels,
  withAliasModel,
} from '../src/features/catalog/catalog-document';
import { type CatalogVersionSummaryResponse, type DraftResponse } from '../src/lib/apis/api-types.gen';

const DOCUMENT = {
  providers: {},
  models: { 'opus-5': { label: 'Opus', version: '5' }, 'opus-6': { label: 'Opus', version: '6' }, broken: 'not a model' },
  aliases: {
    opus: { label: 'Opus', model: 'opus-5', state: 'active', showVersion: true, available: { tier: ['pro', 'max'] } },
    glm: { label: 'GLM', model: 'glm-5.2', state: 'hidden' },
    odd: { label: 'Odd', model: 'opus-5', state: 'deprecated' },
    junk: 7,
  },
  tasks: {},
  budgets: [],
};

const summary = (version: number, state: CatalogVersionSummaryResponse['state']): CatalogVersionSummaryResponse => ({ version, state, createdAt: '2026-10-01T00:00:00.000Z' });

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

describe('editorSourceOf', () => {
  it('should start from the draft and remember its note and fingerprint', () => {
    const draft = {
      draft: { version: 0, state: 'DRAFT', note: 'retire glm', createdAt: '2026-10-01T00:00:00.000Z', document: { aliases: {} } },
      fingerprint: 'abc',
    } as DraftResponse;
    expect(editorSourceOf(draft, DOCUMENT)).toEqual({ text: '{\n  "aliases": {}\n}\n', note: 'retire glm', fingerprint: 'abc' });
  });

  it('should start from the active document when there is no draft', () => {
    expect(editorSourceOf(null, { models: {} })).toEqual({ text: '{\n  "models": {}\n}\n', note: '', fingerprint: null });
  });

  it('should start from an empty catalog when nothing is published', () => {
    expect(JSON.parse(editorSourceOf(null, null).text)).toEqual(EMPTY_CATALOG);
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

describe('readAliases', () => {
  it('should read well-formed aliases and skip entries that are not one', () => {
    expect(readAliases(DOCUMENT)).toEqual([
      { key: 'opus', label: 'Opus', model: 'opus-5', state: 'active', showVersion: true, available: { tier: ['pro', 'max'] } },
      { key: 'glm', label: 'GLM', model: 'glm-5.2', state: 'hidden', showVersion: false },
    ]);
  });

  it('should read nothing from a document without an aliases object', () => {
    expect(readAliases({ aliases: [] })).toEqual([]);
  });
});

describe('readModels', () => {
  it('should read models and skip entries that are not objects', () => {
    expect(readModels(DOCUMENT)).toEqual([
      { key: 'opus-5', label: 'Opus', version: '5' },
      { key: 'opus-6', label: 'Opus', version: '6' },
    ]);
  });
});

describe('describeAvailability', () => {
  it('should call an alias without rules available everywhere', () => {
    expect(describeAvailability(undefined)).toBe('Everywhere');
  });

  it('should list each selector and its values', () => {
    expect(describeAvailability({ tier: ['pro', 'max'], content_mode: ['standard'] })).toBe('tier: pro, max; content_mode: standard');
  });
});

describe('withAliasModel', () => {
  it('should change only the alias target and keep every other edit', () => {
    const result = withAliasModel(DOCUMENT, 'opus', 'opus-6');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual({ ...DOCUMENT, aliases: { ...DOCUMENT.aliases, opus: { ...DOCUMENT.aliases.opus, model: 'opus-6' } } });
    expect(DOCUMENT.aliases.opus.model).toBe('opus-5');
  });

  it('should refuse an alias the draft does not have', () => {
    expect(withAliasModel(DOCUMENT, 'gpt', 'opus-6')).toEqual({ ok: false, reason: 'The draft has no alias "gpt"' });
  });

  it('should refuse an alias inherited from the object prototype', () => {
    expect(withAliasModel(DOCUMENT, 'toString', 'opus-6').ok).toBe(false);
  });

  it('should refuse a retarget the draft already has', () => {
    expect(withAliasModel(DOCUMENT, 'opus', 'opus-5')).toEqual({ ok: false, reason: 'The draft already targets opus-5' });
  });
});

describe('issuePathLabel', () => {
  it('should name the document itself for an empty path', () => {
    expect(issuePathLabel('')).toBe('(document)');
    expect(issuePathLabel('tasks.novel-forge.chat.routes[1].model')).toBe('tasks.novel-forge.chat.routes[1].model');
  });
});

describe('draftExpectation', () => {
  it('should expect the draft the editor was loaded from, or none when it started from the active version', () => {
    expect(draftExpectation('abc')).toEqual({ expectedFingerprint: 'abc' });
    expect(draftExpectation(null)).toEqual({ expectNoDraft: true });
  });
});
