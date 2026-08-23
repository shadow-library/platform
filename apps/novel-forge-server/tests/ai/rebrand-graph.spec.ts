import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterRebrandGraph, routeAfterAudit } from '@modules/ai/graphs/chapter-rebrand.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface ScriptedCall {
  key: string;
  inputs: Record<string, unknown>;
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_rebrand_graph`;

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
const auditIssue = { source: 'audit' as const, type: 'naming', detail: 'y' };

// Scripted model: convert outputs pop off a queue, audit outputs off another; every call is recorded.
function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, convertOutputs: unknown[], auditOutputs: unknown[], calls: ScriptedCall[]) {
  const modelRouter = {
    structured: async (promptModule: { key: string }, inputs: Record<string, unknown>) => {
      calls.push({ key: promptModule.key, inputs });
      if (promptModule.key === 'rebrand-convert') return convertOutputs.shift();
      if (promptModule.key === 'rebrand-audit') return auditOutputs.shift();
      throw new Error(`unexpected prompt ${promptModule.key}`);
    },
  };
  const contextAssembler = {
    forRebrand: async () => ({
      id: null,
      rendered: 'STABLE-WORLD-NOTES\n\nVOLATILE-GLOSSARY-SLICE',
      renderedStable: 'STABLE-WORLD-NOTES',
      renderedVolatile: 'VOLATILE-GLOSSARY-SLICE',
    }),
  };
  return { db, contextAssembler, modelRouter, checkpointer } as never;
}

async function seedProject(db: PrimaryDatabase, name: string, settings: Record<string, unknown> | null = null) {
  const [project] = await db.insert(schema.projects).values({ name, kind: 'source' }).returning();
  if (!project) throw new Error('failed to seed project');
  await db.insert(schema.rebrands).values({ projectId: project.id, worldNotes: 'Veldram replaces every real nation.', directives: 'weave romance in', settings });
  await db.insert(schema.rebrandGlossary).values([
    { projectId: project.id, sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', createdChapter: 0 },
    { projectId: project.id, sourceName: 'Huaxia', replacement: 'Veldram', category: 'country', createdChapter: 0 },
  ]);
  await db.insert(schema.chapters).values({ projectId: project.id, number: 1, title: 'Awakening', content: 'Ye Fan woke beneath the Huaxia moon.', status: 'done' });
  return project.id;
}

const cleanAudit = { verdict: 'clean', issues: [] };
const cleanBody = (marker: string) => `Evan Vale rose in the land of Veldram. ${marker}`;

describe.if(pgAvailable)('chapter-rebrand graph', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  describe('routeAfterAudit', () => {
    it('should persist when clean, repair once on the first dirty attempt (default maxRepairs), and persist after', () => {
      expect(routeAfterAudit({ residueIssues: [], auditIssues: [], attempt: 0, settings: {} })).toBe('persist');
      expect(routeAfterAudit({ residueIssues: [residueIssue], auditIssues: [], attempt: 0, settings: {} })).toBe('repair');
      expect(routeAfterAudit({ residueIssues: [], auditIssues: [auditIssue], attempt: 0, settings: {} })).toBe('repair');
      expect(routeAfterAudit({ residueIssues: [residueIssue], auditIssues: [auditIssue], attempt: 1, settings: {} })).toBe('persist');
    });

    it('should honor settings.maxRepairs beyond the default of one', () => {
      expect(routeAfterAudit({ residueIssues: [residueIssue], auditIssues: [], attempt: 1, settings: { maxRepairs: 2 } })).toBe('repair');
      expect(routeAfterAudit({ residueIssues: [residueIssue], auditIssues: [], attempt: 2, settings: { maxRepairs: 2 } })).toBe('persist');
      expect(routeAfterAudit({ residueIssues: [residueIssue], auditIssues: [], attempt: 0, settings: { maxRepairs: 0 } })).toBe('persist');
    });
  });

  it('should repair a dirty conversion once and persist the clean result as converted', async () => {
    const projectId = await seedProject(db, `rebrand-graph-repair-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const convertOutputs = [
      { title: 'Awakening', body: 'Evan Vale rose, yet Ye Fan lingered in the text.', discoveredNames: [] },
      { title: 'Awakening', body: cleanBody('The gate opened.'), summaryOfChanges: 'renamed everything', carryState: { activeThreads: 'Mira spark' } },
    ];
    const graph = createChapterRebrandGraph(buildServices(db, checkpointer, convertOutputs, [cleanAudit, cleanAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as {
      outcome: string | null;
    };

    expect(state.outcome).toBe('converted');
    const convertCalls = calls.filter(c => c.key === 'rebrand-convert');
    expect(convertCalls).toHaveLength(2);
    expect(convertCalls[0]?.inputs['repairNotes']).toBe('none');
    expect(String(convertCalls[1]?.inputs['repairNotes'])).toContain('glossary_leftover');
    // The cached var must carry the pack's stable segment alone — the per-chapter glossary/carry
    // state travels separately, or the cache misses on every chapter.
    for (const call of convertCalls) {
      expect(call.inputs['stableContext']).toBe('STABLE-WORLD-NOTES');
      expect(call.inputs['volatileContext']).toBe('VOLATILE-GLOSSARY-SLICE');
    }

    const conversion = await db.query.chapterConversions.findFirst({ where: and(eq(schema.chapterConversions.projectId, projectId), eq(schema.chapterConversions.chapter, 1)) });
    expect(conversion).toMatchObject({ status: 'converted', issues: null, carryState: { activeThreads: 'Mira spark' }, revision: 1 });
  });

  it('should persist a still-dirty conversion as attention with merged issues and keep going', async () => {
    const projectId = await seedProject(db, `rebrand-graph-attention-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const dirtyAudit = { verdict: 'issues', issues: [{ type: 'naming', detail: 'Evan rendered as Evann once', excerpt: 'Evann' }] };
    const convertOutputs = [
      { title: 'Awakening', body: cleanBody('First pass.') },
      { title: 'Awakening', body: cleanBody('Second pass.') },
    ];
    const graph = createChapterRebrandGraph(buildServices(db, checkpointer, convertOutputs, [dirtyAudit, dirtyAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as {
      outcome: string | null;
    };

    expect(state.outcome).toBe('attention');
    expect(calls.filter(c => c.key === 'rebrand-convert')).toHaveLength(2);
    expect(calls.filter(c => c.key === 'rebrand-audit')).toHaveLength(2);

    const conversion = await db.query.chapterConversions.findFirst({ where: and(eq(schema.chapterConversions.projectId, projectId), eq(schema.chapterConversions.chapter, 1)) });
    expect(conversion?.status).toBe('attention');
    expect(conversion?.issues).toEqual([{ source: 'audit', type: 'naming', detail: 'Evan rendered as Evann once', excerpt: 'Evann' }]);
  });

  it('should merge discovered names without overwriting existing mappings and skip the audit when disabled', async () => {
    const projectId = await seedProject(db, `rebrand-graph-merge-${Date.now()}`, { auditEnabled: false });
    const calls: ScriptedCall[] = [];
    const convertOutputs = [
      {
        title: 'Awakening',
        body: cleanBody('Liam Vey arrived.'),
        discoveredNames: [
          { sourceName: 'Li Wei', variants: ['Liwei'], replacement: 'Liam Vey', category: 'character', notes: 'rival' },
          { sourceName: 'Ye Fan', replacement: 'SHOULD-NOT-WIN', category: 'character' },
        ],
      },
    ];
    const graph = createChapterRebrandGraph(buildServices(db, checkpointer, convertOutputs, [], calls));

    const runId = randomUUID();
    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    expect(calls.filter(c => c.key === 'rebrand-audit')).toHaveLength(0);
    const entries = await db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId), orderBy: [schema.rebrandGlossary.sourceName] });
    expect(entries).toHaveLength(3);
    const liWei = entries.find(e => e.sourceName === 'Li Wei');
    expect(liWei).toMatchObject({ replacement: 'Liam Vey', createdChapter: 1 });
    const yeFan = entries.find(e => e.sourceName === 'Ye Fan');
    expect(yeFan?.replacement).toBe('Evan Vale');
  });

  it('should honor settings.maxRepairs and keep repairing past the default of one', async () => {
    const projectId = await seedProject(db, `rebrand-graph-maxrepairs-${Date.now()}`, { maxRepairs: 2 });
    const calls: ScriptedCall[] = [];
    const dirtyAudit = { verdict: 'issues', issues: [{ type: 'naming', detail: 'still wrong', excerpt: 'x' }] };
    const convertOutputs = [
      { title: 'Awakening', body: cleanBody('First pass.') },
      { title: 'Awakening', body: cleanBody('Second pass.') },
      { title: 'Awakening', body: cleanBody('Third pass.') },
    ];
    const graph = createChapterRebrandGraph(buildServices(db, checkpointer, convertOutputs, [dirtyAudit, dirtyAudit, dirtyAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('attention');
    expect(calls.filter(c => c.key === 'rebrand-convert')).toHaveLength(3);
    expect(calls.filter(c => c.key === 'rebrand-audit')).toHaveLength(3);
  });
});
