import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ProjectEventService } from '@modules/events';
import { JobService } from '@modules/jobs/job.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_job_service`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

describe.if(pgAvailable)('JobService dedup/retry semantics', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: JobService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    service = new JobService({ getPostgresClient: () => db } as never, new ProjectEventService());
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `job-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('dedups an active job: re-enqueue returns the same id without touching it', async () => {
    const projectId = await createProject();

    const first = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    const second = await service.enqueue(projectId, 'generate', '1', { chapters: [1, 2] });

    expect(second).toBe(first);
    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, first) });
    expect(row?.status).toBe('pending');
    // Payload of an in-flight/pending job is left untouched by dedup.
    expect((row?.payload as { chapters: number[] }).chapters).toEqual([1]);
  });

  it('resets a terminal job on re-enqueue so the work runs again', async () => {
    const projectId = await createProject();

    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);
    await service.succeed(jobId);

    let row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('done');

    const again = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    expect(again).toBe(jobId);

    row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(0);
    expect(row?.lastError).toBeNull();
  });

  it('start claims a pending job exactly once', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });

    const firstClaim = await service.start(jobId);
    const secondClaim = await service.start(jobId);

    expect(firstClaim).toBe(true);
    expect(secondClaim).toBe(false);
  });

  it('findPending returns only pending jobs', async () => {
    const projectId = await createProject();
    const pendingId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    const runningId = await service.enqueue(projectId, 'extract', '1', { chapters: [1] });
    await service.start(runningId);

    const pending = await service.findPending();
    const ids = pending.map(j => j.id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(runningId);
  });

  it('recoverStuck resets in_progress jobs back to pending', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);

    await service.recoverStuck();

    const row = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, 'pending')) });
    expect(row?.id).toBe(jobId);
  });
});

describe.if(pgAvailable)('JobService.cancel', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: JobService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(`${dbName}_cancel`);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    service = new JobService({ getPostgresClient: () => db } as never, new ProjectEventService());
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `job-cancel-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('cancels a pending job straight to cancelled and reports the same', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });

    const result = await service.cancel(jobId, projectId);

    expect(result).toEqual({ status: 'cancelled', outcome: 'cancelled' });
    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('cancelled');
    expect(row?.cancelRequestedAt).toBeNull();
  });

  it('a cancelled pending job is never dispatchable — start() fails after cancel()', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });

    await service.cancel(jobId, projectId);
    const claimed = await service.start(jobId);

    expect(claimed).toBe(false);
    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('cancelled');
  });

  it('flags an in_progress job with cancelRequestedAt without touching status', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);

    const result = await service.cancel(jobId, projectId);

    expect(result).toEqual({ status: 'in_progress', outcome: 'stopping' });
    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('in_progress');
    expect(row?.cancelRequestedAt).not.toBeNull();
  });

  it('is idempotent for an in_progress job that already has cancelRequestedAt set', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);

    const first = await service.cancel(jobId, projectId);
    const firstRow = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    const second = await service.cancel(jobId, projectId);
    const secondRow = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });

    expect(first).toEqual({ status: 'in_progress', outcome: 'stopping' });
    expect(second).toEqual({ status: 'in_progress', outcome: 'stopping' });
    expect(secondRow?.cancelRequestedAt).toEqual(firstRow?.cancelRequestedAt ?? null);
  });

  it('reports already_settled without changes for a job that finished as done', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);
    await service.succeed(jobId);

    const result = await service.cancel(jobId, projectId);

    expect(result).toEqual({ status: 'done', outcome: 'already_settled' });
  });

  it('reports already_settled without changes for a job that finished as failed', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.start(jobId);
    await service.fail(jobId, 'boom');

    const result = await service.cancel(jobId, projectId);

    expect(result).toEqual({ status: 'failed', outcome: 'already_settled' });
  });

  it('reports already_settled, idempotently, for a job that already settled as cancelled', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });
    await service.cancel(jobId, projectId);

    const result = await service.cancel(jobId, projectId);

    expect(result).toEqual({ status: 'cancelled', outcome: 'already_settled' });
  });

  it('returns undefined for an unknown job id', async () => {
    const projectId = await createProject();

    const result = await service.cancel('00000000-0000-0000-0000-000000000000', projectId);

    expect(result).toBeUndefined();
  });

  it('returns undefined (404-shaped) for a job that belongs to a different project', async () => {
    const projectId = await createProject();
    const otherProjectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });

    const result = await service.cancel(jobId, otherProjectId);

    expect(result).toBeUndefined();
    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.status).toBe('pending');
  });

  it('races a dispatch: cancelling a pending job concurrently with start() never leaves both effects applied', async () => {
    const projectId = await createProject();
    const jobId = await service.enqueue(projectId, 'generate', '1', { chapters: [1] });

    const [claimed, cancelResult] = await Promise.all([service.start(jobId), service.cancel(jobId, projectId)]);

    const row = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    if (claimed) {
      // start() won the race: the job is live and cancel() could only flag it, never overwrite status.
      expect(row?.status).toBe('in_progress');
      expect(cancelResult).toEqual({ status: 'in_progress', outcome: 'stopping' });
      expect(row?.cancelRequestedAt).not.toBeNull();
    } else {
      // cancel() won the race: the job never dispatched, and start()'s guarded claim correctly refused it.
      expect(row?.status).toBe('cancelled');
      expect(cancelResult).toEqual({ status: 'cancelled', outcome: 'cancelled' });
      expect(row?.cancelRequestedAt).toBeNull();
    }
  });
});
