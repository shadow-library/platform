import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ProjectEventService } from '@modules/events';
import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface StepContext {
  jobId: string;
  chapter: number;
}

interface HarnessOptions {
  onChapter?: (ctx: StepContext) => Promise<void>;
  onExtract?: (ctx: StepContext) => Promise<void>;
  failExtract?: boolean;
}

interface Harness {
  executor: JobExecutor;
  jobService: JobService;
  events: string[];
  cancelledRuns: string[];
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_cancel_executor`;

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

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe.if(pgAvailable)('JobExecutor cancellation', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(chapters = 3): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `cancel-exec-${Date.now()}-${Math.random()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram bible.' });
    for (let n = 1; n <= chapters; n++) await db.insert(schema.chapters).values({ projectId: project.id, number: n, content: `chapter ${n}`, status: 'done' });
    return project.id;
  }

  function buildExecutor(options: HarnessOptions = {}): Harness {
    const events: string[] = [];
    const cancelledRuns: string[] = [];
    const jobService = new JobService({ getPostgresClient: () => db } as never, new ProjectEventService());
    const concurrency = new ConcurrencyController();

    const rebrandService = {
      seedGlossary: async (_projectId: bigint, jobId: string) => {
        events.push(`${jobId}:seed`);
        return { seeded: false, mappings: 0 };
      },
    } as never;

    const recombineService = {
      autoRecombine: async () => null,
    } as never;

    const workflowRunService = {
      cancel: (runId: string) => {
        cancelledRuns.push(runId);
        return true;
      },
      runChapterRebrand: async ({ chapter, jobId }: { chapter: number; jobId: string }) => {
        events.push(`${jobId}:${chapter}`);
        await options.onChapter?.({ jobId, chapter });
        return { runId: randomUUID(), outcome: 'converted', status: 'completed' };
      },
      runSourceExtraction: async ({ chapter, jobId }: { chapter: number; jobId: string }) => {
        events.push(`${jobId}:extract-${chapter}`);
        await options.onExtract?.({ jobId, chapter });
        return { runId: randomUUID(), outcome: options.failExtract ? 'failed' : 'extracted', status: options.failExtract ? 'failed' : 'completed' };
      },
    } as never;

    const executor = new JobExecutor(
      jobService,
      concurrency,
      workflowRunService,
      {} as never,
      { getPostgresClient: () => db } as never,
      rebrandService,
      {} as never,
      {} as never,
      recombineService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { executor, jobService, events, cancelledRuns };
  }

  it('should never start a job cancelled while it queued behind the concurrency lock', async () => {
    const projectId = await seedProject(1);
    let release!: () => void;
    const held = new Promise<void>(resolve => (release = resolve));
    let running!: () => void;
    const started = new Promise<void>(resolve => (running = resolve));
    const harness = buildExecutor({
      onChapter: async () => {
        running();
        await held;
      },
    });

    const holderId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-holder-${projectId}`);
    const queuedId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-queued-${projectId}`);

    const holder = harness.executor.dispatch(holderId);
    await started;
    const queued = harness.executor.dispatch(queuedId);
    await sleep(20);
    const outcome = await harness.jobService.cancel(queuedId, projectId);
    release();
    await Promise.all([holder, queued]);

    expect(outcome).toEqual({ status: 'cancelled', outcome: 'cancelled' });
    expect(harness.events.filter(e => e.startsWith(queuedId))).toEqual([]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, queuedId) });
    expect(job?.status).toBe('cancelled');
    expect(job?.attempts).toBe(0);
  });

  it('should stop at the next chapter boundary, settle cancelled, and keep what already landed', async () => {
    const projectId = await seedProject(3);
    await db.insert(schema.chapterConversions).values({ projectId, chapter: 1, body: 'kept prose', status: 'converted' });
    const harness = buildExecutor({
      onChapter: async ctx => {
        if (ctx.chapter === 2) await harness.jobService.cancel(ctx.jobId, projectId);
      },
    });

    const jobId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}`);
    await harness.executor.dispatch(jobId);

    expect(harness.events).toEqual([`${jobId}:seed`, `${jobId}:2`]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('cancelled');
    expect(job?.lastError).toBeNull();
    const kept = await db.query.chapterConversions.findFirst({ where: eq(schema.chapterConversions.projectId, projectId) });
    expect(kept).toMatchObject({ chapter: 1, body: 'kept prose', status: 'converted' });
    const rebrand = await db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
    expect(rebrand?.status).not.toBe('done');
  });

  it('should cancel the workflow run the job is driving while the step is still in flight', async () => {
    const projectId = await seedProject(1);
    const runId = randomUUID();
    const harness = buildExecutor({
      onChapter: async ctx => {
        await db.insert(schema.workflowRuns).values({ id: runId, projectId, jobId: ctx.jobId, graph: 'chapter-rebrand', target: 'chapter-1' });
        await harness.jobService.cancel(ctx.jobId, projectId);
        for (let i = 0; i < 100 && !harness.cancelledRuns.includes(runId); i++) await sleep(50);
      },
    });

    const jobId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}`);
    await harness.executor.dispatch(jobId);

    expect(harness.cancelledRuns).toContain(runId);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('cancelled');
  });

  it('should settle cancelled rather than failed when the stopped step throws', async () => {
    const projectId = await seedProject(1);
    const harness = buildExecutor({
      failExtract: true,
      onExtract: async ctx => {
        await harness.jobService.cancel(ctx.jobId, projectId);
      },
    });

    const jobId = await harness.jobService.enqueue(projectId, 'extract', `extract-${projectId}`, { chapters: [1] });
    await harness.executor.dispatch(jobId);

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('cancelled');
    expect(job?.lastError).toBeNull();
  });

  it('should not revive a cancel-requested job that crash recovery reset to pending', async () => {
    const projectId = await seedProject(1);
    const harness = buildExecutor();
    const [job] = await db
      .insert(schema.jobs)
      .values({ projectId, kind: 'rebrand', target: `rebrand-${projectId}`, status: 'in_progress', cancelRequestedAt: new Date() })
      .returning({ id: schema.jobs.id });
    if (!job) throw new Error('failed to seed job');

    await harness.jobService.recoverStuck();
    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) }))?.status).toBe('pending');

    await harness.executor.dispatch(job.id);

    expect(harness.events).toEqual([]);
    const settled = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
    expect(settled?.status).toBe('cancelled');
  });

  it('should clear the cancel request when a cancelled job is re-enqueued', async () => {
    const projectId = await seedProject(1);
    const harness = buildExecutor();
    const jobId = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}`);
    await harness.jobService.cancel(jobId, projectId);

    const reEnqueued = await harness.jobService.enqueue(projectId, 'rebrand', `rebrand-${projectId}`);
    expect(reEnqueued).toBe(jobId);
    await harness.executor.dispatch(jobId);

    expect(harness.events).toEqual([`${jobId}:seed`, `${jobId}:1`]);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
  });
});
