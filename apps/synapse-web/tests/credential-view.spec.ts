import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import {
  credentialErrorMessage,
  credentialsForUrl,
  describeTest,
  destinationLabel,
  destinationName,
  hintLabel,
  inUseMessage,
  issueAdvice,
  keyDestinations,
  keyStatusOf,
  keyVersionLabel,
  normaliseOriginInput,
  originHost,
  originOfUrl,
  revokeDescription,
  revokedLabel,
  sortCredentials,
  suggestedName,
  validateCreateForm,
  validateSecret,
} from '../src/features/credentials/credential-view';
import { type CredentialResponse } from '../src/lib/apis/api-types.gen';

const credential = (overrides: Partial<CredentialResponse>): CredentialResponse => ({
  id: 'id-1',
  name: 'openrouter',
  allowedOrigin: 'https://openrouter.ai',
  hint: 'sk-or-…a1b2',
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdByName: null,
  referencedBy: [],
  ...overrides,
});

const KEY = 'sk-or-v1-0123456789abcdef';

describe('originOfUrl', () => {
  it('should reduce a provider URL to its origin', () => {
    expect(originOfUrl('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai');
    expect(originOfUrl('HTTP://Localhost:11434/v1')).toBe('http://localhost:11434');
    expect(originOfUrl('https://api.example.com:443/v1')).toBe('https://api.example.com');
  });

  it('should find no origin in an empty, malformed or non-http URL', () => {
    for (const url of ['', '   ', 'not a url', 'openrouter.ai/api', 'ftp://files.example.com', 'javascript:alert(1)']) expect(originOfUrl(url)).toBeNull();
  });
});

describe('normaliseOriginInput', () => {
  it('should accept a bare origin and normalise it', () => {
    expect(normaliseOriginInput(' https://OpenRouter.ai ')).toBe('https://openrouter.ai');
    expect(normaliseOriginInput('https://openrouter.ai/')).toBe('https://openrouter.ai');
    expect(normaliseOriginInput('https://example.com:8443')).toBe('https://example.com:8443');
  });

  it('should refuse a path, query, fragment, login, inner whitespace or another scheme', () => {
    for (const input of [
      'https://openrouter.ai/api/v1',
      'https://openrouter.ai?x=1',
      'https://openrouter.ai#top',
      'https://user:pw@openrouter.ai',
      'https://open router.ai',
      'ftp://example.com',
      '',
      'openrouter.ai',
    ])
      expect(normaliseOriginInput(input)).toBeNull();
  });
});

describe('credentialsForUrl', () => {
  const credentials = [
    credential({ id: 'b', name: 'zeta' }),
    credential({ id: 'a', name: 'alpha' }),
    credential({ id: 'r', name: 'old', revokedAt: '2026-10-10T00:00:00.000Z' }),
    credential({ id: 'o', name: 'anthropic', allowedOrigin: 'https://api.anthropic.com' }),
  ];

  it('should offer the live credentials bound to the URL origin, by name', () => {
    expect(credentialsForUrl(credentials, 'https://openrouter.ai/api/v1').map(found => found.id)).toEqual(['a', 'b']);
  });

  it('should offer nothing while the URL is empty or invalid', () => {
    expect(credentialsForUrl(credentials, '')).toEqual([]);
    expect(credentialsForUrl(credentials, 'openrouter')).toEqual([]);
  });

  it('should offer nothing for an origin no credential is bound to', () => {
    expect(credentialsForUrl(credentials, 'https://api.openai.com/v1')).toEqual([]);
  });
});

describe('sortCredentials', () => {
  it('should list live credentials by name before revoked ones, without mutating the input', () => {
    const input = [credential({ id: 'r', name: 'a-old', revokedAt: '2026-10-10T00:00:00.000Z' }), credential({ id: 'z', name: 'zeta' }), credential({ id: 'a', name: 'alpha' })];
    expect(sortCredentials(input).map(found => found.id)).toEqual(['a', 'z', 'r']);
    expect(input[0]?.id).toBe('r');
  });
});

describe('hintLabel, keyVersionLabel and revokedLabel', () => {
  it('should show a hint as given, and say so when the key was too short to show any', () => {
    expect(hintLabel('sk-or-…a1b2')).toBe('sk-or-…a1b2');
    expect(hintLabel('…')).toBe('Hidden');
    expect(hintLabel('')).toBe('Hidden');
  });

  it('should give the key version with the UTC day it was last replaced, if ever', () => {
    expect(keyVersionLabel({ version: 3, rotatedAt: '2026-10-17T23:45:00.000Z' })).toBe('Version 3, last replaced Oct 17, 2026');
    expect(keyVersionLabel({ version: 1 })).toBe('Version 1, never replaced');
  });

  it('should date a revocation and say nothing for an active key', () => {
    expect(revokedLabel({ revokedAt: '2026-10-20T08:00:00.000Z' })).toBe('Since Oct 20, 2026');
    expect(revokedLabel({})).toBeUndefined();
  });
});

describe('validateSecret', () => {
  it('should trim the whitespace a paste brings along', () => {
    expect(validateSecret(`  ${KEY}\n`)).toEqual({ ok: true, secret: KEY });
  });

  it('should refuse a key outside 8 to 4096 characters', () => {
    expect(validateSecret('short').ok).toBe(false);
    expect(validateSecret('x'.repeat(4097)).ok).toBe(false);
    expect(validateSecret('x'.repeat(4096)).ok).toBe(true);
    expect(validateSecret('x'.repeat(8)).ok).toBe(true);
  });

  it('should refuse spaces and non-ASCII characters inside the key', () => {
    expect(validateSecret('sk-or v1 0123456789').ok).toBe(false);
    expect(validateSecret('sk-or-v1-0123456789é').ok).toBe(false);
  });

  it('should never put the key in the error', () => {
    const result = validateSecret('has a space inside');
    expect(JSON.stringify(result)).not.toContain('has a space inside');
  });
});

describe('validateCreateForm', () => {
  it('should send the trimmed name, the normalised origin and the trimmed key', () => {
    expect(validateCreateForm({ name: ' openrouter ', destination: { kind: 'address', input: 'https://OpenRouter.ai/' }, secret: ` ${KEY} ` })).toEqual({
      ok: true,
      body: { name: 'openrouter', allowedOrigin: 'https://openrouter.ai', secret: KEY },
    });
  });

  it('should report every invalid field at once', () => {
    const result = validateCreateForm({ name: 'Open Router', destination: { kind: 'address', input: 'https://openrouter.ai/api' }, secret: 'short' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['allowedOrigin', 'name', 'secret']);
  });

  it('should hold a name to the server pattern', () => {
    const attempt = (name: string) => validateCreateForm({ name, destination: { kind: 'provider', origin: 'https://openrouter.ai' }, secret: KEY }).ok;
    expect(attempt('a')).toBe(true);
    expect(attempt('open.router_v2-1')).toBe(true);
    expect(attempt('a'.repeat(64))).toBe(true);
    expect(attempt('a'.repeat(65))).toBe(false);
    expect(attempt('-leading')).toBe(false);
    expect(attempt('UPPER')).toBe(false);
    expect(attempt('')).toBe(false);
  });
});

describe('validateCreateForm with a provider', () => {
  it("should send the chosen provider's origin as is", () => {
    const result = validateCreateForm({ name: 'openrouter', destination: { kind: 'provider', origin: 'https://openrouter.ai' }, secret: KEY });
    expect(result).toEqual({ ok: true, body: { name: 'openrouter', allowedOrigin: 'https://openrouter.ai', secret: KEY } });
  });

  it('should ask for a provider when none is chosen', () => {
    const result = validateCreateForm({ name: 'openrouter', destination: { kind: 'provider', origin: null }, secret: KEY });
    expect(result).toEqual({ ok: false, errors: { allowedOrigin: 'Choose the provider this key is for.' } });
  });
});

describe('keyDestinations', () => {
  it('should group providers by the origin a key would be bound to', () => {
    const destinations = keyDestinations([
      { key: 'openrouter', kind: 'openai', url: 'https://openrouter.ai/api/v1' },
      { key: 'gateway', kind: 'openai', url: 'http://host.k3d.internal:8090/v1' },
      { key: 'openrouter-free', kind: 'openai', url: 'https://openrouter.ai/api/v1' },
      { key: 'openrouter', kind: 'openai', url: 'https://openrouter.ai/api/v1' },
    ]);
    expect(destinations).toEqual([
      { origin: 'http://host.k3d.internal:8090', providers: ['gateway'] },
      { origin: 'https://openrouter.ai', providers: ['openrouter', 'openrouter-free'] },
    ]);
  });

  it('should leave out providers that never send a key or have no web address', () => {
    expect(
      keyDestinations([
        { key: 'local', kind: 'ollama', url: 'http://ollama:11434' },
        { key: 'broken', kind: 'openai', url: 'not a url' },
        { key: 'ftp', kind: 'openai', url: 'ftp://example.com' },
      ]),
    ).toEqual([]);
  });
});

describe('destination naming', () => {
  const destination = { origin: 'https://openrouter.ai', providers: ['openrouter', 'openrouter-free'] };

  it('should name every provider at the address', () => {
    expect(destinationName(destination)).toBe('OpenRouter, OpenRouter Free');
  });

  it('should suggest the first provider key the name rule accepts', () => {
    expect(suggestedName(destination, new Set())).toBe('openrouter');
    expect(suggestedName({ origin: 'https://x.ai', providers: ['X_AI'] }, new Set())).toBeUndefined();
  });

  it('should suggest a name no stored credential holds', () => {
    expect(suggestedName(destination, new Set(['openrouter']))).toBe('openrouter-free');
    expect(suggestedName(destination, new Set(['openrouter', 'openrouter-free', 'openrouter-2']))).toBe('openrouter-3');
    expect(suggestedName({ origin: 'https://x.ai', providers: ['a'.repeat(64)] }, new Set(['a'.repeat(64)]))).toBeUndefined();
  });

  it('should say which provider a stored key is for', () => {
    expect(destinationLabel('https://openrouter.ai', [destination])).toBe('For OpenRouter, OpenRouter Free, only sent to openrouter.ai');
    expect(destinationLabel('https://api.example.com', [destination])).toBe('Only sent to api.example.com');
    expect(destinationLabel('https://openrouter.ai')).toBe('Only sent to openrouter.ai');
  });
});

describe('describeTest', () => {
  it('should report a pass', () => {
    expect(describeTest({ ok: true })).toEqual({ ok: true, message: 'The provider accepted the key.' });
  });

  it('should explain every failure code the server can return', () => {
    const codes = [
      'revoked_api_key',
      'credential_unreadable',
      'invalid_api_key',
      'unauthorized',
      'rate_limited',
      'not_found',
      'redirected',
      'rejected',
      'upstream_error',
      'timeout',
      'connect',
    ] as const;
    for (const code of codes) {
      const report = describeTest({ ok: false, code });
      expect(report.ok).toBe(false);
      expect(report.message).not.toStartWith('The test failed');
    }
  });

  it('should still report a failure whose code is unknown or missing', () => {
    expect(describeTest({ ok: false, code: 'new_code' as never }).message).toBe('The test failed (new_code).');
    expect(describeTest({ ok: false }).message).toBe('The test failed.');
  });
});

describe('credentialErrorMessage', () => {
  const failure = (status: number, code: string, message = 'server words') => new ApiError(status, { type: 'ERROR', code, message });

  it('should explain the credential conflicts', () => {
    expect(credentialErrorMessage(failure(409, 'CRED_NAME_TAKEN'))).toContain('already exists');
    expect(credentialErrorMessage(failure(409, 'CRED_REVOKED'))).toContain('revoked');
  });

  it('should explain a refused origin or key, which the server reports without saying which', () => {
    expect(credentialErrorMessage(failure(400, 'SYN_INVALID_REQUEST', 'Invalid request'))).toContain('address or the key');
  });

  it('should explain a missing permission or credential', () => {
    expect(credentialErrorMessage(failure(403, 'FORBIDDEN'))).toBe('Your role cannot manage credentials.');
    expect(credentialErrorMessage(failure(404, 'S009'))).toBe('This credential no longer exists.');
  });

  it('should pass any other server message through, and give a fixed one to a non-api error', () => {
    expect(credentialErrorMessage(failure(422, 'VALIDATION_ERROR', 'name is required'))).toBe('name is required');
    expect(credentialErrorMessage(new TypeError('Failed to fetch'))).toBe('The request could not be completed.');
  });
});

describe('inUseMessage and revokeDescription', () => {
  it('should name the providers that still use the credential', () => {
    expect(inUseMessage(['openrouter', 'fallback'])).toContain('openrouter, fallback');
    expect(revokeDescription({ name: 'openrouter', referencedBy: ['openrouter'] })).toContain('still names it for openrouter');
  });

  it('should still explain a conflict that lists no provider', () => {
    expect(inUseMessage([])).toContain('still names it');
  });

  it('should warn that a revoke is permanent and keeps the name, with or without references', () => {
    const description = revokeDescription({ name: 'openrouter', referencedBy: [] });
    expect(description).toContain('cannot be undone');
    expect(description).toContain('name stays reserved');
    expect(description).not.toContain('published catalog');
  });
});

describe('issueAdvice', () => {
  it('should advise on each credential rule and on nothing else', () => {
    for (const code of ['unknown_credential', 'credential_revoked', 'credential_origin_mismatch']) expect(issueAdvice(code)).toBeString();
    expect(issueAdvice('unknown_model')).toBeUndefined();
  });
});

describe('keyStatusOf', () => {
  const live = credential({ id: 'live', name: 'openrouter' });
  const revoked = credential({ id: 'dead', name: 'old', revokedAt: '2026-10-10T00:00:00.000Z' });

  it('should keep the deprecated config key statuses for providers without a credential', () => {
    expect(keyStatusOf({})).toEqual({ kind: 'not_needed' });
    expect(keyStatusOf({ apiKeyConfigured: true })).toEqual({ kind: 'configured' });
    expect(keyStatusOf({ apiKeyConfigured: false })).toEqual({ kind: 'missing' });
  });

  it('should name the credential when the list is known', () => {
    expect(keyStatusOf({ credential: 'live' }, [live, revoked])).toEqual({ kind: 'credential', name: 'openrouter' });
  });

  it('should flag a revoked or unknown credential', () => {
    expect(keyStatusOf({ credential: 'dead' }, [live, revoked])).toEqual({ kind: 'credential_revoked', name: 'old' });
    expect(keyStatusOf({ credential: 'gone' }, [live])).toEqual({ kind: 'credential_unknown' });
  });

  it('should not guess about a credential it cannot list', () => {
    expect(keyStatusOf({ credential: 'live' })).toEqual({ kind: 'credential' });
  });
});

describe('credential messages with prototype codes', () => {
  it('should not read a message off the prototype for a code named like one', () => {
    const unknownCode = JSON.parse('{"ok":false,"code":"constructor"}') as Parameters<typeof describeTest>[0];
    expect(describeTest(unknownCode)).toEqual({ ok: false, message: 'The test failed (constructor).' });
    expect(issueAdvice('__proto__')).toBeUndefined();
    expect(issueAdvice('toString')).toBeUndefined();
    expect(credentialErrorMessage(new ApiError(400, { type: 'CLIENT_ERROR', code: 'constructor', message: 'Server says no' }))).toBe('Server says no');
  });
});

describe('originHost', () => {
  it('should show an https host alone, keeping only a non-default port', () => {
    expect(originHost('https://openrouter.ai')).toBe('openrouter.ai');
    expect(originHost('https://api.example.com:443')).toBe('api.example.com');
    expect(originHost('https://api.example.com:8443')).toBe('api.example.com:8443');
  });

  it('should keep the scheme when the key is not sent over https', () => {
    expect(originHost('http://localhost:11434')).toBe('http://localhost:11434');
    expect(originHost('http://example.com')).toBe('http://example.com');
  });

  it('should fall back to the stored value when it is not a URL', () => {
    expect(originHost('not a url')).toBe('not a url');
  });
});
