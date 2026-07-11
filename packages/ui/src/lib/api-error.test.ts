/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { ApiError } from './api-error';

/**
 * Declaring the constants
 */

describe('ApiError', () => {
  it('is an Error subclass carrying the response metadata', () => {
    const fields = [{ field: 'email', msg: 'required' }];
    const error = new ApiError(422, { code: 'VALIDATION', type: 'ValidationError', message: 'Invalid input', fields });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Invalid input');
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION');
    expect(error.type).toBe('ValidationError');
    expect(error.fields).toBe(fields);
  });

  it('leaves fields undefined when absent', () => {
    const error = new ApiError(500, { code: 'INTERNAL', type: 'ServerError', message: 'Boom' });
    expect(error.fields).toBeUndefined();
  });
});
