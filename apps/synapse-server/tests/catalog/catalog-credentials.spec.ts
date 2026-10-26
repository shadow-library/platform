import { describe, expect, it } from 'bun:test';

import { credentialIssues, credentialReferences, normaliseOrigin, urlOrigin } from '@modules/catalog/catalog-credentials';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { catalogDocument } from './catalog.fixtures';

const CREDENTIAL = '00000000-0000-4000-8000-000000000001';

function withCredential(document: CatalogDocument): void {
  delete document.providers.openrouter!.apiKeyConfig;
  document.providers.openrouter!.credential = CREDENTIAL;
}

describe('normaliseOrigin', () => {
  it('should lowercase the host and drop a default port or a trailing slash', () => {
    expect(normaliseOrigin('HTTPS://OpenRouter.AI:443/')).toBe('https://openrouter.ai');
    expect(normaliseOrigin('http://Gateway.Internal:80')).toBe('http://gateway.internal');
    expect(normaliseOrigin('http://host.docker.internal:7431')).toBe('http://host.docker.internal:7431');
  });

  it('should refuse a path, query, fragment, credentials, whitespace or another scheme rather than trim them', () => {
    for (const input of [
      'https://openrouter.ai/api/v1',
      'https://openrouter.ai?x=1',
      'https://openrouter.ai/#top',
      'https://user:pass@openrouter.ai',
      ' https://openrouter.ai',
      'ftp://openrouter.ai',
      'openrouter.ai',
      '',
    ]) {
      expect({ input, origin: normaliseOrigin(input) }).toEqual({ input, origin: undefined });
    }
  });
});

describe('urlOrigin', () => {
  it('should reduce a provider URL to the origin a credential is compared with', () => {
    expect(urlOrigin('https://OPENROUTER.ai:443/api/v1/')).toBe('https://openrouter.ai');
    expect(urlOrigin('mock://local')).toBeUndefined();
    expect(urlOrigin('not a url')).toBeUndefined();
  });
});

describe('credentialReferences', () => {
  it('should map each credential id to the providers naming it', () => {
    const document = catalogDocument(draft => {
      withCredential(draft);
      draft.providers.mirror = { ...draft.providers.openrouter!, url: 'https://openrouter.ai/alt' };
    });
    expect(credentialReferences(document)).toEqual(new Map([[CREDENTIAL, ['openrouter', 'mirror']]]));
  });
});

describe('credentialIssues', () => {
  const live = { id: CREDENTIAL, allowedOrigin: 'https://openrouter.ai', revoked: false };

  it('should accept a live credential bound to the provider origin', () => {
    expect(credentialIssues(catalogDocument(withCredential), [live])).toEqual([]);
  });

  it('should report a missing, a revoked and a misbound credential at the path an admin edits', () => {
    const codes = (states: (typeof live)[], change?: (document: CatalogDocument) => void): string[] =>
      credentialIssues(
        catalogDocument(draft => {
          withCredential(draft);
          change?.(draft);
        }),
        states,
      ).map(issue => `${issue.path}:${issue.code}`);

    expect(codes([])).toEqual(['providers.openrouter.credential:unknown_credential']);
    expect(codes([{ ...live, revoked: true }])).toEqual(['providers.openrouter.credential:credential_revoked']);
    expect(codes([live], draft => (draft.providers.openrouter!.url = 'https://openrouter.ai.evil.test/api/v1'))).toEqual(['providers.openrouter.url:credential_origin_mismatch']);
    expect(codes([live], draft => (draft.providers.openrouter!.url = 'http://openrouter.ai/api/v1'))).toEqual(['providers.openrouter.url:credential_origin_mismatch']);
  });
});

describe('the web search tool credential', () => {
  const live = { id: CREDENTIAL, allowedOrigin: 'https://api.search.brave.com', revoked: false };
  const withSearch = (url: string) => (draft: CatalogDocument) => {
    draft.tools = { webSearch: { kind: 'brave', url, credential: CREDENTIAL, maxSearches: 3, results: 5 } };
  };

  it('should count the tool among the holders of its credential', () => {
    expect(credentialReferences(catalogDocument(withSearch('https://api.search.brave.com')))).toEqual(new Map([[CREDENTIAL, ['tools.webSearch']]]));
  });

  it('should refuse to publish the key to an origin other than the one it is bound to', () => {
    expect(credentialIssues(catalogDocument(withSearch('https://api.search.brave.com')), [live])).toEqual([]);
    expect(credentialIssues(catalogDocument(withSearch('https://search.evil.test')), [live]).map(issue => `${issue.path}:${issue.code}`)).toEqual([
      'tools.webSearch.url:credential_origin_mismatch',
    ]);
  });
});

describe('credentialIssues for the deprecated apiKeyConfig', () => {
  it("should accept the env key at OpenRouter's origin, as the seeded catalog names it", () => {
    expect(credentialIssues(catalogDocument(), [])).toEqual([]);
  });

  it('should refuse to publish the env key to another origin', () => {
    for (const url of ['https://evil.example/api/v1', 'http://openrouter.ai/api/v1']) {
      const document = catalogDocument(draft => (draft.providers.openrouter!.url = url));
      expect(credentialIssues(document, []).map(issue => `${issue.path}:${issue.code}`)).toEqual(['providers.openrouter.url:credential_origin_mismatch']);
    }
  });

  it('should leave an ollama provider alone, which never sends a key', () => {
    const document = catalogDocument(draft => (draft.providers.local!.apiKeyConfig = 'synapse.provider.openrouter.api-key'));
    expect(credentialIssues(document, [])).toEqual([]);
  });
});
