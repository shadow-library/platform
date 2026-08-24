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

import { seedFullAccount } from './seed-full-account';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule, ExportModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_export_assembly_spec`;

describe('Export assembly (T-29)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let storage: StorageService;
  let assembler: ExportAssemblerService;
  let exportJobRepository: ExportJobRepository;
  let accountId: bigint;
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    storage = app.get(StorageService);
    assembler = app.get(ExportAssemblerService);
    exportJobRepository = app.get(ExportJobRepository);

    const account = await app.get(AccountRepository).create('export-assembly-sub');
    accountId = account.id;
    await seedFullAccount(db, accountId);

    const jobId = Bun.randomUUIDv7();
    await exportJobRepository.create(jobId, accountId);
    await assembler.sweepAssemble();

    const [job] = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, jobId));
    if (!job || job.status !== 'done' || !job.objectKey) throw new Error(`export job did not complete: ${JSON.stringify(job)}`);

    const object = await storage.read(job.objectKey);
    manifest = JSON.parse(new TextDecoder().decode(object.bytes));
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should carry the schema version and account snapshot', () => {
    expect(manifest['schemaVersion']).toBe(1);
    expect(manifest['accountId']).toBe(String(accountId));
    const account = manifest['account'] as Record<string, unknown>;
    expect(account['identitySub']).toBe('export-assembly-sub');
  });

  it('should contain every registered entity class with at least one row', () => {
    const tables = manifest['tables'] as Record<string, unknown[]>;
    const expectedNonEmpty = [
      'devices',
      'quests',
      'quest_consequences',
      'quest_logs',
      'hero_events',
      'daily_states',
      'reschedule_events',
      'recovery_quests',
      'comeback_events',
      'returner_events',
      'shield_consumptions',
      'achievements_earned',
      'titles_earned',
      'cosmetic_unlocks',
      'quest_streaks',
      'expense_categories',
      'subscriptions',
      'expenses',
      'metrics',
      'metric_entries',
      'progress_counters',
      'journal_entries',
      'meals',
      'meal_presets',
      'weights',
      'side_quests',
      'entitlements',
      'billing_events',
      'receipts',
    ];
    for (const key of expectedNonEmpty) expect(tables[key]?.length ?? 0).toBeGreaterThan(0);
  });

  it('should include the full hero_events stream with sensitive fields verbatim', () => {
    const tables = manifest['tables'] as Record<string, { note: string; xpDelta: number; coinsDelta: number }[]>;
    const [event] = tables['hero_events'] ?? [];
    expect(event?.note).toBe('a hero event note');
    expect(event?.xpDelta).toBe(10);
    expect(event?.coinsDelta).toBe(5);
  });

  it('should include the most-sensitive quest log fields verbatim', () => {
    const tables = manifest['tables'] as Record<string, { reasonNote: string; reflectionText: string }[]>;
    const [log] = tables['quest_logs'] ?? [];
    expect(log?.reasonNote).toBe('a most-sensitive reason note');
    expect(log?.reflectionText).toBe('a most-sensitive reflection');
  });

  it('should include the plaintext journal entry verbatim', () => {
    const tables = manifest['tables'] as Record<string, { text: string }[]>;
    const [entry] = tables['journal_entries'] ?? [];
    expect(entry?.text).toBe('a most-sensitive journal entry');
  });

  it('should include a short-lived presigned download URL for a stored receipt, never embedded bytes', () => {
    const tables = manifest['tables'] as Record<string, { status: string; downloadUrl?: string; bytes?: unknown }[]>;
    const [receipt] = tables['receipts'] ?? [];
    expect(receipt?.status).toBe('stored');
    expect(receipt?.downloadUrl).toContain('X-Amz-Signature');
    expect(receipt?.bytes).toBeUndefined();
  });

  it('should list the sensitivity manifest so the client can label sensitive fields, without redacting any of them', () => {
    const sensitiveFields = manifest['sensitiveFields'] as { table: string; column: string }[];
    expect(sensitiveFields.some(field => field.table === 'quest_logs' && field.column === 'reflection_text')).toBe(true);
  });

  it('should serve the manifest object over a presigned GET against the storage driver', async () => {
    const tables = manifest['tables'] as Record<string, unknown[]>;
    expect(Object.keys(tables).length).toBeGreaterThan(20);

    const [job] = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.accountId, accountId));
    if (!job?.objectKey) throw new Error('export job missing object key');
    const url = storage.getPresignedDownloadUrl(job.objectKey, { expiresSeconds: 60 });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobId: string };
    expect(body.jobId).toBe(job.id);
  });
});
