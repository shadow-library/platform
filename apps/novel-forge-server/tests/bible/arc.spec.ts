/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ArcService } from '@modules/bible/arc/arc.service';
import { VolumeService } from '@modules/bible/volume/volume.service';
import { GenerationService } from '@modules/generation/generation.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_arc_gates`;

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

describe.if(pgAvailable)('arc module & gates', () => {
  let db: PrimaryDatabase;
  let arcService: ArcService;
  let volumeService: VolumeService;
  let generationService: GenerationService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db, translateError: (err: unknown) => Promise.reject(err) } as never;
    arcService = new ArcService(databaseService);
    volumeService = new VolumeService(databaseService);
    const noop = {} as never;
    const jobService = { enqueue: async () => 'job-1' } as never;
    const jobExecutor = { dispatch: async () => undefined } as never;
    generationService = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, jobService, jobExecutor, noop, noop);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `arc-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('computes cumulative chapter ranges on plan approve and rejects missing counts', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 10 },
      { projectId, volumeKey: 'v2', ordinal: 2, targetChapterCount: 15 },
      // Range-only row (the bible-builder emits ranges, not counts) — approve derives the count.
      { projectId, volumeKey: 'v3', ordinal: 3, startChapter: 26, endChapter: 30 },
    ]);

    const result = await volumeService.approve(projectId);
    expect(result).toEqual({ volumesApproved: 3, approved: true });

    const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal });
    expect(volumes.map(v => [v.startChapter, v.endChapter, v.targetChapterCount, v.status])).toEqual([
      [1, 10, 10, 'approved'],
      [11, 25, 15, 'approved'],
      [26, 30, 5, 'approved'],
    ]);

    const bareProjectId = await createProject();
    await db.insert(schema.volumes).values({ projectId: bareProjectId, volumeKey: 'v1', ordinal: 1 });
    expect(await codeOf(volumeService.approve(bareProjectId))).toBe('PLN_002');
  });

  it('approves arcs only when they exactly partition the volume', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 10 });
    await volumeService.approve(projectId);

    // Gap: 1–4 then 6–10.
    await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', ordinal: 1, chapterStart: 1, chapterEnd: 4 });
    await arcService.upsert(projectId, 'v1_a2', { volumeKey: 'v1', ordinal: 2, chapterStart: 6, chapterEnd: 10 });
    expect(await codeOf(arcService.approve(projectId, 'v1'))).toBe('ARC_002');

    // Close the gap and approve.
    await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', chapterEnd: 5 });
    const result = await arcService.approve(projectId, 'v1');
    expect(result).toEqual({ arcsApproved: 2, approved: true });

    const arcs = await arcService.list(projectId, 'v1');
    expect(arcs.every(arc => arc.status === 'approved' && arc.staleReason === null)).toBe(true);
  });

  it('rejects arc approval when the volume plan is not approved', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5 });
    expect(await codeOf(arcService.approve(projectId, 'v1'))).toBe('ARC_003');
  });

  it('bumps revision on hand edits and rejects arcs escaping the volume range', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5 });
    await volumeService.approve(projectId);

    const created = await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', chapterStart: 1, chapterEnd: 5, title: 'first' });
    expect(created).toMatchObject({ revision: 1, status: 'draft' });

    const edited = await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', title: 'renamed' });
    expect(edited).toMatchObject({ revision: 2, title: 'renamed', chapterStart: 1, chapterEnd: 5 });
    expect(edited.contentHash).not.toBe(created.contentHash);

    expect(await codeOf(arcService.upsert(projectId, 'v1_a2', { volumeKey: 'v1', chapterStart: 5, chapterEnd: 9 }))).toBe('ARC_002');
    expect(await codeOf(arcService.upsert(projectId, 'v9_a1', { volumeKey: 'v9' }))).toBe('VOL_001');
  });

  it('outlines an arc into briefs carrying arcKey and ending contracts, gated on sibling approval', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5, objective: 'survive' });
    await volumeService.approve(projectId);
    await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', ordinal: 1, chapterStart: 1, chapterEnd: 3, hook: 'war horns' });
    await arcService.upsert(projectId, 'v1_a2', { volumeKey: 'v1', ordinal: 2, chapterStart: 4, chapterEnd: 5 });

    const contract = { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered' };
    const brief = (chapter: number) => ({ chapter, volumeKey: 'v1', title: `Ch ${chapter}`, objective: 'obj', events: ['e'], requiredContext: [], endingContract: contract });
    const structured = mock(async () => [brief(1), brief(2), brief(3), brief(99)]);
    const outliner = new GenerationService(
      { getPostgresClient: () => db } as never,
      {} as never,
      { structured } as never,
      { catalog: async () => 'CATALOG' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    // Gate 2: all arcs of the volume must be approved first.
    expect(await codeOf(outliner.outlineArc(projectId, 'v1_a1', {}))).toBe('ARC_004');
    await arcService.approve(projectId, 'v1');

    const result = await outliner.outlineArc(projectId, 'v1_a1', {});
    expect(result.briefs.map(b => b.chapter)).toEqual([1, 2, 3]);
    expect(result.briefs[0]).toMatchObject({ arcKey: 'v1_a1', volumeKey: 'v1', staleReason: null });
    expect(result.briefs[0]?.endingContract).toMatchObject({ hookType: 'cliffhanger' });

    // The outliner saw the arc structure and the next arc's intent for contract chaining.
    const input = structured.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, unknown>;
    expect(String(input['volumePlan'])).toContain('war horns');
    expect(String(input['volumePlan'])).toContain('Next arc intent');
  });

  it('gates generation on arc approval only for volumes that have arcs (arc-less volumes keep the volume-scoped path)', async () => {
    const projectId = await createProject();
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5 });
    await volumeService.approve(projectId);
    await db.insert(schema.briefs).values({ projectId, chapter: 1, volumeKey: 'v1', body: 'brief one' });

    // Arc-less volume — generation proceeds on the volume-scoped path.
    expect(await codeOf(generationService.generate(projectId, {}))).toBe('NO_ERROR');

    // Draft arc covering the chapter — generation blocked until arcs are approved.
    await arcService.upsert(projectId, 'v1_a1', { volumeKey: 'v1', ordinal: 1, chapterStart: 1, chapterEnd: 5 });
    expect(await codeOf(generationService.generate(projectId, {}))).toBe('ARC_004');

    await arcService.approve(projectId, 'v1');
    expect(await codeOf(generationService.generate(projectId, {}))).toBe('NO_ERROR');
  });
});
