import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AccountRepository, MemoirAuthModule } from '@modules/auth';
import { ReceiptRepository, ReceiptsModule, ReceiptSweepService } from '@modules/receipts';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_receipt_sweeps_spec`;

describe('Receipt orphan sweeps (T-26)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let storage: StorageService;
  let sweeps: ReceiptSweepService;
  let receiptRepository: ReceiptRepository;
  let accountId: bigint;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    storage = app.get(StorageService);
    sweeps = app.get(ReceiptSweepService);
    receiptRepository = app.get(ReceiptRepository);

    const account = await app.get(AccountRepository).create('receipt-sweeps-sub');
    accountId = account.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should delete a stale pending_upload row and its object, leaving a fresh one untouched', async () => {
    const staleRef = `r/${accountId}/stale-${Bun.randomUUIDv7()}.jpg`;
    const freshRef = `r/${accountId}/fresh-${Bun.randomUUIDv7()}.jpg`;

    await db.insert(schema.receipts).values([
      { ref: staleRef, accountId, contentType: 'image/jpeg', sizeBytes: 10, status: 'pending_upload', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      { ref: freshRef, accountId, contentType: 'image/jpeg', sizeBytes: 10, status: 'pending_upload' },
    ]);

    await sweeps.sweepPendingUploads();

    const stale = await db.select().from(schema.receipts).where(eq(schema.receipts.ref, staleRef));
    const fresh = await db.select().from(schema.receipts).where(eq(schema.receipts.ref, freshRef));
    expect(stale).toHaveLength(0);
    expect(fresh).toHaveLength(1);
  });

  it('should delete a bucket object with no receipts row, leaving a known object untouched', async () => {
    const knownRef = `r/${accountId}/known-${Bun.randomUUIDv7()}.jpg`;
    const orphanRef = `r/${accountId}/orphan-${Bun.randomUUIDv7()}.jpg`;
    const bytes = new TextEncoder().encode('bytes');

    const knownUpload = storage.getPresignedUploadUrl(knownRef, { contentType: 'image/jpeg' });
    const orphanUpload = storage.getPresignedUploadUrl(orphanRef, { contentType: 'image/jpeg' });
    await fetch(knownUpload, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
    await fetch(orphanUpload, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
    await receiptRepository.create({ ref: knownRef, accountId, contentType: 'image/jpeg', sizeBytes: bytes.length });

    await sweeps.sweepOrphanObjects();

    expect(await storage.exists(knownRef)).toBe(true);
    expect(await storage.exists(orphanRef)).toBe(false);
  });
});
