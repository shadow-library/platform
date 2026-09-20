import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';

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

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_export_expense_audits_spec`;

describe('Export assembly of expense audits', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should include expense audits in the export', async () => {
    const account = await app.get(AccountRepository).create('export-expense-audits-sub');
    const expenseId = Bun.randomUUIDv7();
    const changes = [{ field: 'merchant', from: 'a sensitive merchant name', to: 'another merchant' }] as const;
    await db.insert(schema.expenseAudits).values([
      { accountId: account.id, expenseId, action: 'created', changes: [] },
      { accountId: account.id, expenseId, action: 'updated', changes: [...changes] },
    ]);

    const uploads: Uint8Array[] = [];
    const putAt = spyOn(app.get(StorageService), 'putAt').mockImplementation(async (_ref, bytes) => void uploads.push(bytes));
    try {
      await app.get(ExportJobRepository).create(Bun.randomUUIDv7(), account.id);
      await app.get(ExportAssemblerService).sweepAssemble();
    } finally {
      putAt.mockRestore();
    }

    expect(uploads).toHaveLength(1);
    const manifest = JSON.parse(new TextDecoder().decode(uploads[0])) as {
      tables: Record<string, Record<string, unknown>[]>;
      sensitiveFields: { table: string; column: string }[];
    };
    expect(manifest.tables['expense_audits']).toEqual([
      expect.objectContaining({ expenseId, action: 'created', changes: [] }),
      expect.objectContaining({ expenseId, action: 'updated', changes }),
    ]);
    expect(manifest.sensitiveFields).toContainEqual(expect.objectContaining({ table: 'expense_audits', column: 'changes' }));
  });
});
