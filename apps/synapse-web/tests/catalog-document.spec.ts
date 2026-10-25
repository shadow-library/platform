import { describe, expect, it } from 'bun:test';

import {
  activeVersionOf,
  credentialIssuesByProvider,
  draftExpectation,
  editorSourceOf,
  EMPTY_CATALOG,
  issuePathLabel,
  parseCatalog,
} from '../src/features/catalog/catalog-document';
import { type CatalogVersionSummaryResponse, type DraftResponse } from '../src/lib/apis/api-types.gen';

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
    expect(editorSourceOf(draft, { version: 7, document: EMPTY_CATALOG })).toEqual({ text: '{\n  "aliases": {}\n}\n', note: 'retire glm', fingerprint: 'abc' });
  });

  it('should start from the active document when there is no draft, remembering its version', () => {
    expect(editorSourceOf(null, { version: 7, document: { models: {} } })).toEqual({ text: '{\n  "models": {}\n}\n', note: '', fingerprint: null, activeVersion: 7 });
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

describe('issuePathLabel', () => {
  it('should name the whole catalog for an empty path', () => {
    expect(issuePathLabel('')).toBe('(whole catalog)');
    expect(issuePathLabel('tasks.novel-forge.chat.routes[1].model')).toBe('tasks.novel-forge.chat.routes[1].model');
  });
});

describe('draftExpectation', () => {
  it('should expect the draft the editor was loaded from, or none when it started from the active version', () => {
    expect(draftExpectation('abc')).toEqual({ expectedFingerprint: 'abc' });
    expect(draftExpectation(null)).toEqual({ expectNoDraft: true });
  });

  it('should pin a first draft to the active version it was built from', () => {
    expect(draftExpectation(null, 7)).toEqual({ expectNoDraft: true, expectedActiveVersion: 7 });
    expect(draftExpectation('abc', 7)).toEqual({ expectedFingerprint: 'abc' });
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
