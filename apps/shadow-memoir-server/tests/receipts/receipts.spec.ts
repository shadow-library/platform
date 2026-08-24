import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';

import { MemoirAuthModule } from '@modules/auth';
import { ReceiptsModule } from '@modules/receipts';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_receipts_spec`;

describe('Receipt storage (T-26)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let bearer: string;
  let otherBearer: string;

  function createReceipt(token = bearer, body: Record<string, unknown> = { contentType: 'image/jpeg', sizeBytes: 1024 }) {
    return router
      .mockRequest()
      .post('/api/v1/receipts')
      .headers({ authorization: `Bearer ${token}` })
      .body(body);
  }

  function confirm(ref: string, token = bearer) {
    return router
      .mockRequest()
      .post(`/api/v1/receipts/${encodeURIComponent(ref)}/confirm`)
      .headers({ authorization: `Bearer ${token}` });
  }

  function download(ref: string, token = bearer) {
    return router
      .mockRequest()
      .get(`/api/v1/receipts/${encodeURIComponent(ref)}/download`)
      .headers({ authorization: `Bearer ${token}` });
  }

  function put(uploadUrl: string, bytes: Uint8Array, contentType = 'image/jpeg'): Promise<Response> {
    return fetch(uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType } });
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    bearer = await userToken('receipts-sub');
    otherBearer = await userToken('receipts-sub-other');
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should reject an unsupported content type', async () => {
    const response = await createReceipt(bearer, { contentType: 'application/pdf', sizeBytes: 1024 });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('RCP_002');
  });

  it('should reject a declared size over the 8 MB schema cap', async () => {
    const response = await createReceipt(bearer, { contentType: 'image/jpeg', sizeBytes: 9_000_000 });
    expect(response.statusCode).toBe(422);
  });

  it('should complete the presign PUT -> confirm -> download round trip against the storage driver', async () => {
    const created = (await createReceipt()).json();
    expect(created.ref).toMatch(/^r\/\d+\/[0-9a-f-]{36}\.jpg$/);
    expect(created.uploadUrl).toContain('X-Amz-Signature');

    const bytes = new TextEncoder().encode('a fake receipt image');
    const putRes = await put(created.uploadUrl, bytes);
    expect(putRes.status).toBe(200);

    const confirmed = (await confirm(created.ref)).json();
    expect(confirmed.status).toBe('stored');

    const reconfirmed = (await confirm(created.ref)).json();
    expect(reconfirmed.status).toBe('stored');

    const issued = (await download(created.ref)).json();
    expect(issued.url).toContain('X-Amz-Signature');

    const fetched = await fetch(issued.url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe('a fake receipt image');
  });

  it('should fail confirm cleanly when nothing was uploaded', async () => {
    const created = (await createReceipt()).json();
    const response = await confirm(created.ref);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('RCP_004');
  });

  it('should 404 a cross-user confirm', async () => {
    const created = (await createReceipt(bearer)).json();
    await put(created.uploadUrl, new TextEncoder().encode('bytes'));
    const response = await confirm(created.ref, otherBearer);
    expect(response.statusCode).toBe(404);
  });

  it('should 404 a cross-user download', async () => {
    const created = (await createReceipt(bearer)).json();
    await put(created.uploadUrl, new TextEncoder().encode('bytes'));
    await confirm(created.ref, bearer);
    const response = await download(created.ref, otherBearer);
    expect(response.statusCode).toBe(404);
  });

  it('should 404 downloading a receipt that was never confirmed', async () => {
    const created = (await createReceipt()).json();
    const response = await download(created.ref);
    expect(response.statusCode).toBe(404);
  });
});
