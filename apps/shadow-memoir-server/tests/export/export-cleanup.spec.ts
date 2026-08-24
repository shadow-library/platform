import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AccountRepository, MemoirAuthModule } from '@modules/auth';
import { ExportAssemblerService, ExportJobRepository, ExportModule } from '@modules/export';
import { ReceiptsModule } from '@modules/receipts';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule, ExportModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_export_cleanup_spec`;

describe('Export cleanup sweep (T-29)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let storage: StorageService;
  let assembler: ExportAssemblerService;
  let exportJobRepository: ExportJobRepository;
  let accountId: bigint;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    storage = app.get(StorageService);
    assembler = app.get(ExportAssemblerService);
    exportJobRepository = app.get(ExportJobRepository);

    const account = await app.get(AccountRepository).create('export-cleanup-sub');
    accountId = account.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should remove an expired manifest object and job row, leaving a fresh one untouched', async () => {
    const expiredId = Bun.randomUUIDv7();
    const freshId = Bun.randomUUIDv7();
    await exportJobRepository.create(expiredId, accountId);
    await exportJobRepository.create(freshId, accountId);

    await assembler.sweepAssemble();

    const expiredKey = `exports/${accountId}/${expiredId}.json`;
    const freshKey = `exports/${accountId}/${freshId}.json`;
    await db
      .update(schema.exportJobs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.exportJobs.id, expiredId));

    await assembler.sweepCleanup();

    const expiredRow = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, expiredId));
    const freshRow = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, freshId));
    expect(expiredRow).toHaveLength(0);
    expect(freshRow).toHaveLength(1);

    expect(await storage.exists(expiredKey)).toBe(false);
    expect(await storage.exists(freshKey)).toBe(true);
  });
});
