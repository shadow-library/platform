import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_repair_ladder`;

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

function buildServices(db: PrimaryDatabase, seenMessages: BaseMessage[][]) {
  let judgeCall = 0;

  const modelRouter = {
    structured: async (promptModule: { key: string }) => {
      if (promptModule.key === 'generation') return { title: 'Chapter Title', body: FULL_LENGTH_DRAFT_BODY, summary: 'A summary.', state: {} };
      if (promptModule.key === 'fix') return { action: 'patch', patches: [{ find: 'prose', replace: 'prose' }] };
      return { title: 'Chapter Title' };
    },
    chatFor: () => ({
      bindTools: () => ({
        invoke: async (messages: BaseMessage[]) => {
          seenMessages.push(messages);
          const call = judgeCall;
          judgeCall++;
          return new AIMessage(JSON.stringify({ verdict: 'contradiction', findings: [{ severity: 'hard', text: `distinct finding #${call}` }] }));
        },
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return { db, contextAssembler, modelRouter, telemetry: {}, toolRegistry, indexingService: {}, checkpointer: new MemorySaver() } as never;
}

describe.if(pgAvailable)('repair ladder accounting', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `repair-ladder-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('counts successful patch attempts against maxFixes and falls back to acceptAsIs', async () => {
    const projectId = await seedProject();
    const seenMessages: BaseMessage[][] = [];
    const services = buildServices(db, seenMessages);
    const graph = createChapterGenerationGraph(services);

    const runId = `repair-ladder-patch-${projectId}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: true, maxFixes: 2, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null; attempt: number; nodeTrace: string[] };

    expect(seenMessages.length).toBe(3);
    expect(finalState.attempt).toBe(2);
    expect(finalState.outcome).toBe('accepted_with_findings');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.reviewStatus).toBe('contradiction');

    // The real repair-ladder path, not a hardcoded happy-path list (D38): two patch detours plus
    // three judge visits must actually show up, in order, ending on the fallback node.
    expect(finalState.nodeTrace.filter(n => n === 'repairPatch')).toHaveLength(2);
    expect(finalState.nodeTrace.filter(n => n === 'judge')).toHaveLength(3);
    expect(finalState.nodeTrace.at(-1)).toBe('finish');
    expect(finalState.nodeTrace.at(-2)).toBe('acceptAsIs');
    expect(finalState.nodeTrace).toEqual([
      'assembleContext',
      'draftChapter',
      'persistDraft',
      'mechanicalCheck',
      'judge',
      'repairPatch',
      'persistDraft',
      'mechanicalCheck',
      'judge',
      'repairPatch',
      'persistDraft',
      'mechanicalCheck',
      'judge',
      'acceptAsIs',
      'finish',
    ]);
  });
});
