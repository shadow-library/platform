/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ApiError } from './api-error';
import { type ApiResult, call } from './api-result';

/**
 * Declaring the constants
 */
describe('call', () => {
  it('should return the typed body on an ok result', async () => {
    const result: ApiResult<{ id: string }> = { ok: true, data: { id: 'abc' } };
    expect(await call(Promise.resolve(result))).toEqual({ id: 'abc' });
  });

  it('should rehydrate a failure envelope into an ApiError carrying its status and retry hint', async () => {
    const result: ApiResult<unknown> = { ok: false, failure: { status: 429, code: 'RATE_LIMITED', type: 'RateLimited', message: 'slow down', retryAfterSeconds: 12 } };

    let caught: unknown;
    try {
      await call(Promise.resolve(result));
    } catch (error) {
      caught = error;
    }

    expect(ApiError.isApiError(caught)).toBe(true);
    if (ApiError.isApiError(caught)) {
      expect(caught.status).toBe(429);
      expect(caught.retryAfterSeconds).toBe(12);
    }
  });
});
