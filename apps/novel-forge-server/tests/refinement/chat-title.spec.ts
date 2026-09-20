import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type ProjectEvent, ProjectEventService } from '@modules/events';
import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ToolRegistryService } from '@modules/ai/tools';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { ChatService } from '@modules/refinement/chat.service';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { type PrimaryDatabase, schema } from '@server/database';
import { runCancellationStub } from '@tests/fixtures/model-router';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chat_title`;

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

async function waitUntil(predicate: () => Promise<boolean>, attempts = 300): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await predicate()) return true;
    await Bun.sleep(10);
  }
  return false;
}

describe.if(pgAvailable)('ChatService — session naming (C2)', () => {
  let db: PrimaryDatabase;
  let chat: ChatService;
  let projectId: bigint;
  const structuredMock = mock<(...args: unknown[]) => Promise<unknown>>(async () => ({ reply: 'stub' }));
  const events = new ProjectEventService();

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;

    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const workflowRuns = new WorkflowRunService(databaseService, noop, runCancellationStub() as never, noop, noop, noop, noop, events);
    const modelRouter = {
      structured: structuredMock,
      resolveModel: () => ({ provider: 'openrouter', model: 'x-ai/grok-4.6' }),
      resolveFor: async () => ({ provider: 'openrouter', model: 'x-ai/grok-4.6' }),
    } as never;
    const applier = new ProposalApplyService(databaseService, new ActionExecutorRegistry());
    chat = new ChatService(
      databaseService,
      assembler,
      modelRouter,
      workflowRuns,
      new ProposalService(databaseService),
      applier,
      new ToolRegistryService(),
      noop,
      new ChatCompactionService(databaseService, modelRouter, workflowRuns),
      noPluginPolicy(),
      events,
    );

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `chat-title-${Date.now()}`, kind: 'new_novel', premise: 'revenge cultivation' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function titleOf(sessionId: string): Promise<string | null> {
    const row = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, sessionId) });
    return row?.title ?? null;
  }

  async function waitForTitleRun(sessionId: string) {
    await waitUntil(async () => {
      const run = await db.query.workflowRuns.findFirst({
        where: and(eq(schema.workflowRuns.graph, 'chat-title'), eq(schema.workflowRuns.target, `session:${sessionId}`)),
        orderBy: desc(schema.workflowRuns.id),
      });
      return Boolean(run) && run?.status !== 'running';
    });
    return db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.graph, 'chat-title'), eq(schema.workflowRuns.target, `session:${sessionId}`)),
      orderBy: desc(schema.workflowRuns.id),
    });
  }

  it('names the session in the background on the first turn, from the opening message alone, without delaying the reply', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'Sure, let’s dig in.' }));
    structuredMock.mockImplementationOnce(async () => ({ title: 'Volume 1 pacing' }));

    const published: ProjectEvent[] = [];
    const unsubscribe = events.subscribe(projectId, event => published.push(event));

    const result = await chat.turn(projectId, session.id, 'how do I make volume 1 grip harder?');
    expect(result.assistantMessage.content).toBe('Sure, let’s dig in.');
    // The turn itself never sees the title land — it resolves before the naming run necessarily does.

    const run = await waitForTitleRun(session.id);
    unsubscribe();

    expect(run).toMatchObject({ status: 'completed' });
    expect(await titleOf(session.id)).toBe('Volume 1 pacing');
    expect(published.some(event => event.type === 'chat' && event.sessionId === session.id)).toBe(true);
  });

  it('does not name a session whose title is already set', async () => {
    const session = await chat.createSession(projectId, {});
    await db.update(schema.chatSessions).set({ title: 'Already named' }).where(eq(schema.chatSessions.id, session.id));
    structuredMock.mockImplementationOnce(async () => ({ reply: 'Noted.' }));

    await chat.turn(projectId, session.id, 'this opener is long enough to qualify for naming');

    const fired = await waitUntil(async () => {
      const run = await db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.graph, 'chat-title'), eq(schema.workflowRuns.target, `session:${session.id}`)) });
      return Boolean(run);
    }, 20);
    expect(fired).toBe(false);
    expect(await titleOf(session.id)).toBe('Already named');
  });

  it('does not name on a second turn, even once the title-eligible content and null title both hold again', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'ok' }));
    await chat.turn(projectId, session.id, 'hi'); // first turn: too short to name, title stays null

    structuredMock.mockImplementationOnce(async () => ({ reply: 'Here is a much longer reply to a longer message.' }));
    await chat.turn(projectId, session.id, 'this second message is easily long enough to qualify');

    const fired = await waitUntil(async () => {
      const run = await db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.graph, 'chat-title'), eq(schema.workflowRuns.target, `session:${session.id}`)) });
      return Boolean(run);
    }, 20);
    expect(fired).toBe(false);
    expect(await titleOf(session.id)).toBeNull();
  });

  it('does not name the session for a trivial opener under 15 characters', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'On it.' }));

    await chat.turn(projectId, session.id, 'fix this');

    const fired = await waitUntil(async () => {
      const run = await db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.graph, 'chat-title'), eq(schema.workflowRuns.target, `session:${session.id}`)) });
      return Boolean(run);
    }, 20);
    expect(fired).toBe(false);
    expect(await titleOf(session.id)).toBeNull();
  });

  it('never clobbers a title the author sets while the naming call is still in flight', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'On it.' }));
    let releaseGate!: () => void;
    const gate = new Promise<void>(resolve => (releaseGate = resolve));
    structuredMock.mockImplementationOnce(async () => {
      await gate;
      return { title: 'Model-picked title' };
    });

    await chat.turn(projectId, session.id, 'what should I do with the villain arc this volume?');

    // The author renames mid-flight, before the naming call's model response even returns. This proves
    // the title is re-checked after the model returns, not that the check is atomic with the write — a
    // read-then-write that re-read post-call would pass this test identically.
    await chat.updateSession(projectId, session.id, { title: 'Author chosen title' });
    releaseGate();

    const run = await waitForTitleRun(session.id);
    expect(run).toMatchObject({ status: 'completed' });
    expect(await titleOf(session.id)).toBe('Author chosen title');
  });

  it('swallows a naming failure — the turn still succeeds and the title stays null', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'All good.' }));
    structuredMock.mockImplementationOnce(async () => {
      throw new Error('model quota exceeded');
    });

    const result = await chat.turn(projectId, session.id, 'what should the villain actually want, really?');
    expect(result.assistantMessage.content).toBe('All good.');

    const run = await waitForTitleRun(session.id);
    expect(run).toMatchObject({ status: 'failed' });
    expect(await titleOf(session.id)).toBeNull();
  });
});
