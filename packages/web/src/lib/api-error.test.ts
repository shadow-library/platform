/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ApiError, isApiError } from './api-error';

/**
 * Declaring the constants
 */
describe('ApiError', () => {
  it('should fold field problems into the message', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      message: 'Invalid input',
      fields: [
        { field: 'email', msg: 'must be valid' },
        { field: 'name', msg: 'required' },
      ],
    });
    expect(error.message).toBe('Invalid input — email: must be valid; name: required');
  });

  it('should carry status, code, type and retryAfterSeconds', () => {
    const error = new ApiError(429, { code: 'RATE_LIMITED', type: 'RateLimited', message: 'Too many requests' }, 30);
    expect(error.status).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.type).toBe('RateLimited');
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('should expose field problems as a { field: message } map', () => {
    const error = new ApiError(400, { code: 'VALIDATION_ERROR', type: 'ValidationError', message: 'Invalid', fields: [{ field: 'email', msg: 'must be valid' }] });
    expect(error.fieldErrors).toEqual({ email: 'must be valid' });
  });

  it('should return an empty map when there are no field problems', () => {
    const error = new ApiError(500, { code: 'UNKNOWN', type: 'Unknown', message: 'boom' });
    expect(error.fieldErrors).toEqual({});
  });
});

describe('isApiError', () => {
  it('should narrow an ApiError instance', () => {
    const error = new ApiError(404, { code: 'NOT_FOUND', type: 'NotFound', message: 'gone' });
    expect(isApiError(error)).toBe(true);
  });

  it('should narrow a duck-typed ApiError from a second bundle copy', () => {
    const lookalike = { name: 'ApiError', status: 401, code: 'UNAUTHORIZED' };
    expect(isApiError(lookalike)).toBe(true);
  });

  it('should reject a plain Error, a partial shape, and non-objects', () => {
    expect(isApiError(new Error('nope'))).toBe(false);
    expect(isApiError({ name: 'ApiError', status: 401 })).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError('ApiError')).toBe(false);
  });
});
