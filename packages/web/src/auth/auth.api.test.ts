/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { createApiClient } from '../lib/api-client';
import { createAuthApi } from './auth.api';

/**
 * Declaring the constants
 */
const api = createAuthApi(createApiClient({ surfaces: { auth: '/api/auth' } }).auth, { keyPrefix: ['app', 'auth'] });

describe('createAuthApi accessQueryOptions', () => {
  it('should key the query under the configured prefix', () => {
    expect(api.keys.access).toEqual(['app', 'auth', 'access']);
    expect(api.accessQueryOptions().queryKey).toEqual(api.keys.access);
  });

  it('should never go stale or retry, because the mode only changes on deploy', () => {
    const options = api.accessQueryOptions();

    expect(options.staleTime).toBe(Infinity);
    expect(options.retry).toBe(false);
  });
});
