import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type PlanSpanInput, ReforgePlanService } from '@modules/reforge/reforge-plan.service';
import { ReforgeCutService } from '@modules/reforge/reforge-cut.service';
import { ReforgeService } from '@modules/reforge/reforge.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_reforge_plan`;

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

const CHAPTER_COUNT = 20;

function span(ordinal: number, from: number, to: number, action: PlanSpanInput['action'], targetChapters: number, extra: Partial<PlanSpanInput> = {}): PlanSpanInput {
  return { ordinal, fromChapter: from, toChapter: to, action, targetChapters, keptBeats: action === 'drop' ? [] : ['the duel lands'], rationale: 'because', ...extra };
}

const SPANS: PlanSpanInput[] = [
  span(1, 1, 4, 'keep', 4),
  span(2, 5, 12, 'condense', 3, { cutThreads: ['the tribunal subplot'] }),
  span(3, 13, 16, 'drop', 0),
  span(4, 17, 20, 'keep', 4, { continuityNotes: 'six months have passed' }),
];

const draftOutput = { summary: 'Twenty chapters become eleven.', spans: SPANS };

function buildService(db: PrimaryDatabase, calls: string[] = []): ReforgePlanService {
  const databaseService = { getPostgresClient: () => db } as never;
  const reforgeService = new ReforgeService(databaseService);
  const analysisService = {
    getLatest: async (projectId: bigint) => {
      const analysis = await db.query.reforgeAnalyses.findFirst({ where: eq(schema.reforgeAnalyses.projectId, projectId) });
      if (!analysis) throw new Error('no analysis');
      return analysis;
    },
  } as never;
  const modelRouter = {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>) => {
      calls.push(String(vars['planBrief']));
      if (prompt.key !== 'reforge-plan') throw new Error(`unexpected prompt ${prompt.key}`);
      return draftOutput;
    },
  } as never;
  const contextAssembler = { forReforgeAnalysis: async () => ({ id: null, rendered: 'PACK', renderedStable: 'STABLE', renderedVolatile: 'VOLATILE' }) } as never;
  const workflowRunService = {
    runChain: async (_p: bigint, _g: string, _t: string, _i: unknown, fn: (runId: string) => Promise<unknown>) => ({ runId: randomUUID(), result: await fn(randomUUID()) }),
    linkContextPack: async () => undefined,
  } as never;

  return new ReforgePlanService(databaseService, reforgeService, analysisService, new ReforgeCutService(databaseService), contextAssembler, modelRouter, workflowRunService);
}

describe.if(pgAvailable)('ReforgePlanService', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(name: string, settings: Record<string, unknown> = {}): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'source' }).returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.reforges).values({ projectId: project.id, mode: 'transform', settings });
    await db.insert(schema.chapters).values(
      Array.from({ length: CHAPTER_COUNT }, (_, index) => ({
        projectId: project.id,
        number: index + 1,
        title: `Chapter ${index + 1}`,
        content: 'prose',
        status: 'done' as const,
      })),
    );
    await db.insert(schema.reforgeAnalyses).values({ projectId: project.id, status: 'done', report: '# Source analysis' });
    return project.id;
  }

  it('should draft a plan in draft status with derived output numbering and stable span keys', async () => {
    const projectId = await seedProject(`plan-draft-${Date.now()}`, { targetCompression: 0.5 });
    const calls: string[] = [];

    const result = await buildService(db, calls).draft(projectId);

    expect(result.plan).toMatchObject({ status: 'draft', revision: 1, sourceChapterCount: CHAPTER_COUNT, outputChapterCount: 11 });
    expect(result.outputChapterCount).toBe(11);
    expect(result.spans.map(s => [s.firstOutputChapter, s.lastOutputChapter])).toEqual([
      [1, 4],
      [5, 7],
      [null, null],
      [8, 11],
    ]);
    expect(result.spans.every(s => s.spanKey.length === 32)).toBe(true);
    // The compression target reaches the drafter as a whole-novel ratio, not a per-span rule.
    expect(calls[0]).toContain('roughly 50%');
    expect(calls[0]).toContain('cover chapters 1 to 20 exactly once');
  });

  it('should reject a span set that does not partition the source', async () => {
    const projectId = await seedProject(`plan-invalid-${Date.now()}`);
    const service = buildService(db);
    await service.draft(projectId);

    const gapped = [span(1, 1, 4, 'keep', 4), span(2, 7, 20, 'condense', 5)];
    await expect(service.replaceSpans(projectId, gapped)).rejects.toMatchObject({ code: 'REF_006' });
  });

  it('should write an edit as a new revision, supersede the old one, and carry unchanged span keys forward', async () => {
    const projectId = await seedProject(`plan-revision-${Date.now()}`);
    const service = buildService(db);
    const first = await service.draft(projectId);
    await service.approve(projectId);

    const edited = [SPANS[0] as PlanSpanInput, span(2, 5, 12, 'condense', 2, { cutThreads: ['the tribunal subplot'] }), SPANS[2] as PlanSpanInput, SPANS[3] as PlanSpanInput];
    const second = await service.replaceSpans(projectId, edited);

    expect(second.plan).toMatchObject({ revision: 2, status: 'draft', outputChapterCount: 10 });
    const superseded = await db.query.reforgePlans.findFirst({ where: eq(schema.reforgePlans.id, first.plan.id) });
    expect(superseded?.status).toBe('superseded');

    // Spans 1, 3 and 4 are untouched, so their outputs carry forward; only span 2's key moves.
    expect(second.spans[0]?.spanKey).toBe(first.spans[0]?.spanKey as string);
    expect(second.spans[1]?.spanKey).not.toBe(first.spans[1]?.spanKey as string);
    expect(second.spans[2]?.spanKey).toBe(first.spans[2]?.spanKey as string);
    expect(second.spans[3]?.spanKey).toBe(first.spans[3]?.spanKey as string);
    expect(second.spans[3]?.firstOutputChapter).toBe(7);
  });

  it('should freeze an approved plan idempotently and 409 an edit made against a stale revision', async () => {
    const projectId = await seedProject(`plan-approve-${Date.now()}`);
    const service = buildService(db);
    await service.draft(projectId);

    const approved = await service.approve(projectId, 1);
    expect(approved.plan).toMatchObject({ status: 'approved', outputChapterCount: 11 });
    expect(approved.plan.approvedAt).not.toBeNull();

    const again = await service.approve(projectId);
    expect(again.plan.id).toBe(approved.plan.id);
    expect(again.plan.approvedAt).toEqual(approved.plan.approvedAt);

    await expect(service.replaceSpans(projectId, SPANS, 99)).rejects.toMatchObject({ code: 'REF_010' });
    await expect(service.approve(projectId, 99)).rejects.toMatchObject({ code: 'REF_010' });
  });

  it('should refuse to name a plan authoritative before one exists', async () => {
    const projectId = await seedProject(`plan-missing-${Date.now()}`);
    const service = buildService(db);

    await expect(service.get(projectId)).rejects.toMatchObject({ code: 'REF_005' });
    await service.draft(projectId);
    await expect(service.getApproved(projectId)).rejects.toMatchObject({ code: 'REF_005' });

    await service.approve(projectId);
    expect((await service.getApproved(projectId)).status).toBe('approved');
  });

  it('should seed the cut ledger and the seam bridges at approval, and stay idempotent on re-approval', async () => {
    const projectId = await seedProject(`plan-ledger-${Date.now()}`);
    const service = buildService(db);
    const { plan } = await service.draft(projectId);

    expect(await db.query.reforgeCuts.findMany({ where: eq(schema.reforgeCuts.planId, plan.id) })).toHaveLength(0);

    await service.approve(projectId);
    const cuts = await db.query.reforgeCuts.findMany({ where: eq(schema.reforgeCuts.planId, plan.id) });
    expect(cuts.map(c => c.cutKey).sort()).toEqual(['source-chapters-13-16', 'the-tribunal-subplot']);
    expect(cuts.find(c => c.cutKey === 'source-chapters-13-16')).toMatchObject({ kind: 'arc', effectiveFromOutput: 8 });

    const spans = await db.query.reforgePlanSpans.findMany({ where: eq(schema.reforgePlanSpans.planId, plan.id), orderBy: [asc(schema.reforgePlanSpans.ordinal)] });
    expect(spans[3]?.bridgeDirective).toContain('source chapters 13-16');
    expect(spans[3]?.bridgeDirective).toContain('six months have passed');
    // Only the span on the far side of a drop carries a bridge.
    expect(spans.slice(0, 3).every(s => s.bridgeDirective === null)).toBe(true);

    await service.approve(projectId);
    expect(await db.query.reforgeCuts.findMany({ where: eq(schema.reforgeCuts.planId, plan.id) })).toHaveLength(2);
  });

  it('should persist the span rows in ordinal order with their beats and cuts', async () => {
    const projectId = await seedProject(`plan-rows-${Date.now()}`);
    const { plan } = await buildService(db).draft(projectId);

    const rows = await db.query.reforgePlanSpans.findMany({ where: eq(schema.reforgePlanSpans.planId, plan.id), orderBy: [asc(schema.reforgePlanSpans.ordinal)] });
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ action: 'condense', targetChapters: 3, cutThreads: ['the tribunal subplot'], keptBeats: ['the duel lands'] });
    expect(rows[2]).toMatchObject({ action: 'drop', targetChapters: 0, keptBeats: [] });
    expect(rows[3]?.continuityNotes).toBe('six months have passed');
  });
});
