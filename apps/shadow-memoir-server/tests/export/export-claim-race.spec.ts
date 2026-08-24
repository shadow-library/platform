import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';

import { AccountRepository, MemoirAuthModule } from '@modules/auth';
import { ExportJobRepository, ExportModule } from '@modules/export';
import { ReceiptsModule } from '@modules/receipts';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, ReceiptsModule, ExportModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_export_claim_race_spec`;

/** Simulates two scheduler-sweep replicas (ADR-0002) racing the same claim query; `FOR UPDATE SKIP LOCKED` (`export-job.repository.ts -> claimPending`) must hand a given `pending` job to exactly one of them. */
describe('Export job claim race (T-29)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let exportJobRepository: ExportJobRepository;
  let accountId: bigint;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    exportJobRepository = app.get(ExportJobRepository);

    const account = await app.get(AccountRepository).create('export-claim-race-sub');
    accountId = account.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should let exactly one concurrent claimant win a single pending job', async () => {
    const jobId = Bun.randomUUIDv7();
    await exportJobRepository.create(jobId, accountId);

    const [claimedByA, claimedByB] = await Promise.all([exportJobRepository.claimPending(5), exportJobRepository.claimPending(5)]);

    const claimedIds = [...claimedByA, ...claimedByB].map(job => job.id);
    expect(claimedIds).toEqual([jobId]);
  });

  it('should never claim an already-running or terminal job', async () => {
    const jobId = Bun.randomUUIDv7();
    await exportJobRepository.create(jobId, accountId);
    const [firstClaim] = await exportJobRepository.claimPending(5);
    expect(firstClaim?.id).toBe(jobId);

    const secondClaim = await exportJobRepository.claimPending(5);
    expect(secondClaim.map(job => job.id)).not.toContain(jobId);
  });
});
