import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { AppErrorCode } from '@server/classes';
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
  failOutputs?: number[];
  plan?: { id: bigint; revision: number; outputChapterCount: number } | null;
  spans?: { ordinal: number; spanKey: string; fromChapter: number; toChapter: number; action: 'keep' | 'condense' | 'merge' | 'drop'; targetChapters: number }[];
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

    const analysisService = {
      analyze: async (_projectId: bigint, opts: { onProgress?: (p: { phase: string; done: number; total: number; current: string }) => Promise<void> }) => {
        events.push('analyze');
        await opts.onProgress?.({ phase: 'analyzing', done: 0, total: 1, current: '1-15' });
        return { analysisId: 1n, chaptersAnalyzed: 40, windowsFailed: 0, findings: 3 };
      },
    } as never;

    const planService = {
      draft: async () => {
        events.push('plan');
        return { plan: { id: 1n, revision: 1 }, spans: [], outputChapterCount: 12 };
      },
      getApproved: async () => {
        events.push('approved');
        if (!options.plan) throw AppErrorCode.REF_005.create();
        return options.plan;
      },
      listSpans: async () => options.spans ?? [],
    } as never;

    const workflowRunService = {
      runChapterReforge: async ({ chapter }: { chapter: number }) => {
        events.push(chapter);
        const failed = options.failChapters?.includes(chapter) ?? false;
        return { runId: randomUUID(), outcome: failed ? 'failed' : 'reforged', status: failed ? 'failed' : 'completed' };
      },
      runSpanTransform: async ({ outputChapter }: { outputChapter: number }) => {
        events.push(`out-${outputChapter}`);
        const failed = options.failOutputs?.includes(outputChapter) ?? false;
        return { runId: randomUUID(), outcome: failed ? 'failed' : 'written', status: failed ? 'failed' : 'completed' };
      },
    } as never;

    const executor = new JobExecutor(
      jobService,
      concurrency,
      workflowRunService,
      {} as never,
      { getPostgresClient: () => db } as never,
      rebrandService,
      analysisService,
      planService,
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

  it('should route the analyze stage to the analysis service without touching the 1:1 chapter path', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor();

    const jobId = await harness.jobService.enqueue(projectId, 'reforge', `reforge-analyze-${projectId}`, { stage: 'analyze' });
    await harness.executor.dispatch(jobId);

    expect(harness.events).toEqual(['recombine', 'analyze']);
    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('done');
    // The analysis never seeds the rename bible and never writes a chapter_reforges row.
    expect(await db.query.chapterReforges.findMany({ where: eq(schema.chapterReforges.projectId, projectId) })).toHaveLength(0);
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

  describe('transform stage', () => {
    const spans = [
      { ordinal: 1, spanKey: 'span-one', fromChapter: 1, toChapter: 2, action: 'keep' as const, targetChapters: 2 },
      { ordinal: 2, spanKey: 'span-two', fromChapter: 3, toChapter: 6, action: 'condense' as const, targetChapters: 1 },
    ];

    async function seedPlan(projectId: bigint): Promise<bigint> {
      const [plan] = await db
        .insert(schema.reforgePlans)
        .values({ projectId, revision: 1, status: 'approved', sourceChapterCount: 6, outputChapterCount: 3, approvedAt: new Date() })
        .returning();
      if (!plan) throw new Error('failed to seed plan');
      await db.insert(schema.reforgePlanSpans).values(spans.map(span => ({ ...span, planId: plan.id })));
      return plan.id;
    }

    async function runTransform(harness: Harness, projectId: bigint, payload: Record<string, unknown> = {}): Promise<string> {
      const jobId = await harness.jobService.enqueue(projectId, 'reforge', `reforge-${projectId}-transform-${Math.random()}`, { stage: 'transform', ...payload });
      await harness.executor.dispatch(jobId);
      return jobId;
    }

    it('should verify the plan, seed the glossary, and write every derived output', async () => {
      const projectId = await seedProject(6);
      const planId = await seedPlan(projectId);
      const harness = buildExecutor({ plan: { id: planId, revision: 1, outputChapterCount: 3 }, spans });

      const jobId = await runTransform(harness, projectId);

      expect(harness.events).toEqual(['approved', 'seed', 'out-1', 'out-2', 'out-3']);
      expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('done');
      expect((await db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) }))?.status).toBe('done');
    });

    it('should skip landed outputs, always retry failed ones, and honour outputs/force/limit', async () => {
      const projectId = await seedProject(6);
      const planId = await seedPlan(projectId);
      await db.insert(schema.reforgeOutputs).values([
        { projectId, planId, outputChapter: 1, spanOrdinal: 1, spanKey: 'span-one', fromChapter: 1, toChapter: 1, indexInSpan: 0, body: 'landed', status: 'written' },
        { projectId, planId, outputChapter: 2, spanOrdinal: 1, spanKey: 'span-one', fromChapter: 2, toChapter: 2, indexInSpan: 1, body: '', status: 'failed' },
      ]);
      const plan = { id: planId, revision: 1, outputChapterCount: 3 };

      const derived = buildExecutor({ plan, spans });
      await runTransform(derived, projectId);
      expect(derived.events).toEqual(['approved', 'seed', 'out-2', 'out-3']);

      const explicit = buildExecutor({ plan, spans });
      await runTransform(explicit, projectId, { outputs: [9, 3, 1] });
      // Output 9 is outside the plan's numbering and 1 already landed, so only 3 runs.
      expect(explicit.events).toEqual(['approved', 'seed', 'out-3']);

      const forced = buildExecutor({ plan, spans });
      await runTransform(forced, projectId, { force: true, limit: 2 });
      expect(forced.events).toEqual(['approved', 'seed', 'out-1', 'out-2']);
    });

    it('should flag a failed output under its own span and keep writing the rest', async () => {
      const projectId = await seedProject(6);
      const planId = await seedPlan(projectId);
      const harness = buildExecutor({ plan: { id: planId, revision: 1, outputChapterCount: 3 }, spans, failOutputs: [3] });

      const jobId = await runTransform(harness, projectId);

      expect(harness.events).toEqual(['approved', 'seed', 'out-1', 'out-2', 'out-3']);
      expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('done');
      const failed = await db.query.reforgeOutputs.findFirst({ where: eq(schema.reforgeOutputs.planId, planId) });
      expect(failed).toMatchObject({ outputChapter: 3, status: 'failed', body: '', spanOrdinal: 2, spanKey: 'span-two', fromChapter: 3, toChapter: 6, indexInSpan: 0 });
    });

    it('should fail the job when no plan is approved', async () => {
      const projectId = await seedProject(6);
      const harness = buildExecutor({ plan: null });

      const jobId = await runTransform(harness, projectId);

      const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
      expect(job?.status).toBe('failed');
      expect(harness.events).toEqual(['approved']);
      expect((await db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) }))?.status).toBe('failed');
    });
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
