import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError, Config } from '@shadow-library/common';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_finalize_guards`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

describe.if(pgAvailable)('GenerationService.finalize consistency guards', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: GenerationService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `fin-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  interface Harness {
    service: GenerationService;
    finalization: ReturnType<typeof mock>;
    structured: ReturnType<typeof mock>;
  }

  function buildService(status: 'completed' | 'failed', onRun?: () => Promise<void>): Harness {
    const finalization = mock(async () => {
      await onRun?.();
      return { runId: 'run-1', outcome: status, status };
    });
    const structured = mock(async () => ({ epitome: 'distilled' }));
    const contextAssembler = { forOutline: async () => ({ rendered: 'CATALOG' }), resolveRefs: async () => ({ resolved: [], unresolved: [] }) } as never;
    const noop = {} as never;
    const service = new GenerationService(
      { getPostgresClient: () => db } as never,
      { runChapterFinalization: finalization } as never,
      { structured } as never,
      contextAssembler,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );
    return { service, finalization, structured };
  }

  it('blocks finalizing chapter N when an earlier chapter needs re-validation (FIN_002)', async () => {
    const projectId = await createProject();
    // Chapter 1 finalized but invalidated by a later canon change; drafts 1 (final) and 2 (approved).
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch1', status: 'done', locked: true, needsRevalidation: true });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', status: 'final', reviewStatus: 'final' });
    await db.insert(schema.drafts).values({ projectId, chapter: 2, body: 'd2', status: 'draft', reviewStatus: 'approved' });

    expect(await codeOf(service.finalize(projectId, { chapter: 2 }))).toBe('FIN_002');
  });

  it('blocks finalizing a chapter with an unresolved validation error for it (FIN_003)', async () => {
    const projectId = await createProject();
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', status: 'draft', reviewStatus: 'approved' });
    await db.insert(schema.validationReports).values({
      projectId,
      scope: 'novel',
      chapter: null,
      issues: 1,
      summary: 'has an error',
      payload: { issues: [{ chapter: 1, severity: 'error', description: 'timeline conflict' }], summary: 'has an error' },
    });

    expect(await codeOf(service.finalize(projectId, { chapter: 1 }))).toBe('FIN_003');
  });

  async function seedCommittedChapter(continuityApplied: boolean, storyCurrentChapter: number): Promise<bigint> {
    const projectId = await createProject();
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch1', summary: 's1', status: 'done', locked: true, continuityApplied });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', summary: 's1', status: 'final', reviewStatus: 'final' });
    await db.update(schema.projects).set({ storyCurrentChapter }).where(eq(schema.projects.id, projectId));
    return projectId;
  }

  it('resumes a chapter whose prose was committed but whose continuity never landed', async () => {
    const projectId = await seedCommittedChapter(false, 0);
    const { service, finalization } = buildService('completed', async () => {
      await db
        .update(schema.chapters)
        .set({ continuityApplied: true })
        .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)));
      await db.update(schema.projects).set({ storyCurrentChapter: 1 }).where(eq(schema.projects.id, projectId));
    });

    const result = await service.finalize(projectId, { chapter: 1 });

    expect(result.status).toBe('completed');
    expect(finalization).toHaveBeenCalledTimes(1);
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(chapter?.continuityApplied).toBe(true);
    expect(project?.storyCurrentChapter).toBe(1);
  });

  it('resumes a chapter whose continuity landed but whose cursor never advanced', async () => {
    const projectId = await seedCommittedChapter(true, 0);
    const { service, finalization } = buildService('completed');

    expect(await codeOf(service.finalize(projectId, { chapter: 1 }))).toBe('NO_ERROR');
    expect(finalization).toHaveBeenCalledTimes(1);
  });

  it('still rejects a duplicate finalize of a fully finalized chapter (DRF_002)', async () => {
    const projectId = await seedCommittedChapter(true, 1);
    const { service, finalization } = buildService('completed');

    expect(await codeOf(service.finalize(projectId, { chapter: 1 }))).toBe('DRF_002');
    expect(finalization).not.toHaveBeenCalled();
  });

  it('still rejects finalizing a draft that was never approved (DRF_004)', async () => {
    const projectId = await createProject();
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', status: 'draft', reviewStatus: 'needs_review' });
    const { service, finalization } = buildService('completed');

    expect(await codeOf(service.finalize(projectId, { chapter: 1 }))).toBe('DRF_004');
    expect(finalization).not.toHaveBeenCalled();
  });

  async function seedPostFinalizeSideEffects(): Promise<bigint> {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 1 });
    await db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, chapterStart: 1, chapterEnd: 3, status: 'approved' });
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch1', summary: 's1', status: 'done', locked: true });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', summary: 's1', status: 'draft', reviewStatus: 'approved' });
    return projectId;
  }

  it('skips arc reconciliation and the volume epitome when the finalization run fails', async () => {
    Config['cache'].set('generation.reconciliation.cadence', 1);
    const projectId = await seedPostFinalizeSideEffects();
    const { service, structured } = buildService('failed');

    const result = await service.finalize(projectId, { chapter: 1 });

    expect(result.status).toBe('failed');
    expect(structured).not.toHaveBeenCalled();
    const volume = await db.query.volumes.findFirst({ where: eq(schema.volumes.projectId, projectId) });
    expect(volume?.epitome).toBeNull();
  });

  it('runs the volume epitome when the finalization run completes', async () => {
    Config['cache'].set('generation.reconciliation.cadence', 1);
    const projectId = await seedPostFinalizeSideEffects();
    const { service, structured } = buildService('completed');

    await service.finalize(projectId, { chapter: 1 });

    expect(structured).toHaveBeenCalled();
    const volume = await db.query.volumes.findFirst({ where: eq(schema.volumes.projectId, projectId) });
    expect(volume?.epitome).toBe('distilled');
  });
});
