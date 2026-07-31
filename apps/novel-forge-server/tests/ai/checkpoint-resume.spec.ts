/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
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
const dbName = `${baseConnectionString.split('/').pop()}_checkpoint_resume`;

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

// Minimal stub services: everything the chapter-generation graph touches except the real db + checkpointer.
function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, calls: { generation: number; judge: number }) {
  const modelRouter = {
    structured: async (promptModule: { key: string }) => {
      if (promptModule.key === 'generation') {
        calls.generation++;
        return { title: 'Chapter Title', body: 'The prose body of the chapter.', summary: 'A summary.', state: {} };
      }
      return { title: 'Chapter Title' };
    },
    // The judge node runs the tool loop, which calls model.bindTools(...).invoke(...). Throw once to
    // simulate a crash after persistDraft has already checkpointed, then succeed on resume.
    chatFor: () => ({
      bindTools: () => ({
        invoke: async () => {
          calls.judge++;
          if (calls.judge === 1) throw new Error('simulated crash inside judge');
          return new AIMessage(JSON.stringify({ verdict: 'consistent', findings: [] }));
        },
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return { db, contextAssembler, modelRouter, telemetry: {}, toolRegistry, indexingService: {}, checkpointer } as never;
}

describe.if(pgAvailable)('LangGraph checkpoint resume', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  it('resumes from the last checkpoint without re-running draftChapter after a crash', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `resume-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const calls = { generation: 0, judge: 0 };
    const graph = createChapterGenerationGraph(buildServices(db, checkpointer, calls));

    const runId = `resume-thread-${project.id}`;
    const config = { configurable: { thread_id: runId } };
    const input = { projectId: String(project.id), chapter: 1, volumeKey: '', guidance: '', autoFix: false, maxFixes: 3, runId };

    // First attempt: crashes in judge (after draftChapter + persistDraft have checkpointed).
    await expect(graph.invoke(input, config)).rejects.toThrow('simulated crash inside judge');
    expect(calls.generation).toBe(1);
    expect(calls.judge).toBe(1);

    // The draft was persisted before the crash, in the interim "generating" state.
    const midDraft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, project.id), eq(schema.drafts.chapter, 1)) });
    expect(midDraft?.reviewStatus).toBe('generating');

    // Resume on the same thread_id: only judge re-runs — draftChapter is NOT re-executed (no extra LLM spend).
    const finalState = (await graph.invoke(null, config)) as { outcome: string | null };
    expect(calls.generation).toBe(1);
    expect(calls.judge).toBe(2);
    expect(finalState.outcome).toBe('accepted');

    const finalDraft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, project.id), eq(schema.drafts.chapter, 1)) });
    expect(finalDraft?.reviewStatus).toBe('needs_review');
  });
});
