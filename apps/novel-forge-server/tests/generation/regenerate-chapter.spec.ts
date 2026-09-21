import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy, noPluginProposals } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_regenerate_chapter`;

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

describe.if(pgAvailable)('GenerationService.regenerateChapter', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  const enqueue = mock<(...args: unknown[]) => Promise<string>>(async () => 'job-regen');

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    const jobExecutor = { dispatch: async () => undefined } as never;
    service = new GenerationService(
      databaseService,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      { enqueue } as never,
      jobExecutor,
      noop,
      noop,
      noPluginPolicy(),
      noPluginProposals(),
    );
  });

  beforeEach(() => enqueue.mockClear());

  async function projectWithChapters(count: number): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `regen-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.volumes).values({ projectId: project.id, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5, status: 'approved', startChapter: 1, endChapter: 5 });
    const chapters = Array.from({ length: count }, (_, i) => i + 1);
    await db.insert(schema.briefs).values(chapters.map(chapter => ({ projectId: project.id, chapter, volumeKey: 'v1', body: `Purpose: Orrin reaches waypoint ${chapter}.` })));
    await db
      .insert(schema.drafts)
      .values(chapters.map(chapter => ({ projectId: project.id, chapter, body: `Orrin reached waypoint ${chapter}.`, reviewStatus: 'needs_review' as const })));
    return project.id;
  }

  it('should queue exactly the requested chapter and leave its prose and continuity review in place until the new draft lands', async () => {
    const projectId = await projectWithChapters(3);
    await db.insert(schema.continuityProposals).values({ projectId, chapter: 2, proposal: {} });

    const job = await service.regenerateChapter(projectId, 2);

    expect(job).toEqual({ jobId: 'job-regen', kind: 'generate', status: 'pending', target: '2' });
    expect(enqueue).toHaveBeenCalledWith(projectId, 'generate', '2', { chapters: [2], autoFix: true, maxFixes: undefined, guidance: undefined });
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 2)) });
    expect(draft?.body).toBe('Orrin reached waypoint 2.');
    expect(await db.query.continuityProposals.findFirst({ where: eq(schema.continuityProposals.projectId, projectId) })).toBeDefined();
  });

  it('should draft a chapter that has a brief but no draft yet', async () => {
    const projectId = await projectWithChapters(2);
    await db.insert(schema.briefs).values({ projectId, chapter: 3, volumeKey: 'v1', body: 'Purpose: Orrin reaches the last waypoint.' });

    expect((await service.regenerateChapter(projectId, 3)).target).toBe('3');
  });

  it('should regenerate a chapter whose own draft is contradicted', async () => {
    const projectId = await projectWithChapters(2);
    await db
      .update(schema.drafts)
      .set({ reviewStatus: 'contradiction' })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 2)));

    expect(await codeOf(service.regenerateChapter(projectId, 2))).toBe('NO_ERROR');
  });

  it('should refuse while another chapter is contradicted', async () => {
    const projectId = await projectWithChapters(3);
    await db
      .update(schema.drafts)
      .set({ reviewStatus: 'contradiction' })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)));

    expect(await codeOf(service.regenerateChapter(projectId, 2))).toBe('DRF_003');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('should refuse while an earlier chapter is still undrafted', async () => {
    const projectId = await projectWithChapters(3);
    await db.delete(schema.drafts).where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)));

    await expect(service.regenerateChapter(projectId, 3)).rejects.toMatchObject({ code: 'DRF_011', message: expect.stringContaining('before chapter 1 is drafted') });
  });

  it('should refuse behind an unfinalized external chapter', async () => {
    const projectId = await projectWithChapters(3);
    await db
      .update(schema.briefs)
      .set({ writeMode: 'external' })
      .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 2)));

    expect(await codeOf(service.regenerateChapter(projectId, 3))).toBe('DRF_012');
    expect(await codeOf(service.regenerateChapter(projectId, 2))).toBe('DRF_012');
  });

  it('should refuse a finalized chapter, a missing brief and a stale brief', async () => {
    const projectId = await projectWithChapters(3);
    await db
      .update(schema.drafts)
      .set({ status: 'final' })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)));
    await db
      .update(schema.briefs)
      .set({ staleReason: 'arc range moved' })
      .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 3)));

    expect(await codeOf(service.regenerateChapter(projectId, 1))).toBe('CHP_008');
    expect(await codeOf(service.regenerateChapter(projectId, 3))).toBe('BRF_002');
    expect(await codeOf(service.regenerateChapter(projectId, 9))).toBe('BRF_001');
  });

  it('should refuse while a generation job is running', async () => {
    const projectId = await projectWithChapters(2);
    await db.insert(schema.jobs).values({ projectId, kind: 'generate', status: 'in_progress', target: '2' });

    expect(await codeOf(service.regenerateChapter(projectId, 1))).toBe('DRF_010');
  });

  it('should refuse when the covering arc is not approved', async () => {
    const projectId = await projectWithChapters(2);
    await db.insert(schema.arcs).values({ projectId, arcKey: 'v1_a1', volumeKey: 'v1', ordinal: 1, chapterStart: 1, chapterEnd: 5, status: 'draft' });

    expect(await codeOf(service.regenerateChapter(projectId, 2))).toBe('ARC_004');
  });
});
