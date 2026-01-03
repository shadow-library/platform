/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { TestEnvironment } from './test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const testEnv = new TestEnvironment('shadow_pulse_server_test');

describe('Server', () => {
  testEnv.init();

  it('should return health check', async () => {
    const response = await testEnv.getRouter().mockRequest().get('/api/v1/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
