import { describe, expect, it } from 'bun:test';

import {
  activeVersionOf,
  credentialIssuesByProvider,
  describeAvailability,
  draftExpectation,
  editorSourceOf,
  EMPTY_CATALOG,
  issuePathLabel,
  parseCatalog,
  readAliases,
  readModels,
  readProviders,
  withAliasModel,
  withoutProviderCredential,
  withProviderCredential,
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

const CREDENTIAL_ID = '6f1c1c9e-3a52-4c63-9d7d-0d3d6a5b0c11';

const PROVIDER_DOCUMENT = {
  ...DOCUMENT,
  providers: {
    openrouter: { kind: 'openrouter', url: 'https://openrouter.ai/api/v1', apiKeyConfig: 'synapse.provider.openrouter.api-key', cost: 'paid' },
    anthropic: { kind: 'anthropic', url: 'https://api.anthropic.com', credential: CREDENTIAL_ID },
    local: { kind: 'ollama', url: 'http://localhost:11434' },
    broken: 'not a provider',
  },
};

describe('readProviders', () => {
  it('should read each provider with the credential or the deprecated config key it names', () => {
    expect(readProviders(PROVIDER_DOCUMENT)).toEqual([
      { key: 'openrouter', kind: 'openrouter', url: 'https://openrouter.ai/api/v1', apiKeyConfig: 'synapse.provider.openrouter.api-key' },
      { key: 'anthropic', kind: 'anthropic', url: 'https://api.anthropic.com', credential: CREDENTIAL_ID },
      { key: 'local', kind: 'ollama', url: 'http://localhost:11434' },
    ]);
  });

  it('should read a provider without a URL as an empty one rather than skip it', () => {
    expect(readProviders({ providers: { bare: { kind: 'openai' } } })).toEqual([{ key: 'bare', kind: 'openai', url: '' }]);
  });

  it('should read no providers from a document without a providers object', () => {
    expect(readProviders({})).toEqual([]);
    expect(readProviders({ providers: [] })).toEqual([]);
  });
});

describe('withProviderCredential', () => {
  it('should drop the deprecated config key when a credential is chosen', () => {
    const result = withProviderCredential(PROVIDER_DOCUMENT, 'openrouter', CREDENTIAL_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const provider = (result.document.providers as Record<string, Record<string, unknown>>).openrouter;
    expect(provider).toEqual({ kind: 'openrouter', url: 'https://openrouter.ai/api/v1', cost: 'paid', credential: CREDENTIAL_ID });
    expect(provider).not.toHaveProperty('apiKeyConfig');
  });

  it('should leave the other providers and the rest of the document untouched', () => {
    const result = withProviderCredential(PROVIDER_DOCUMENT, 'openrouter', CREDENTIAL_ID);
    expect(result.ok && result.document.aliases).toBe(PROVIDER_DOCUMENT.aliases);
    expect(result.ok && (result.document.providers as Record<string, unknown>).anthropic).toBe(PROVIDER_DOCUMENT.providers.anthropic);
  });

  it('should refuse a provider the draft does not have, or one that is not an object', () => {
    expect(withProviderCredential(PROVIDER_DOCUMENT, 'missing', CREDENTIAL_ID)).toEqual({ ok: false, reason: 'The draft has no provider "missing"' });
    expect(withProviderCredential(PROVIDER_DOCUMENT, 'broken', CREDENTIAL_ID)).toEqual({ ok: false, reason: 'The draft\'s provider "broken" is not an object' });
  });
});

describe('withoutProviderCredential', () => {
  it('should remove only the credential', () => {
    const result = withoutProviderCredential(PROVIDER_DOCUMENT, 'anthropic');
    expect(result.ok && (result.document.providers as Record<string, unknown>).anthropic).toEqual({ kind: 'anthropic', url: 'https://api.anthropic.com' });
  });
});

describe('credentialIssuesByProvider', () => {
  const issue = (path: string, code: string) => ({ path, code, message: `${code} at ${path}` });

  it('should group the credential rules by the provider they were found at', () => {
    const grouped = credentialIssuesByProvider([
      issue('providers.anthropic.credential', 'unknown_credential'),
      issue('providers.anthropic.url', 'credential_origin_mismatch'),
      issue('providers.openrouter.credential', 'credential_revoked'),
    ]);
    expect([...grouped.keys()]).toEqual(['anthropic', 'openrouter']);
    expect(grouped.get('anthropic')?.map(found => found.code)).toEqual(['unknown_credential', 'credential_origin_mismatch']);
  });

  it('should keep a provider key that contains dots whole', () => {
    expect([...credentialIssuesByProvider([issue('providers.gpt-4.1.credential', 'credential_revoked')]).keys()]).toEqual(['gpt-4.1']);
  });

  it('should ignore other issues, even at a provider path', () => {
    expect(
      credentialIssuesByProvider([issue('providers.anthropic.url', 'invalid_value'), issue('aliases.opus.model', 'unknown_model'), issue('', 'unknown_credential')]).size,
    ).toBe(0);
  });
});
