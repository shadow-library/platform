import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';

import { MemoirAuthModule } from '@modules/auth';
import { ExportModule } from '@modules/export';
import { ReceiptsModule } from '@modules/receipts';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule, ExportModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_export_spec`;

describe('Account export request/status (T-29)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;

  function requestExport(token: string) {
    return router
      .mockRequest()
      .post('/api/v1/account/export')
      .headers({ authorization: `Bearer ${token}` });
  }

  function status(id: string, token: string) {
    return router
      .mockRequest()
      .get(`/api/v1/account/export/${id}`)
      .headers({ authorization: `Bearer ${token}` });
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should enqueue a pending export job', async () => {
    const bearer = await userToken('export-sub-enqueue');
    const response = await requestExport(bearer);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe('pending');
    expect(body.downloadUrl).toBeNull();
  });

  it('should refuse a second export request the same day (export.max-per-day guard)', async () => {
    const bearer = await userToken('export-sub-guard');
    const first = await requestExport(bearer);
    expect(first.statusCode).toBe(201);

    const guarded = await requestExport(bearer);
    expect(guarded.statusCode).toBe(409);
    expect(guarded.json().code).toBe('EXP_002');
  });

  it("should report status for the caller's own job", async () => {
    const bearer = await userToken('export-sub-status');
    const created = (await requestExport(bearer)).json();
    const response = await status(created.id, bearer);
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(created.id);
  });

  it('should 404 an unknown export job id', async () => {
    const bearer = await userToken('export-sub-unknown');
    const response = await status('00000000-0000-7000-8000-000000000000', bearer);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('EXP_001');
  });

  it('should 404 a cross-account status read', async () => {
    const owner = await userToken('export-sub-owner');
    const other = await userToken('export-sub-other');
    const created = (await requestExport(owner)).json();
    const response = await status(created.id, other);
    expect(response.statusCode).toBe(404);
  });
});
