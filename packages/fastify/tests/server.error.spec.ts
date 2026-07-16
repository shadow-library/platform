/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { ServerErrorCode } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ServerErrorCode', () => {
  it('should carry the custom status code', () => {
    expect(ServerErrorCode.S007.status).toBe(429);
    expect(ServerErrorCode.S007.create().status).toBe(429);
  });

  it('should carry the factory default status code', () => {
    expect(ServerErrorCode.S002.status).toBe(404);
    expect(ServerErrorCode.S001.status).toBe(500);
  });

  it('should not mask public keys in the response shape', () => {
    expect(ServerErrorCode.S001.create().toResponse()).toStrictEqual({ code: 'S001', message: 'An unexpected server error occurred while processing the request' });
  });
});
