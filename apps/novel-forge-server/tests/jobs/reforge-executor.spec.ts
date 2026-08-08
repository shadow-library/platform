import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface Harness {
  executor: JobExecutor;
  jobService: JobService;
  events: (string | number)[];
}

interface HarnessOptions {
  failChapters?: number[];
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_reforge_executor`;

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

describe.if(pgAvailable)('JobExecutor.runReforge', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(chapters = 3): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reforge-exec-${Date.now()}-${Math.random()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.reforges).values({ projectId: project.id, instructions: 'raise the prose' });
    await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram bible.' });
    for (let n = 1; n <= chapters; n++) await db.insert(schema.chapters).values({ projectId: project.id, number: n, content: `chapter ${n}`, status: 'done' });
    return project.id;
  }

  // The executor with scripted collaborators: the run service records chapter order and fails on
  // demand, the shared seed and recombine collaborators just log.
  function buildExecutor(options: HarnessOptions = {}): Harness {
    const events: (string | number)[] = [];
    const jobService = new JobService({ getPostgresClient: () => db } as never);
    const concurrency = new ConcurrencyController();

    const rebrandService = {
      seedGlossary: async () => {
        events.push('seed');
        return { seeded: false, mappings: 0 };
      },
    } as never;

    const recombineService = {
      autoRecombine: async () => {
        events.push('recombine');
        return null;
      },
    } as never;

    const workflowRunService = {
      runChapterReforge: async ({ chapter }: { chapter: number }) => {
        events.push(chapter);
        const failed = options.failChapters?.includes(chapter) ?? false;
        return { runId: randomUUID(), outcome: failed ? 'failed' : 'reforged', status: failed ? 'failed' : 'completed' };
      },
    } as never;

    const executor = new JobExecutor(
      jobService,
      concurrency,
      workflowRunService,
      {} as never,
      { getPostgresClient: () => db } as never,
      rebrandService,
      recombineService,
      {} as never,
      {} as never,
    );
    return { executor, jobService, events };
  }

  async function runReforgeJob(harness: Harness, projectId: bigint, payload: Record<string, unknown> = {}): Promise<string> {
    const jobId = await harness.jobService.enqueue(projectId, 'reforge', `reforge-${projectId}`, payload);
    await harness.executor.dispatch(jobId);
    return jobId;
  }

  it('should run the three phases in order and mark the reforge done', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor();

    const jobId = await runReforgeJob(harness, projectId);

    expect(harness.events).toEqual(['recombine', 'seed', 1, 2, 3]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
    const reforge = await db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    expect(reforge?.status).toBe('done');
  });

  it('should skip reforged and attention chapters but always retry failed ones', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapterReforges).values([
      { projectId, chapter: 1, body: 'done prose', status: 'reforged' },
      { projectId, chapter: 2, body: '', status: 'failed' },
    ]);
    const harness = buildExecutor();

    await runReforgeJob(harness, projectId);

    expect(harness.events).toEqual(['recombine', 'seed', 2, 3]);
  });

  it('should flag a failed chapter run and keep reforging the rest', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor({ failChapters: [2] });

    const jobId = await runReforgeJob(harness, projectId);

    expect(harness.events).toEqual(['recombine', 'seed', 1, 2, 3]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');

    const failed = await db.query.chapterReforges.findFirst({ where: eq(schema.chapterReforges.projectId, projectId) });
    expect(failed).toMatchObject({ chapter: 2, status: 'failed', body: '' });
    expect(failed?.issues).toEqual([{ source: 'run', type: 'run_failed', detail: expect.stringContaining('chapter 2 reforge failed') }]);
  });

  it('should never clobber a previous successful body when a forced re-run fails', async () => {
    const projectId = await seedProject(1);
    await db.insert(schema.chapterReforges).values({ projectId, chapter: 1, body: 'good prose', status: 'reforged' });
    const harness = buildExecutor({ failChapters: [1] });

    await runReforgeJob(harness, projectId, { force: true });

    const row = await db.query.chapterReforges.findFirst({ where: eq(schema.chapterReforges.projectId, projectId) });
    expect(row).toMatchObject({ status: 'failed', body: 'good prose', revision: 2 });
  });

  it('should honour explicit chapters, force, and limit', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapterReforges).values({ projectId, chapter: 1, body: 'done', status: 'reforged' });

    const explicit = buildExecutor();
    await runReforgeJob(explicit, projectId, { chapters: [3, 1] });
    // Chapter 1 is reforged already, so only 3 runs; the requested list is sorted ascending first.
    expect(explicit.events).toEqual(['recombine', 'seed', 3]);

    const forced = buildExecutor();
    const forcedJobId = await forced.jobService.enqueue(projectId, 'reforge', `reforge-${projectId}-forced`, { force: true, limit: 2 });
    await forced.executor.dispatch(forcedJobId);
    expect(forced.events).toEqual(['recombine', 'seed', 1, 2]);
  });

  it('should fail the job and mark the reforge failed when no chapters exist', async () => {
    const projectId = await seedProject(0);
    const harness = buildExecutor();

    const jobId = await runReforgeJob(harness, projectId);

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toContain('has no chapters');
    const reforge = await db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) });
    expect(reforge?.status).toBe('failed');
    expect(reforge?.lastError).toContain('has no chapters');
  });
});
