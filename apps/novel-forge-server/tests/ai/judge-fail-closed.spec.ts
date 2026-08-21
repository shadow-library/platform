import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_judge_fail_closed`;

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

function buildServices(db: PrimaryDatabase, judgeReplies: (string | null)[], seenMessages: BaseMessage[][]) {
  let judgeCall = 0;

  const modelRouter = {
    structured: async (promptModule: { key: string }) => {
      if (promptModule.key === 'generation') return { title: 'Chapter Title', body: 'The prose body of the chapter.', summary: 'A summary.', state: {} };
      return { title: 'Chapter Title' };
    },
    chatFor: () => ({
      bindTools: () => ({
        invoke: async (messages: BaseMessage[]) => {
          seenMessages.push(messages);
          const reply = judgeReplies[judgeCall];
          judgeCall++;
          return new AIMessage(reply ?? 'not json at all');
        },
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return { db, contextAssembler, modelRouter, telemetry: {}, toolRegistry, indexingService: {}, checkpointer: new MemorySaver() } as never;
}

describe.if(pgAvailable)('judge fail-closed behavior', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `judge-fail-closed-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('retries the judge once and accepts on a valid retry reply', async () => {
    const projectId = await seedProject();
    const seenMessages: BaseMessage[][] = [];
    const services = buildServices(db, [null, JSON.stringify({ verdict: 'consistent', findings: [] })], seenMessages);
    const graph = createChapterGenerationGraph(services);

    const runId = `judge-retry-${projectId}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: false, maxFixes: 3, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(seenMessages.length).toBe(2);
    expect(finalState.outcome).toBe('accepted');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judge).toBe('consistent');
    expect(draft?.reviewStatus).toBe('needs_review');
  });

  it('routes to human review and never resolves to consistent when the judge output is unparseable twice', async () => {
    const projectId = await seedProject();
    const seenMessages: BaseMessage[][] = [];
    const services = buildServices(db, [null, null], seenMessages);
    const graph = createChapterGenerationGraph(services);

    const runId = `judge-unparseable-${projectId}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: true, maxFixes: 3, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(seenMessages.length).toBe(2);
    expect(finalState.outcome).toBe('awaiting_review');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judge).toBe('evaluation_failed');
    expect(draft?.judge).not.toBe('consistent');
    expect(draft?.reviewStatus).toBe('contradiction');
    expect(draft?.judgeNote).toContain('judge output unparseable');
  });

  it('prepends the judge few-shots to the in-graph judge prompt, matching the standalone path', async () => {
    const projectId = await seedProject();
    const seenMessages: BaseMessage[][] = [];
    const services = buildServices(db, [JSON.stringify({ verdict: 'consistent', findings: [] })], seenMessages);
    const graph = createChapterGenerationGraph(services);

    const runId = `judge-fewshots-${projectId}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: false, maxFixes: 3, runId };
    await graph.invoke(input, { configurable: { thread_id: runId } });

    const fewShots = PROMPT_REGISTRY.judge.fewShots ?? [];
    expect(fewShots.length).toBeGreaterThan(0);
    const firstCallMessages = seenMessages[0] ?? [];
    for (const [index, fewShot] of fewShots.entries()) expect(firstCallMessages[index]?.content).toEqual(fewShot.content);
  });
});
