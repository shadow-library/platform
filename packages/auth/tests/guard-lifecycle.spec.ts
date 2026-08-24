/**
 * Importing npm packages
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type Response as MockResponse } from 'light-my-request';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { type JSONSchema } from '@shadow-library/class-schema';
import { Body, ContextService, FastifyModule, HttpController, Post } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Authenticated, AuthModule } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

interface MockRouter {
  mockRequest(options: { method: string; url: string; headers?: Record<string, string>; payload?: string }): Promise<MockResponse>;
}

interface Batch {
  commands: string[];
}

/**
 * Declaring the constants
 *
 * Fastify validates a route's schemas between `preValidation` and `preHandler`. While the guard sat on
 * `preHandler` an anonymous caller could POST a deliberately broken body and read the 422 field errors
 * back, learning the shape of a route it was never allowed to reach. The guard now answers first.
 */
const CLIENT = { id: 'svc-batches', secret: 's3cr3t' };
const AUDIENCE = 'api://batches';
const VALID: Batch = { commands: ['noop'] };
const INVALID = { commands: [], unexpected: true };

const BATCH_SCHEMA: JSONSchema = {
  type: 'object',
  required: ['commands'],
  additionalProperties: false,
  properties: { commands: { type: 'array', minItems: 1, items: { type: 'string' } } },
};

@HttpController('/batches')
class BatchController {
  constructor(private readonly context: ContextService) {}

  @Post()
  @Authenticated()
  submit(@Body(BATCH_SCHEMA) batch: Batch): { sub: string; count: number } {
    return { sub: this.context.getAuthPrincipal().sub, count: batch.commands.length };
  }
}

@Module({ imports: [FastifyModule], controllers: [BatchController] })
class BatchModule {}

describe('guard lifecycle ordering', () => {
  let idp: TestIdP;
  let app: ShadowApplication;
  let router: MockRouter;
  let bearer: string;

  const submit = (body: object, token?: string): Promise<MockResponse> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    return router.mockRequest({ method: 'POST', url: '/batches', headers, payload: JSON.stringify(body) });
  };

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });

    /** `appId` is named because `Config` is process-wide and a sibling spec's `AUTH_APP_ID` would otherwise be inherited here */
    const auth = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE, appId: CLIENT.id, client: CLIENT });

    @Module({ imports: [FastifyModule.forRoot({ imports: [auth, BatchModule] })] })
    class TestAppModule {}

    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as unknown as MockRouter;
    bearer = await idp.issueToken({ sub: 'user-7', audience: AUDIENCE });
  });

  afterAll(async () => {
    await app.stop();
    idp.stop();
  });

  it('should answer an unauthenticated request carrying an invalid body with 401 rather than 422', async () => {
    const response = await submit(INVALID);

    expect(response.statusCode).toBe(401);
    expect(response.json()).not.toHaveProperty('fields');
  });

  it('should answer an unauthenticated request carrying a valid body with 401', async () => {
    expect((await submit(VALID)).statusCode).toBe(401);
  });

  it('should still validate the body once the caller is authenticated', async () => {
    const response = await submit(INVALID, bearer);
    expect(response.statusCode).toBe(422);
  });

  it('should run the handler for an authenticated request with a valid body', async () => {
    const response = await submit(VALID, bearer);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ sub: 'user-7', count: 1 });
  });
});
