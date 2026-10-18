import { Inject, Injectable } from '@shadow-library/app';

import { type ProviderFetch } from '@modules/providers/provider.types';

import { CREDENTIAL_FETCH } from './credential.constants';

export const CREDENTIAL_TEST_CODES = [
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

export type CredentialTestCode = (typeof CREDENTIAL_TEST_CODES)[number];

export type CredentialTestResult = { ok: true } | { ok: false; code: CredentialTestCode };

export const PROBE_TIMEOUT_MS = 10_000;

function codeFor(status: number): CredentialTestCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  if (status >= 300 && status < 400) return 'redirected';
  return 'rejected';
}

/**
 * One cheap authenticated GET. Redirects are not followed, so the key is never carried to a host other than the one its origin names, and
 * only a code comes back: never the provider's body, which may echo the key.
 */
@Injectable()
export class CredentialProber {
  constructor(@Inject(CREDENTIAL_FETCH) private readonly fetcher: ProviderFetch) {}

  async probe(url: string, apiKey: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<CredentialTestResult> {
    let response: Response;
    try {
      response = await this.fetcher(url, { method: 'GET', headers: { authorization: `Bearer ${apiKey}` }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return { ok: false, code: timedOut ? 'timeout' : 'connect' };
    }
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) return { ok: true };
    return { ok: false, code: codeFor(response.status) };
  }
}
