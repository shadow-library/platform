import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { type FastifyRouter } from '@shadow-library/fastify';

import { AppModule } from '@server/app.module';

import { HEALTH_PORT } from './env';

describe('Server', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(AppModule);
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  it('should respond to the liveness probe on the private health port', async () => {
    const response = await fetch(`http://localhost:${HEALTH_PORT}/health/live`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('should respond to the readiness probe on the private health port', async () => {
    const response = await fetch(`http://localhost:${HEALTH_PORT}/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('should serve the OpenAPI document in dev', async () => {
    const response = await router.mockRequest().get('/dev/api-docs/openapi.json');
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toBeDefined();
    expect(document.info).toBeDefined();
  });
});
