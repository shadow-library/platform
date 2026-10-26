import { describe, expect, it } from 'bun:test';

import { credentialContext, isUsableSecret, referencingHolders, secretHint } from '@modules/credentials/credential.utils';

describe('secretHint', () => {
  it('should show the first six and last four characters of a long key', () => {
    expect(secretHint(`sk-or-v1-${'0'.repeat(60)}a1b2`)).toBe('sk-or-…a1b2');
  });

  it('should never show more than a quarter of the secret', () => {
    for (let length = 1; length <= 80; length++) {
      const secret = 'x'.repeat(length);
      const shown = secretHint(secret).replace('…', '').length;
      expect({ length, ok: shown * 4 <= length }).toEqual({ length, ok: true });
    }
  });

  it('should show only the last four characters of a short key, and nothing of a very short one', () => {
    expect(secretHint('abcdefghijklmnopqrst')).toBe('…qrst');
    expect(secretHint('abcdefghijklmno')).toBe('…');
  });
});

describe('isUsableSecret', () => {
  it('should accept 8 to 4096 visible ASCII characters', () => {
    expect(isUsableSecret('sk-12345')).toBe(true);
    expect(isUsableSecret('x'.repeat(4096))).toBe(true);
  });

  it('should refuse what an authorization header cannot carry, or a length outside the bounds', () => {
    for (const secret of ['short', 'x'.repeat(4097), 'sk-or SECRET', 'sk-or-SECRET\r\nX: 1', 'sk-or-SECRET-✓']) expect(isUsableSecret(secret)).toBe(false);
  });
});

describe('credentialContext', () => {
  it('should bind the secret to its row and column', () => {
    expect(credentialContext('00000000-0000-4000-8000-000000000001')).toBe('synapse:provider_credentials:00000000-0000-4000-8000-000000000001:secret');
  });
});

describe('referencingHolders', () => {
  it('should find every provider naming the credential, even in a document that would not parse', () => {
    const document = { providers: { a: { credential: 'c-1', kind: 42 }, b: { credential: 'c-2' }, c: { credential: 'c-1' }, d: null } };
    expect(referencingHolders(document, 'c-1')).toEqual(['a', 'c']);
  });

  it('should find nothing in a document without providers', () => {
    expect(referencingHolders(null, 'c-1')).toEqual([]);
    expect(referencingHolders({ providers: [] }, 'c-1')).toEqual([]);
  });

  it('should name the providers and the web search that send the key, so a revocation refuses while either does', () => {
    const document = {
      providers: { openrouter: { credential: 'c-1' }, local: {} },
      tools: { webSearch: { kind: 'brave', url: 'https://api.search.brave.com', credential: 'c-1' } },
    };

    expect(referencingHolders(document, 'c-1')).toEqual(['openrouter', 'tools.webSearch']);
    expect(referencingHolders({ tools: { webSearch: { credential: 'c-1' } } }, 'c-1')).toEqual(['tools.webSearch']);
    expect(referencingHolders({ providers: 'not a record', tools: null }, 'c-1')).toEqual([]);
  });
});
