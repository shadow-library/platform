import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createSpanTransformGraph, routeAfterTransformJudge } from '@modules/ai/graphs/span-transform.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface ScriptedCall {
  key: string;
  vars: Record<string, unknown>;
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_span_transform_graph`;

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

const residueIssue = { source: 'residue' as const, type: 'cjk' as const, detail: 'x' };
const cutIssue = { source: 'cut' as const, type: 'resurfaced_cut' as const, cutKey: 'k', detail: 'y', excerpt: 'z' };
const contractIssue = { source: 'contract' as const, type: 'missing_kept_beat', detail: 'w' };

const cleanJudge = { verdict: 'clean', coveredBeats: 2, totalBeats: 2, missingBeats: [], issues: [] };
const cleanBody = (marker: string) => `Evan Vale rose in the land of Veldram, six months after the sect fell. ${marker}`;

function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, writeOutputs: unknown[], judgeOutputs: unknown[], calls: ScriptedCall[]) {
  const modelRouter = {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>) => {
      calls.push({ key: prompt.key, vars });
      if (prompt.key === 'reforge-transform-write') return writeOutputs.shift();
      if (prompt.key === 'reforge-transform-judge') return judgeOutputs.shift();
      throw new Error(`unexpected prompt ${prompt.key}`);
    },
  };
  const contextAssembler = {
    forReforgeTransform: async (_projectId: bigint, outputChapter: number, input: Record<string, unknown>) => {
      calls.push({ key: 'context:reforge_transform', vars: { outputChapter, ...input } });
      return { id: null, rendered: 'PACK', renderedStable: 'STABLE-LEDGER', renderedVolatile: 'VOLATILE-SPAN' };
    },
  };
  return { db, contextAssembler, modelRouter, checkpointer } as never;
}

describe.if(pgAvailable)('span-transform graph', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedPlan(name: string, opts: { judgeEnabled?: boolean } = {}): Promise<{ projectId: bigint; planId: bigint }> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'source' }).returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.reforges).values({ projectId: project.id, mode: 'transform', fidelity: 'loose', settings: opts });
    await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram replaces every real nation.', directives: 'weave romance in' });
    await db.insert(schema.rebrandGlossary).values([
      { projectId: project.id, sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', createdChapter: 0 },
      { projectId: project.id, sourceName: 'Huaxia', replacement: 'Veldram', category: 'country', createdChapter: 0 },
    ]);
    await db.insert(schema.chapters).values(
      Array.from({ length: 8 }, (_, index) => ({
        projectId: project.id,
        number: index + 1,
        title: `Chapter ${index + 1}`,
        content: `Ye Fan crossed the Huaxia courtyard for the ${index + 1}th time. The Azure Sect tribunal reconvened.`,
        status: 'done' as const,
      })),
    );

    const [plan] = await db
      .insert(schema.reforgePlans)
      .values({ projectId: project.id, revision: 1, status: 'approved', sourceChapterCount: 8, outputChapterCount: 3, approvedAt: new Date() })
      .returning();
    if (!plan) throw new Error('failed to seed plan');
    await db.insert(schema.reforgePlanSpans).values([
      { planId: plan.id, ordinal: 1, spanKey: 'span-a', fromChapter: 1, toChapter: 4, action: 'condense', targetChapters: 2, keptBeats: ['Evan is exiled', 'the gate opens'] },
      { planId: plan.id, ordinal: 2, spanKey: 'span-b', fromChapter: 5, toChapter: 6, action: 'drop', targetChapters: 0 },
      {
        planId: plan.id,
        ordinal: 3,
        spanKey: 'span-c',
        fromChapter: 7,
        toChapter: 8,
        action: 'merge',
        targetChapters: 1,
        keptBeats: ['the duel lands'],
        continuityNotes: 'six months have passed',
        bridgeDirective: 'The source chapters 5-6 are cut. The reader never saw them.',
      },
    ]);
    await db.insert(schema.reforgeCuts).values({
      planId: plan.id,
      cutKey: 'azure-sect-tribunal',
      kind: 'subplot',
      label: 'the Azure Sect tribunal',
      aliases: ['Azure Sect tribunal'],
      detail: 'a trial that resolves nothing',
      disposition: 'cut',
      originSpanOrdinal: 2,
      firstSourceChapter: 5,
      lastSourceChapter: 6,
      effectiveFromOutput: 1,
    });
    return { projectId: project.id, planId: plan.id };
  }

  describe('routeAfterTransformJudge', () => {
    it('should persist when clean, repair once on the first dirty attempt, and persist after', () => {
      expect(routeAfterTransformJudge({ residueIssues: [], cutIssues: [], judgeIssues: [], attempt: 0 })).toBe('persist');
      expect(routeAfterTransformJudge({ residueIssues: [residueIssue], cutIssues: [], judgeIssues: [], attempt: 0 })).toBe('repair');
      expect(routeAfterTransformJudge({ residueIssues: [], cutIssues: [cutIssue], judgeIssues: [], attempt: 0 })).toBe('repair');
      expect(routeAfterTransformJudge({ residueIssues: [], cutIssues: [], judgeIssues: [contractIssue], attempt: 0 })).toBe('repair');
      expect(routeAfterTransformJudge({ residueIssues: [residueIssue], cutIssues: [cutIssue], judgeIssues: [contractIssue], attempt: 1 })).toBe('persist');
    });
  });

  it('should write one output chapter from its span with no outline call, and persist it as written', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-clean-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [{ title: 'The Vale Gate', body: cleanBody('A'), summary: 's' }], [cleanJudge], calls));

    const state = (await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 1, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    )) as {
      outcome: string;
      nodeTrace: string[];
    };

    expect(state.outcome).toBe('written');
    // The plan's kept beats ARE the outline; there is no outline call to make.
    expect(calls.filter(c => c.key.includes('outline'))).toHaveLength(0);
    expect(calls.filter(c => c.key === 'reforge-transform-write')).toHaveLength(1);
    expect(state.nodeTrace).toEqual(['loadSpan', 'transformContext', 'write', 'residueScan', 'cutScan', 'judge', 'persistOutput', 'mergeGlossary', 'appendCuts', 'finish']);

    const output = await db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, planId), eq(schema.reforgeOutputs.outputChapter, 1)) });
    expect(output).toMatchObject({ status: 'written', spanOrdinal: 1, spanKey: 'span-a', fromChapter: 1, toChapter: 4, indexInSpan: 0, revision: 1 });
    expect(output?.planBeats).toEqual(['Evan is exiled', 'the gate opens']);
  });

  it('should resolve an output chapter to its span and carry the bridge across the dropped one', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-bridge-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [{ title: 'After the Gap', body: cleanBody('B'), summary: 's' }], [cleanJudge], calls));

    await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 3, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    );

    const pack = calls.find(c => c.key === 'context:reforge_transform');
    expect(pack?.vars['bridge']).toContain('source chapters 5-6 are cut');
    expect(pack?.vars['planSpan']).toContain('written from source chapters 7-8 (merge)');
    expect(pack?.vars['planSpan']).toContain('the duel lands');

    const output = await db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, planId), eq(schema.reforgeOutputs.outputChapter, 3)) });
    expect(output).toMatchObject({ spanOrdinal: 3, spanKey: 'span-c', fromChapter: 7, toChapter: 8, indexInSpan: 0 });
  });

  it('should catch a resurfaced cut with the pre-scan alone and repair once before persisting', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-resurface-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const graph = createSpanTransformGraph(
      buildServices(
        db,
        checkpointer,
        [
          { title: 'Relapse', body: `${cleanBody('C')} The Azure Sect tribunal reconvened at dawn.`, summary: 's' },
          { title: 'Repaired', body: cleanBody('D'), summary: 's' },
        ],
        // The judge is clean both times: the deterministic scan is what fails the first pass.
        [cleanJudge, cleanJudge],
        calls,
      ),
    );

    const state = (await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 1, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    )) as {
      outcome: string;
    };

    expect(state.outcome).toBe('written');
    expect(calls.filter(c => c.key === 'reforge-transform-write')).toHaveLength(2);
    // The scan hits reach the judge so it adjudicates them rather than rediscovering them.
    const firstJudge = calls.filter(c => c.key === 'reforge-transform-judge')[0];
    expect(String(firstJudge?.vars['scanHits'])).toContain('Azure Sect tribunal');

    const output = await db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, planId), eq(schema.reforgeOutputs.outputChapter, 1)) });
    expect(output).toMatchObject({ status: 'written', issues: null });
  });

  it('should persist as attention when a resurfaced cut survives the repair pass', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-attention-${Date.now()}`);
    const dirty = { title: 'Relapse', body: `${cleanBody('E')} The Azure Sect tribunal reconvened at dawn.`, summary: 's' };
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [dirty, dirty], [cleanJudge, cleanJudge], []));

    const state = (await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 1, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    )) as {
      outcome: string;
    };

    expect(state.outcome).toBe('attention');
    const output = await db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, planId), eq(schema.reforgeOutputs.outputChapter, 1)) });
    expect((output?.issues as { type: string }[])?.some(i => i.type === 'resurfaced_cut')).toBe(true);
  });

  it('should append what a chapter discovered it had to cut, binding from the next chapter on', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-delta-${Date.now()}`);
    const written = {
      title: 'The Vale Gate',
      body: cleanBody('F'),
      summary: 's',
      cutDelta: [{ label: 'the sword-scoring running gag', kind: 'running_gag', aliases: ['sword score'], detail: 'a tally nobody follows' }],
    };
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [written], [cleanJudge], []));

    await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 1, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    );

    const cuts = await db.query.reforgeCuts.findMany({ where: eq(schema.reforgeCuts.planId, planId), orderBy: [asc(schema.reforgeCuts.cutKey)] });
    expect(cuts.map(c => c.cutKey)).toEqual(['azure-sect-tribunal', 'the-sword-scoring-running-gag']);
    // The chapter that made the cut may describe it; the ban starts with the next one.
    expect(cuts.find(c => c.cutKey === 'the-sword-scoring-running-gag')).toMatchObject({ kind: 'running_gag', effectiveFromOutput: 2 });
  });

  it('should refuse to write against a plan that is not approved', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-unapproved-${Date.now()}`);
    await db.update(schema.reforgePlans).set({ status: 'superseded' }).where(eq(schema.reforgePlans.id, planId));
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [], [], []));

    const run = graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 1, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    );
    await expect(run).rejects.toThrow(/is superseded, not approved/);
  });

  it('should skip the judge when the author turned it off, leaving the deterministic scans in force', async () => {
    const { projectId, planId } = await seedPlan(`span-transform-nojudge-${Date.now()}`, { judgeEnabled: false });
    const calls: ScriptedCall[] = [];
    const graph = createSpanTransformGraph(buildServices(db, checkpointer, [{ title: 'Quiet', body: cleanBody('G'), summary: 's' }], [], calls));

    const state = (await graph.invoke(
      { projectId: String(projectId), planId: String(planId), outputChapter: 2, runId: crypto.randomUUID() },
      { configurable: { thread_id: crypto.randomUUID() } },
    )) as {
      outcome: string;
    };

    expect(state.outcome).toBe('written');
    expect(calls.filter(c => c.key === 'reforge-transform-judge')).toHaveLength(0);
    const output = await db.query.reforgeOutputs.findFirst({ where: and(eq(schema.reforgeOutputs.planId, planId), eq(schema.reforgeOutputs.outputChapter, 2)) });
    expect(output).toMatchObject({ status: 'written', indexInSpan: 1, spanOrdinal: 1 });
  });
});
