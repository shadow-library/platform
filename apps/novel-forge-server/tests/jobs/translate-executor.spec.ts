import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ProjectEventService } from '@modules/events';
import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { type PrimaryDatabase, type Translation } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface Harness {
  executor: JobExecutor;
  jobService: JobService;
  events: (string | number)[];
}

interface HarnessOptions {
  failChapters?: number[];
  seed?: { seeded: boolean; suggestions: number };
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_translate_executor`;

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

describe.if(pgAvailable)('JobExecutor.runTranslate', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(chapters = 3, settings?: Translation.Settings): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `translate-exec-${Date.now()}-${Math.random()}`, kind: 'translation', originalLanguage: 'zh' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.translations).values({ projectId: project.id, settings });
    for (let n = 1; n <= chapters; n++) {
      await db.insert(schema.chapters).values({ projectId: project.id, number: n, originalTitle: `第${n}章`, originalContent: `原文 ${n}`, status: 'done' });
    }
    return project.id;
  }

  function addOriginal(projectId: bigint, number: number): Promise<unknown> {
    return db.insert(schema.chapters).values({ projectId, number, originalTitle: `第${number}章`, originalContent: `原文 ${number}`, status: 'done' });
  }

  function translationRow(projectId: bigint, chapter: number): Promise<Translation.ChapterTranslation | undefined> {
    return db.query.chapterTranslations.findFirst({ where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, chapter)) });
  }

  // The executor with scripted collaborators: the run service records chapter order and fails on
  // demand, the translation service logs its seed and reads the real config row back.
  function buildExecutor(options: HarnessOptions = {}): Harness {
    const events: (string | number)[] = [];
    const jobService = new JobService({ getPostgresClient: () => db } as never, new ProjectEventService());
    const concurrency = new ConcurrencyController();

    const translationService = {
      getOrCreate: async (projectId: bigint) => {
        const row = await db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
        if (!row) throw new Error(`no translation row for project ${projectId}`);
        return row;
      },
      seedGlossary: async () => {
        events.push('seed');
        return options.seed ?? { seeded: false, suggestions: 0 };
      },
    } as never;

    const workflowRunService = {
      runChapterTranslation: async ({ projectId, chapter }: { projectId: bigint; chapter: number }) => {
        events.push(chapter);
        const runId = randomUUID();
        if (options.failChapters?.includes(chapter)) return { runId, outcome: 'failed', status: 'failed' };
        // The real graph persists the row; without it the next run's data-derived selection would
        // re-pick every chapter this one just translated.
        await db
          .insert(schema.chapterTranslations)
          .values({ projectId, chapter, body: `translated ${chapter}`, status: 'translated', runId })
          .onConflictDoUpdate({
            target: [schema.chapterTranslations.projectId, schema.chapterTranslations.chapter],
            set: { body: `translated ${chapter}`, status: 'translated', runId, glossaryStale: false, sourceStale: false },
          });
        return { runId, outcome: 'translated', status: 'completed' };
      },
    } as never;

    const executor = new JobExecutor(
      jobService,
      concurrency,
      workflowRunService,
      {} as never,
      { getPostgresClient: () => db } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      translationService,
    );
    return { executor, jobService, events };
  }

  async function runTranslateJob(harness: Harness, projectId: bigint, payload: Record<string, unknown> = {}): Promise<string> {
    const jobId = await harness.jobService.enqueue(projectId, 'translate', `translate-${projectId}-${randomUUID()}`, payload);
    await harness.executor.dispatch(jobId);
    return jobId;
  }

  it('should seed before translating and walk the chapters ascending', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor();

    const jobId = await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 1, 2, 3]);
    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('done');
    const translation = await db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
    expect(translation?.phase).toBe('done');
  });

  it('should pause for term review when the seed produced suggestions', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor({ seed: { seeded: true, suggestions: 4 } });

    const jobId = await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed']);
    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
    expect(job?.progress).toMatchObject({ current: 'awaiting term review', phase: 'review' });
    const translation = await db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
    expect(translation?.phase).toBe('review');
  });

  it('should not pause when pauseAfterSeed is off', async () => {
    const projectId = await seedProject(3, { pauseAfterSeed: false });
    const harness = buildExecutor({ seed: { seeded: true, suggestions: 4 } });

    await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 1, 2, 3]);
  });

  it('should not pause when the seed produced no suggestions', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor({ seed: { seeded: true, suggestions: 0 } });

    await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 1, 2, 3]);
  });

  it('should continue into translation on the run after a pause', async () => {
    const projectId = await seedProject();
    const paused = buildExecutor({ seed: { seeded: true, suggestions: 4 } });
    await runTranslateJob(paused, projectId);
    expect(paused.events).toEqual(['seed']);

    const resumed = buildExecutor({ seed: { seeded: false, suggestions: 0 } });
    await runTranslateJob(resumed, projectId);

    expect(resumed.events).toEqual(['seed', 1, 2, 3]);
  });

  it('should skip translated and attention chapters but always retry failed ones', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapterTranslations).values([
      { projectId, chapter: 1, body: 'done prose', status: 'translated' },
      { projectId, chapter: 2, body: '', status: 'failed' },
    ]);
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 2, 3]);
  });

  it('should re-translate a translated chapter under force', async () => {
    const projectId = await seedProject(2);
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'done prose', status: 'translated' });
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { force: true });

    expect(harness.events).toEqual(['seed', 1, 2]);
  });

  it('should never target a finalized chapter even under force', async () => {
    const projectId = await seedProject(2);
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'canon prose', status: 'finalized' });
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { chapters: [1, 2], force: true });

    expect(harness.events).toEqual(['seed', 2]);
  });

  it('should sort and dedupe an explicit chapter list and re-run an already-translated chapter without force', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'done prose', status: 'translated' });
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { chapters: [3, 1, 3] });

    expect(harness.events).toEqual(['seed', 1, 3]);
  });

  it('should select only stale rows when payload.stale is set', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapterTranslations).values([
      { projectId, chapter: 1, body: 'a', status: 'translated', glossaryStale: true },
      { projectId, chapter: 2, body: 'b', status: 'attention', sourceStale: true },
      { projectId, chapter: 3, body: 'c', status: 'translated' },
    ]);
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { stale: true });

    expect(harness.events).toEqual(['seed', 1, 2]);
  });

  it('should cap the batch at limit', async () => {
    const projectId = await seedProject(5);
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { limit: 2 });

    expect(harness.events).toEqual(['seed', 1, 2]);
  });

  it('should apply limit after the done-skip, not before it', async () => {
    const projectId = await seedProject(4);
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'done prose', status: 'translated' });
    const harness = buildExecutor();

    await runTranslateJob(harness, projectId, { limit: 2 });

    expect(harness.events).toEqual(['seed', 2, 3]);
  });

  it('should flag a failed chapter and keep translating the rest', async () => {
    const projectId = await seedProject();
    const harness = buildExecutor({ failChapters: [2] });

    const jobId = await runTranslateJob(harness, projectId);

    expect(harness.events).toEqual(['seed', 1, 2, 3]);
    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('done');
    const row = await translationRow(projectId, 2);
    expect(row).toMatchObject({ status: 'failed', body: '', revision: 1 });
    expect(row?.issues).toEqual([{ source: 'run', type: 'run_failed', detail: expect.stringContaining('chapter 2 translation failed') }]);
    expect(row?.lastFailedRunId).toBe(row?.runId);
  });

  it('should leave a translated row intact when a forced re-run fails', async () => {
    const projectId = await seedProject(1);
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'good prose', title: 'Good', status: 'translated' });
    const harness = buildExecutor({ failChapters: [1] });

    await runTranslateJob(harness, projectId, { force: true });

    const row = await translationRow(projectId, 1);
    expect(row).toMatchObject({ status: 'translated', body: 'good prose', title: 'Good', revision: 1 });
    expect(row?.lastError).toContain('failed');
    expect(row?.lastFailedRunId).not.toBeNull();
  });

  it('should bump the revision when an already-failed row fails again', async () => {
    const projectId = await seedProject(1);
    await db.insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: '', status: 'failed' });
    const harness = buildExecutor({ failChapters: [1] });

    await runTranslateJob(harness, projectId);

    const row = await translationRow(projectId, 1);
    expect(row).toMatchObject({ status: 'failed', revision: 2 });
    expect(row?.lastFailedRunId).not.toBeNull();
  });

  it('should pick up a chapter pushed after an earlier run', async () => {
    const projectId = await seedProject(2);
    const first = buildExecutor();
    await runTranslateJob(first, projectId);
    expect(first.events).toEqual(['seed', 1, 2]);

    await addOriginal(projectId, 3);
    const second = buildExecutor();
    await runTranslateJob(second, projectId);

    expect(second.events).toEqual(['seed', 3]);
  });

  it('should fail the job and mark the translation failed when the project has no originals', async () => {
    const projectId = await seedProject(0);
    const harness = buildExecutor();

    const jobId = await runTranslateJob(harness, projectId);

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toContain('has no originals');
    const translation = await db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) });
    expect(translation?.phase).toBe('failed');
    expect(translation?.lastError).toContain('has no originals');
    expect(harness.events).toEqual([]);
  });
});
