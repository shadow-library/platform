import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type TelemetryContext } from '@modules/ai/telemetry.handler';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
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
          return new AIMessage(
            JSON.stringify({
              verdict: 'contradiction',
              findings: [{ severity: 'hard', text: `distinct finding #${call}` }],
              briefCompliance: { compliant: true, issues: [] },
            }),
          );
        },
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
    resolveFor: async () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return {
    db,
    contextAssembler,
    modelRouter,
    telemetry: {},
    toolRegistry,
    indexingService: {},
    pluginPolicy: noPluginPolicy(),
    checkpointer: new MemorySaver(),
  } as never;
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

    // The real repair-ladder path, not a hardcoded happy-path list: two patch detours plus
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

  function buildRewriteServices(db: PrimaryDatabase, seenFixCtx: TelemetryContext[]) {
    let judgeCall = 0;

    const structured = mock(async (promptModule: { key: string }, _input: unknown, ctx: TelemetryContext) => {
      if (promptModule.key === 'fix') {
        seenFixCtx.push(ctx);
        return { action: 'rewrite', body: FULL_LENGTH_DRAFT_BODY };
      }
      if (promptModule.key === 'generation') return { title: 'Chapter Title', body: FULL_LENGTH_DRAFT_BODY, summary: 'A summary.', state: {} };
      return { title: 'Chapter Title' };
    });

    const modelRouter = {
      structured,
      chatFor: () => ({
        bindTools: () => ({
          invoke: async () => {
            const call = judgeCall;
            judgeCall++;
            if (call === 0) {
              return new AIMessage(
                JSON.stringify({ verdict: 'contradiction', findings: [{ severity: 'hard', text: 'needs a rewrite' }], briefCompliance: { compliant: true, issues: [] } }),
              );
            }
            return new AIMessage(JSON.stringify({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } }));
          },
        }),
      }),
      resolveModel: () => ({ provider: 'test', model: 'test' }),
      resolveFor: async () => ({ provider: 'test', model: 'test' }),
    };

    const contextAssembler = { forChapter: async () => ({ id: null }) };
    const toolRegistry = { forNode: () => [], getRaw: () => [] };

    return {
      db,
      contextAssembler,
      modelRouter,
      telemetry: {},
      toolRegistry,
      indexingService: {},
      pluginPolicy: noPluginPolicy(),
      checkpointer: new MemorySaver(),
    } as never;
  }

  it("should log the fix prompt's real version and record a rewrite repair as 'rewritten'", async () => {
    const projectId = await seedProject();
    const seenFixCtx: TelemetryContext[] = [];
    const services = buildRewriteServices(db, seenFixCtx);
    const graph = createChapterGenerationGraph(services);

    const runId = `repair-ladder-rewrite-${projectId}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: true, maxFixes: 2, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null; nodeTrace: string[] };

    expect(finalState.outcome).toBe('accepted');
    expect(seenFixCtx).toHaveLength(1);
    expect(seenFixCtx[0]?.promptVersion).toBe(PROMPT_REGISTRY.fix.version);
    expect(seenFixCtx[0]?.promptVersion).not.toBe('1.0.0');

    const revisions = await db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.projectId, projectId), orderBy: [schema.draftRevisions.revision] });
    expect(revisions.map(r => r.source)).toEqual(['generated', 'rewritten']);
  });
});
