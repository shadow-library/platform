import { describe, expect, it } from 'bun:test';

import { TestEnvironment } from './test-environment';

describe('Server', () => {
  const env = new TestEnvironment('server').init();

  it('should return health check', async () => {
    const response = await env.getRouter().mockRequest().get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('should report readiness of the datastore', async () => {
    const response = await env.getRouter().mockRequest().get('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', dependencies: { postgres: 'up' } });
  });
});
