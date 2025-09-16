/**
 * Importing npm packages
 */
import { Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/hello-world/app.module';
import { FastifyRouter } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Hello World', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(AppModule).then(app => app.start());
    router = app.get(Router);
  });

  afterAll(() => app.stop());

  it('GET /api/hello', async () => {
    const response = await router.mockRequest().get('/api/hello');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ message: 'Hello, World!' });
  });

  describe('POST /api/hello', () => {
    it('should return a personalized greeting', async () => {
      const response = await router.mockRequest().post('/api/hello').body({ name: 'Alice' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ message: 'Hello, Alice!' });
    });

    it('should return 422 for name too short', async () => {
      const response = await router.mockRequest().post('/api/hello').body({ name: '' });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toStrictEqual({
        code: 'S003',
        type: 'VALIDATION_ERROR',
        message: 'The provided input data is invalid or does not meet validation requirements',
        fields: [{ field: 'body.name', msg: 'must NOT have fewer than 3 characters' }],
      });
    });

    it('should return 422 for name too long', async () => {
      const name = 'A'.repeat(13);
      const response = await router.mockRequest().post('/api/hello').body({ name });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toStrictEqual({
        code: 'S003',
        type: 'VALIDATION_ERROR',
        message: 'The provided input data is invalid or does not meet validation requirements',
        fields: [{ field: 'body.name', msg: 'must NOT have more than 12 characters' }],
      });
    });
  });

  it('PUT /api/error', async () => {
    const response = await router.mockRequest().put('/api/error');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({
      code: 'S008',
      type: 'CONFLICT',
      message: 'Resource conflict as the requested operation conflicts with existing data',
    });
  });

  it('PATCH /api/error-async', async () => {
    const response = await router.mockRequest().patch('/api/error-async');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({
      code: 'S008',
      type: 'CONFLICT',
      message: 'Resource conflict as the requested operation conflicts with existing data',
    });
  });

  it('DELETE /api/custom-error', async () => {
    const response = await router.mockRequest().delete('/api/custom-error');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toStrictEqual({
      code: 'S001',
      type: 'SERVER_ERROR',
      message: 'An unexpected server error occurred while processing the request',
    });
  });

  it('GET /api/not-found', async () => {
    const response = await router.mockRequest().get('/api/not-found');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({
      code: 'S002',
      type: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    });
  });
});
