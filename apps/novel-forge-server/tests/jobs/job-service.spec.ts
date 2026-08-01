/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { JobService } from '@modules/jobs/job.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
    service = new JobService({ getPostgresClient: () => db } as never);
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
