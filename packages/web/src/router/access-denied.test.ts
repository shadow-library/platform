/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ApiError } from '../lib/api-error';
import { ACCESS_DENIED, isAccessDeniedError, isAccessDeniedSearch, parseAccessDeniedSearch } from './access-denied';

/**
 * Declaring the constants
 */
const problem = (code: string, message: string) => ({ code, type: 'Error', message });

describe('parseAccessDeniedSearch', () => {
  it('should keep every field the provider sent', () => {
    const search = parseAccessDeniedSearch({
      error: ACCESS_DENIED,
      error_description: 'Your trial ended',
      request_id: 'req-42',
      application: 'Pulse',
      client_id: 'pulse',
    });

    expect(search).toEqual({ error: 'access_denied', error_description: 'Your trial ended', request_id: 'req-42', application: 'Pulse', client_id: 'pulse' });
  });

  /** The SAML deny path carries no client, and a hand-edited URL carries anything at all. */
  it('should drop absent, empty and non-string values', () => {
    const search = parseAccessDeniedSearch({ error: ACCESS_DENIED, application: '', client_id: 42, request_id: null });

    expect(search).toEqual({ error: 'access_denied', error_description: undefined, request_id: undefined, application: undefined, client_id: undefined });
  });
});

describe('isAccessDeniedSearch', () => {
  it('should recognise a refusal and reject any other provider error', () => {
    expect(isAccessDeniedSearch({ error: ACCESS_DENIED })).toBe(true);
    expect(isAccessDeniedSearch({ error: 'server_error' })).toBe(false);
    expect(isAccessDeniedSearch({})).toBe(false);
  });
});

describe('isAccessDeniedError', () => {
  /** 401 is "sign in", which the auth gate already bounces; treating 403 the same way would loop. */
  it('should separate a refusal from a missing session', () => {
    expect(isAccessDeniedError(new ApiError(403, problem('IAM_002', 'Permission denied')))).toBe(true);
    expect(isAccessDeniedError(new ApiError(401, problem('IAM_001', 'Unauthenticated')))).toBe(false);
  });

  it('should ignore anything that is not an api error', () => {
    expect(isAccessDeniedError(new Error('network down'))).toBe(false);
    expect(isAccessDeniedError(undefined)).toBe(false);
  });
});
