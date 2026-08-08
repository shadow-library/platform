import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { type ImportJobPayload } from '@modules/novel-import/novel-import.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface Harness {
  executor: JobExecutor;
  jobService: JobService;
  recombineCalls: bigint[];
  coverSaves: { contentType: string; bytes: number }[];
}

const COVER_REF = `${'a'.repeat(64)}.jpg`;
const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_import_executor`;

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

describe.if(pgAvailable)('JobExecutor.runImport', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(kind: 'source' | 'new_novel' = 'source'): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `import-exec-${Date.now()}-${Math.random()}`, kind })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  // The executor with scripted collaborators: recombine and the image storage provider just record
  // their calls, exactly like rebrand-executor.spec.ts's harness for RebrandService/RecombineService.
  function buildExecutor(): Harness {
    const recombineCalls: bigint[] = [];
    const coverSaves: { contentType: string; bytes: number }[] = [];
    const jobService = new JobService({ getPostgresClient: () => db } as never);
    const concurrency = new ConcurrencyController();

    const recombineService = {
      autoRecombine: async (projectId: bigint) => {
        recombineCalls.push(projectId);
        return null;
      },
    } as never;

    const imageStorage = {
      save: async (bytes: Uint8Array, opts: { contentType?: string }) => {
        coverSaves.push({ contentType: opts.contentType ?? '', bytes: bytes.length });
        return COVER_REF;
      },
    } as never;

    const executor = new JobExecutor(
      jobService,
      concurrency,
      {} as never,
      {} as never,
      { getPostgresClient: () => db } as never,
      {} as never,
      recombineService,
      {} as never,
      imageStorage,
    );
    return { executor, jobService, recombineCalls, coverSaves };
  }

  async function runImportJob(harness: Harness, projectId: bigint, payload: ImportJobPayload): Promise<string> {
    const jobId = await harness.jobService.enqueue(projectId, 'import', `import-${projectId}`, payload);
    await harness.executor.dispatch(jobId);
    return jobId;
  }

  function chapters(n: number): { title: string; content: string }[] {
    return Array.from({ length: n }, (_, i) => ({ title: `Chapter ${i + 1}`, content: `Prose of chapter ${i + 1}.` }));
  }

  it('should insert source-mode chapters unlocked with the default generator and call autoRecombine', async () => {
    const projectId = await seedProject('source');
    const harness = buildExecutor();

    const jobId = await runImportJob(harness, projectId, { mode: 'source', chapters: chapters(3) });

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
    expect(harness.recombineCalls).toEqual([projectId]);

    const rows = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) });
    expect(rows.map(r => [r.number, r.title, r.status, r.locked, r.generator])).toEqual([
      [1, 'Chapter 1', 'done', false, 'standard'],
      [2, 'Chapter 2', 'done', false, 'standard'],
      [3, 'Chapter 3', 'done', false, 'standard'],
    ]);
    expect(rows.every(r => (r.wordCount ?? 0) > 0)).toBe(true);
  });

  it('should insert final-mode chapters locked and human-authored, and never call autoRecombine', async () => {
    const projectId = await seedProject('new_novel');
    const harness = buildExecutor();

    await runImportJob(harness, projectId, { mode: 'final', chapters: chapters(2) });

    expect(harness.recombineCalls).toEqual([]);
    const rows = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) });
    expect(rows.map(r => [r.number, r.status, r.locked, r.generator])).toEqual([
      [1, 'done', true, 'human'],
      [2, 'done', true, 'human'],
    ]);
  });

  it('should store the cover asset through the image storage provider and set coverImagePath', async () => {
    const projectId = await seedProject('new_novel');
    const harness = buildExecutor();

    await runImportJob(harness, projectId, { mode: 'final', chapters: chapters(1), cover: { mimeType: 'image/jpeg', dataBase64: Buffer.from('cover-bytes').toString('base64') } });

    expect(harness.coverSaves).toEqual([{ contentType: 'image/jpeg', bytes: Buffer.byteLength('cover-bytes') }]);
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.coverImagePath).toBe(COVER_REF);
  });

  it('should report progress across chapter batches', async () => {
    const projectId = await seedProject('source');
    const harness = buildExecutor();

    // Batch size is 25 — 30 chapters exercises two batches.
    const jobId = await runImportJob(harness, projectId, { mode: 'source', chapters: chapters(30) });

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('done');
    // Final progress reflects recombine as the last reported phase for source mode.
    expect(job?.progress).toMatchObject({ done: 30, total: 30, phase: 'recombining' });
    expect(await db.$count(schema.chapters, eq(schema.chapters.projectId, projectId))).toBe(30);
  });

  it('should fail the job cleanly on a mid-batch insert error, leaving already-inserted chapters and the project row in place', async () => {
    const projectId = await seedProject('source');
    const harness = buildExecutor();

    // Pre-seed chapter 27 so the second batch (chapters 26-30, batch size 25) collides on the unique
    // (projectId, number) constraint and the whole batch insert throws.
    await db.insert(schema.chapters).values({ projectId, number: 27, title: 'Already here', content: 'Existing.', status: 'done' });

    const jobId = await runImportJob(harness, projectId, { mode: 'source', chapters: chapters(30) });

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toBeTruthy();

    // Batch 1 (chapters 1-25) landed; batch 2 never committed any of its rows (single INSERT, all-or-nothing).
    expect(await db.$count(schema.chapters, eq(schema.chapters.projectId, projectId))).toBe(26);
    const preseeded = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 27)) });
    expect(preseeded?.title).toBe('Already here');

    // The project row is left in place for the caller to inspect/retry/delete — nothing auto-rolls-back.
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project).toBeTruthy();

    // autoRecombine never runs — the job failed before reaching that phase.
    expect(harness.recombineCalls).toEqual([]);
  });
});
