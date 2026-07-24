/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { createChapterReforgeGraph, routeAfterFidelityJudge } from '@modules/ai/graphs/chapter-reforge.graph';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

interface ScriptedCall {
  key: string;
  inputs: Record<string, unknown>;
}

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_reforge_graph`;

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
const fidelityIssue = { source: 'fidelity' as const, type: 'missing_beat', detail: 'y' };

// Scripted model: outline/write/judge outputs each pop off their own queue; every call is recorded.
function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, outlineOutputs: unknown[], writeOutputs: unknown[], judgeOutputs: unknown[], calls: ScriptedCall[]) {
  const modelRouter = {
    structured: async (promptModule: { key: string }, inputs: Record<string, unknown>) => {
      calls.push({ key: promptModule.key, inputs });
      if (promptModule.key === 'reforge-outline') return outlineOutputs.shift();
      if (promptModule.key === 'reforge-write') return writeOutputs.shift();
      if (promptModule.key === 'reforge-judge') return judgeOutputs.shift();
      throw new Error(`unexpected prompt ${promptModule.key}`);
    },
  };
  const contextAssembler = {
    forReforgeOutline: async () => ({ id: null, rendered: 'OUTLINE-PACK' }),
    forReforge: async () => ({ id: null, rendered: 'WRITE-PACK' }),
  };
  return { db, contextAssembler, modelRouter, checkpointer } as never;
}

async function seedProject(db: PrimaryDatabase, name: string, settings: Record<string, unknown> | null = null) {
  const [project] = await db.insert(schema.projects).values({ name, kind: 'source' }).returning();
  if (!project) throw new Error('failed to seed project');
  await db.insert(schema.reforges).values({ projectId: project.id, instructions: 'cut the filler tournament arc; raise the prose', settings });
  await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram replaces every real nation.', directives: 'weave romance in' });
  await db.insert(schema.rebrandGlossary).values([
    { projectId: project.id, sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', createdChapter: 0 },
    { projectId: project.id, sourceName: 'Huaxia', replacement: 'Veldram', category: 'country', createdChapter: 0 },
  ]);
  await db.insert(schema.chapters).values({ projectId: project.id, number: 1, title: 'Awakening', content: 'Ye Fan woke beneath the Huaxia moon.', status: 'done' });
  return project.id;
}

const outline = { title: 'Awakening', throughline: 'Evan awakens to the vale.', beats: [{ summary: 'He wakes beneath the moon.', purpose: 'open the chapter' }] };
const cleanJudge = { verdict: 'clean', coveredBeats: 1, totalBeats: 1, missingBeats: [], issues: [] };
const cleanBody = (marker: string) => `Evan Vale rose in the land of Veldram. ${marker}`;

describe.if(pgAvailable)('chapter-reforge graph', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  describe('routeAfterFidelityJudge', () => {
    it('should persist when clean, repair once on the first dirty attempt, and persist after', () => {
      expect(routeAfterFidelityJudge({ residueIssues: [], judgeIssues: [], attempt: 0 })).toBe('persist');
      expect(routeAfterFidelityJudge({ residueIssues: [residueIssue], judgeIssues: [], attempt: 0 })).toBe('repair');
      expect(routeAfterFidelityJudge({ residueIssues: [], judgeIssues: [fidelityIssue], attempt: 0 })).toBe('repair');
      expect(routeAfterFidelityJudge({ residueIssues: [residueIssue], judgeIssues: [fidelityIssue], attempt: 1 })).toBe('persist');
    });
  });

  it('should outline once, repair a dirty write once, and persist the clean result as reforged', async () => {
    const projectId = await seedProject(db, `reforge-graph-repair-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const writeOutputs = [
      { title: 'Awakening', body: 'Evan Vale rose, yet Ye Fan lingered in the text.', discoveredNames: [] },
      {
        title: 'Awakening',
        body: cleanBody('The vale gate opened.'),
        summary: 'Evan wakes and claims the vale.',
        changes: { removals: ['cut the filler'] },
        carryState: { activeThreads: 'Mira spark' },
      },
    ];
    const graph = createChapterReforgeGraph(buildServices(db, checkpointer, [outline], writeOutputs, [cleanJudge, cleanJudge], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('reforged');
    expect(calls.filter(c => c.key === 'reforge-outline')).toHaveLength(1);
    const writeCalls = calls.filter(c => c.key === 'reforge-write');
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]?.inputs['repairNotes']).toBe('none');
    expect(String(writeCalls[1]?.inputs['repairNotes'])).toContain('glossary_leftover');

    const reforge = await db.query.chapterReforges.findFirst({ where: and(eq(schema.chapterReforges.projectId, projectId), eq(schema.chapterReforges.chapter, 1)) });
    expect(reforge).toMatchObject({ status: 'reforged', issues: null, carryState: { activeThreads: 'Mira spark' }, revision: 1 });
    // The outline is persisted as the fidelity anchor; the judge verdict rides alongside it.
    expect((reforge?.sourceBeats as { beats: unknown[] })?.beats).toHaveLength(1);
    expect((reforge?.fidelity as { verdict: string })?.verdict).toBe('clean');
    expect(reforge?.wordCount).toBeGreaterThan(0);
  });

  it('should persist a still-dirty reforge as attention with merged fidelity issues and keep going', async () => {
    const projectId = await seedProject(db, `reforge-graph-attention-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const dirtyJudge = {
      verdict: 'issues',
      coveredBeats: 0,
      totalBeats: 1,
      missingBeats: ['the duel'],
      issues: [{ type: 'missing_beat', detail: 'the duel is gone', excerpt: 'the duel' }],
    };
    const writeOutputs = [
      { title: 'Awakening', body: cleanBody('First pass.') },
      { title: 'Awakening', body: cleanBody('Second pass.') },
    ];
    const graph = createChapterReforgeGraph(buildServices(db, checkpointer, [outline], writeOutputs, [dirtyJudge, dirtyJudge], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('attention');
    expect(calls.filter(c => c.key === 'reforge-write')).toHaveLength(2);
    expect(calls.filter(c => c.key === 'reforge-judge')).toHaveLength(2);

    const reforge = await db.query.chapterReforges.findFirst({ where: and(eq(schema.chapterReforges.projectId, projectId), eq(schema.chapterReforges.chapter, 1)) });
    expect(reforge?.status).toBe('attention');
    expect(reforge?.issues).toEqual([{ source: 'fidelity', type: 'missing_beat', detail: 'the duel is gone', excerpt: 'the duel' }]);
  });

  it('should merge discovered names without overwriting existing mappings and skip the judge when disabled', async () => {
    const projectId = await seedProject(db, `reforge-graph-merge-${Date.now()}`, { judgeEnabled: false });
    const calls: ScriptedCall[] = [];
    const writeOutputs = [
      {
        title: 'Awakening',
        body: cleanBody('Liam Vey arrived.'),
        discoveredNames: [
          { sourceName: 'Li Wei', variants: ['Liwei'], replacement: 'Liam Vey', category: 'character', notes: 'rival' },
          { sourceName: 'Ye Fan', replacement: 'SHOULD-NOT-WIN', category: 'character' },
        ],
      },
    ];
    const graph = createChapterReforgeGraph(buildServices(db, checkpointer, [outline], writeOutputs, [], calls));

    const runId = randomUUID();
    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    expect(calls.filter(c => c.key === 'reforge-judge')).toHaveLength(0);
    const entries = await db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId), orderBy: [schema.rebrandGlossary.sourceName] });
    expect(entries).toHaveLength(3);
    const liWei = entries.find(e => e.sourceName === 'Li Wei');
    expect(liWei).toMatchObject({ replacement: 'Liam Vey', createdChapter: 1 });
    const yeFan = entries.find(e => e.sourceName === 'Ye Fan');
    expect(yeFan?.replacement).toBe('Evan Vale');

    // Judge disabled → the persisted fidelity verdict is null but the row is still reforged.
    const reforge = await db.query.chapterReforges.findFirst({ where: and(eq(schema.chapterReforges.projectId, projectId), eq(schema.chapterReforges.chapter, 1)) });
    expect(reforge).toMatchObject({ status: 'reforged', fidelity: null });
  });
});
