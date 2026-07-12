/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

interface Harness {
  executor: JobExecutor;
  jobService: JobService;
  events: (string | number)[];
}

interface HarnessOptions {
  failChapters?: number[];
  stallAcquire?: boolean;
}

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_rebrand_executor`;

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

describe.if(pgAvailable)('JobExecutor.runRebrand', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(scrapeComplete: boolean, chapters = 3): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `rebrand-exec-${Date.now()}-${Math.random()}`, kind: 'source', scrapeComplete })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram bible.' });
    for (let n = 1; n <= chapters; n++) await db.insert(schema.chapters).values({ projectId: project.id, number: n, content: `chapter ${n}`, status: 'done' });
    return project.id;
  }

  // The executor with scripted collaborators: the acquire stub completes the scrape on its first call
  // (or stalls), the run service records chapter order and fails on demand, the seed just logs.
  function buildExecutor(options: HarnessOptions = {}): Harness {
    const events: (string | number)[] = [];
    const jobService = new JobService({ getPostgresClient: () => db } as never);
    const concurrency = new ConcurrencyController();

    const acquireService = {
      ingest: async (projectId: bigint) => {
        events.push('ingest');
        if (options.stallAcquire) return { ingested: 0, complete: false };
        await db.update(schema.projects).set({ scrapeComplete: true }).where(eq(schema.projects.id, projectId));
        return { ingested: 1, complete: true };
      },
    } as never;

    const rebrandService = {
      seedGlossary: async () => {
        events.push('seed');
        return { seeded: false, mappings: 0 };
      },
    } as never;

    const workflowRunService = {
      runChapterRebrand: async ({ chapter }: { chapter: number }) => {
        events.push(chapter);
        const failed = options.failChapters?.includes(chapter) ?? false;
        return { runId: randomUUID(), outcome: failed ? 'failed' : 'converted', status: failed ? 'failed' : 'completed' };
      },
    } as never;

    const executor = new JobExecutor(jobService, concurrency, workflowRunService, {} as never, { getPostgresClient: () => db } as never, acquireService, rebrandService);
    return { executor, jobService, events };
  }

  async function runRebrandJob(harness: Harness, projectId: bigint, payload: Record<string, unknown> = {}): Promise<string> {
    const jobId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}`, payload);
    await harness.executor.dispatch(jobId);
    return jobId;
  }

  it('should run the three phases in order and mark the rebrand done', async () => {
    const projectId = await seedProject(false);
    const harness = buildExecutor();

    const jobId = await runRebrandJob(harness, projectId);

    expect(harness.events).toEqual(['ingest', 'seed', 1, 2, 3]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
    const rebrand = await db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
    expect(rebrand?.status).toBe('done');
  });

  it('should skip converted and attention chapters but always retry failed ones', async () => {
    const projectId = await seedProject(true);
    await db.insert(schema.chapterConversions).values([
      { projectId, chapter: 1, body: 'done prose', status: 'converted' },
      { projectId, chapter: 2, body: '', status: 'failed' },
    ]);
    const harness = buildExecutor();

    await runRebrandJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 2, 3]);
  });

  it('should flag a failed chapter run and keep converting the rest', async () => {
    const projectId = await seedProject(true);
    const harness = buildExecutor({ failChapters: [2] });

    const jobId = await runRebrandJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 1, 2, 3]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');

    const failed = await db.query.chapterConversions.findFirst({ where: eq(schema.chapterConversions.projectId, projectId) });
    expect(failed).toMatchObject({ chapter: 2, status: 'failed', body: '' });
    expect(failed?.issues).toEqual([{ source: 'run', type: 'run_failed', detail: expect.stringContaining('chapter 2 rebrand failed') }]);
  });

  it('should never clobber a previous successful body when a forced re-run fails', async () => {
    const projectId = await seedProject(true, 1);
    await db.insert(schema.chapterConversions).values({ projectId, chapter: 1, body: 'good prose', status: 'converted' });
    const harness = buildExecutor({ failChapters: [1] });

    await runRebrandJob(harness, projectId, { force: true });

    const row = await db.query.chapterConversions.findFirst({ where: eq(schema.chapterConversions.projectId, projectId) });
    expect(row).toMatchObject({ status: 'failed', body: 'good prose', revision: 2 });
  });

  it('should honour explicit chapters, force, and limit', async () => {
    const projectId = await seedProject(true);
    await db.insert(schema.chapterConversions).values({ projectId, chapter: 1, body: 'done', status: 'converted' });

    const explicit = buildExecutor();
    await runRebrandJob(explicit, projectId, { chapters: [3, 1] });
    // Chapter 1 is converted already, so only 3 runs; the requested list is sorted ascending first.
    expect(explicit.events).toEqual(['seed', 3]);

    const forced = buildExecutor();
    const forcedJobId = await forced.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}-forced`, { force: true, limit: 2 });
    await forced.executor.dispatch(forcedJobId);
    expect(forced.events).toEqual(['seed', 1, 2]);
  });

  it('should fail the job and mark the rebrand failed when acquisition stalls', async () => {
    const projectId = await seedProject(false);
    const harness = buildExecutor({ stallAcquire: true });

    const jobId = await runRebrandJob(harness, projectId);

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toContain('acquisition stalled');
    const rebrand = await db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
    expect(rebrand?.status).toBe('failed');
    expect(rebrand?.lastError).toContain('acquisition stalled');
  });
});
