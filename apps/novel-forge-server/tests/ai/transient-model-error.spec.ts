import { describe, expect, it } from 'bun:test';

import { isTransientModelError, isTransientModelFailure, modelCallFailed, ModelCallTimeoutError } from '@modules/ai/transient-model-error';

function httpError(status: number): Error {
  return Object.assign(new Error(`request failed with ${status}`), { status });
}

describe('isTransientModelError', () => {
  it('should call a timeout, a rate limit, a 5xx and a broken connection transient, wherever the cause sits', () => {
    expect(isTransientModelError(new ModelCallTimeoutError(300_000))).toBe(true);
    expect(isTransientModelError(httpError(502))).toBe(true);
    expect(isTransientModelError(httpError(504))).toBe(true);
    expect(isTransientModelError(Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }))).toBe(true);
    expect(isTransientModelError(httpError(429))).toBe(true);
    expect(isTransientModelError(new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) }))).toBe(true);
  });

  it.each(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPROTO'])('should call the TypeError Bun fetch raises for %s transient, directly or as a cause', code => {
    const failure = Object.assign(new TypeError(`${code}: Unable to connect.`), { code });

    expect(isTransientModelError(failure)).toBe(true);
    expect(isTransientModelError(new Error('network request failed', { cause: failure }))).toBe(true);
  });

  it('should never call a request fetch could not build transient', () => {
    expect(isTransientModelError(Object.assign(new TypeError('fetch() URL is invalid'), { code: 'ERR_INVALID_URL' }))).toBe(false);
  });

  it('should never call a refusal the request itself caused transient', () => {
    expect(isTransientModelError(httpError(401))).toBe(false);
    expect(isTransientModelError(httpError(403))).toBe(false);
    expect(isTransientModelError(httpError(400))).toBe(false);
    expect(isTransientModelError(new Error('maximum context length exceeded'))).toBe(false);
    expect(isTransientModelError(undefined)).toBe(false);
  });
});

describe('modelCallFailed', () => {
  it('should flag the router’s give-up error with whether a later attempt could fare better', () => {
    expect(isTransientModelFailure(modelCallFailed(httpError(503)))).toBe(true);
    expect(isTransientModelFailure(modelCallFailed(httpError(401)))).toBe(false);
    expect(modelCallFailed(httpError(503)).code).toBe('AI_007');
  });
});
