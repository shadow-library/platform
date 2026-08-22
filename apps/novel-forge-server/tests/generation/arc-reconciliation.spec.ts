import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config } from '@shadow-library/common';

import { GenerationService } from '@modules/generation/generation.service';
import { ActionExecutorRegistry, ProposalApplyService, ProposalService } from '@modules/refinement';
import { type Generation, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_arc_reconciliation`;

const CADENCE = 5;

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

function modelBrief(chapter: number) {
  return {
    chapter,
    volumeKey: 'vol_1',
    title: `Regenerated ${chapter}`,
    objective: 'regenerated objective',
    events: ['regenerated beat'],
    requiredContext: [],
    endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'what now', handoffState: 'mid-fall', mustNotResolve: [] },
  };
}

describe.if(pgAvailable)('arc reconciliation on finalization', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    Config['cache'].set('generation.reconciliation.cadence', CADENCE);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(): { service: GenerationService; structured: ReturnType<typeof mock>; finalization: ReturnType<typeof mock> } {
    const structured = mock(async (_prompt: unknown, vars: { startChapter: number; endChapter: number }) =>
      Array.from({ length: vars.endChapter - vars.startChapter + 1 }, (_, i) => modelBrief(vars.startChapter + i)),
    );
    const finalization = mock(async () => ({ runId: 'run-1' }));
    const contextAssembler = {
      forOutline: async () => ({ rendered: 'CATALOG' }),
      resolveRefs: async (_projectId: bigint, refs: string[]) => ({ resolved: [], unresolved: refs }),
    } as never;
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
    return { service, structured, finalization };
  }

  interface ArcFixture {
    chapterEnd?: number;
    finalizedThrough?: number;
    staleChapters?: number[];
    handEditedChapters?: number[];
    arcStatus?: 'draft' | 'approved';
  }

  async function seedArc({ chapterEnd = 10, finalizedThrough = 0, staleChapters = [], handEditedChapters = [], arcStatus = 'approved' }: ArcFixture = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `recon-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: chapterEnd });
    await db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, chapterStart: 1, chapterEnd, status: arcStatus });
    await db.insert(schema.briefs).values(
      Array.from({ length: chapterEnd }, (_, i) => ({
        projectId,
        chapter: i + 1,
        volumeKey: 'vol_1',
        arcKey: 'vol_1_arc_1',
        body: `original brief ${i + 1}`,
        staleReason: staleChapters.includes(i + 1) ? 'arc_changed' : null,
        handEdited: handEditedChapters.includes(i + 1),
      })),
    );
    if (finalizedThrough > 0) {
      await db
        .insert(schema.chapters)
        .values(Array.from({ length: finalizedThrough }, (_, i) => ({ projectId, number: i + 1, content: `ch${i + 1}`, status: 'done' as const, locked: true })));
      await db
        .insert(schema.drafts)
        .values(Array.from({ length: finalizedThrough }, (_, i) => ({ projectId, chapter: i + 1, body: `d${i + 1}`, status: 'final' as const, reviewStatus: 'final' as const })));
    }
    return projectId;
  }

  function briefsOf(projectId: bigint): Promise<Generation.Brief[]> {
    return db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
  }

  it('should skip persisting a hand-edited brief while still returning its current row', async () => {
    const projectId = await seedArc({ handEditedChapters: [3] });
    const { service } = buildService();

    const { briefs } = await service.outlineArc(projectId, 'vol_1_arc_1', {});

    expect(briefs.find(b => b.chapter === 3)?.body).toBe('original brief 3');
    const persisted = await briefsOf(projectId);
    expect(persisted.find(b => b.chapter === 3)?.body).toBe('original brief 3');
    expect(persisted.find(b => b.chapter === 4)?.title).toBe('Regenerated 4');
  });

  it('should skip persisting a brief whose chapter is already finalized', async () => {
    const projectId = await seedArc({ finalizedThrough: 2 });
    const { service } = buildService();

    await service.outlineArc(projectId, 'vol_1_arc_1', {});

    const persisted = await briefsOf(projectId);
    expect(persisted.slice(0, 2).map(b => b.body)).toEqual(['original brief 1', 'original brief 2']);
    expect(persisted[2]?.title).toBe('Regenerated 3');
  });

  it('should mark AI-written briefs as not hand-edited', async () => {
    const projectId = await seedArc();
    const { service } = buildService();

    await service.outlineArc(projectId, 'vol_1_arc_1', {});

    const persisted = await briefsOf(projectId);
    expect(persisted.every(b => b.handEdited === false)).toBe(true);
  });

  it('should re-outline the arc remainder when the finalized count hits the configured cadence', async () => {
    const projectId = await seedArc({ finalizedThrough: 4 });
    await db.insert(schema.drafts).values({ projectId, chapter: 5, body: 'd5', status: 'draft', reviewStatus: 'approved' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 5 });

    expect(structured).toHaveBeenCalledTimes(1);
    const persisted = await briefsOf(projectId);
    expect(persisted.find(b => b.chapter === 7)?.title).toBe('Regenerated 7');
  });

  it('should re-outline early when a remaining brief in the arc is stale', async () => {
    const projectId = await seedArc({ finalizedThrough: 1, staleChapters: [7] });
    await db.insert(schema.drafts).values({ projectId, chapter: 2, body: 'd2', status: 'draft', reviewStatus: 'approved' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 2 });

    expect(structured).toHaveBeenCalledTimes(1);
    const persisted = await briefsOf(projectId);
    expect(persisted.find(b => b.chapter === 7)).toMatchObject({ staleReason: null });
  });

  it('should not re-outline off-cadence when no remaining brief is stale', async () => {
    const projectId = await seedArc({ finalizedThrough: 1 });
    await db.insert(schema.drafts).values({ projectId, chapter: 2, body: 'd2', status: 'draft', reviewStatus: 'approved' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 2 });

    expect(structured).not.toHaveBeenCalled();
  });

  it('should not re-outline when the arc’s last chapter is the one being finalized', async () => {
    const projectId = await seedArc({ chapterEnd: 5, finalizedThrough: 4, staleChapters: [] });
    await db.insert(schema.drafts).values({ projectId, chapter: 5, body: 'd5', status: 'draft', reviewStatus: 'approved' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 5 });

    expect(structured).not.toHaveBeenCalled();
  });

  it('should not re-outline when the containing arc is not approved', async () => {
    const projectId = await seedArc({ finalizedThrough: 4, arcStatus: 'draft' });
    await db.insert(schema.drafts).values({ projectId, chapter: 5, body: 'd5', status: 'draft', reviewStatus: 'approved' });
    const { service, structured } = buildService();

    await service.finalize(projectId, { chapter: 5 });

    expect(structured).not.toHaveBeenCalled();
  });

  it('should finalize successfully even when reconciliation throws', async () => {
    const projectId = await seedArc({ finalizedThrough: 4 });
    await db.insert(schema.drafts).values({ projectId, chapter: 5, body: 'd5', status: 'draft', reviewStatus: 'approved' });
    const { service, structured, finalization } = buildService();
    structured.mockImplementationOnce(() => Promise.reject(new Error('model exploded')));

    await expect(service.finalize(projectId, { chapter: 5 })).resolves.toMatchObject({ runId: 'run-1' });
    expect(finalization).toHaveBeenCalledTimes(1);
  });

  it('should mark a brief hand-edited when a human updates it directly', async () => {
    const projectId = await seedArc();
    const { service } = buildService();

    const updated = await service.updateBrief(projectId, 4, { title: 'human title', body: 'human body' });

    expect(updated.handEdited).toBe(true);
  });

  it('should mark a brief hand-edited when a refinement brief.update op applies', async () => {
    const projectId = await seedArc();
    const databaseService = { getPostgresClient: () => db } as never;
    const proposals = new ProposalService(databaseService);
    const applier = new ProposalApplyService(databaseService, new ActionExecutorRegistry());

    const proposal = await proposals.create(projectId, { scopeType: 'novel', kind: 'chat', changeSet: [{ op: 'brief.update', chapter: 6, body: 'refined brief six' }] });
    await applier.apply(projectId, proposal.id);

    const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 6)) });
    expect(brief).toMatchObject({ body: 'refined brief six', handEdited: true });
  });
});
