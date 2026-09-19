import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { type ProjectEvent, ProjectEventService } from '@modules/events';
import { CatalogService } from '@modules/ai/context/catalog.service';
import { CHAT_HUB_BUDGET, ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ToolRegistryService } from '@modules/ai/tools';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { ChatService } from '@modules/refinement/chat.service';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { AppErrorCode } from '@server/classes';
import { type PrimaryDatabase, schema } from '@server/database';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chat_turn`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

describe.if(pgAvailable)('ChatService', () => {
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
    const workflowRuns = new WorkflowRunService(databaseService, noop, noop, noop, noop, noop, noop, events);
    const modelRouter = {
      // The unawaited chat-title call (fired alongside every first turn whose opener qualifies) is
      // dispatched here, before it ever reaches structuredMock — otherwise it would race the turn's own
      // calls for entries queued via mockImplementationOnce.
      structured: (promptModule: { key: string }, ...rest: unknown[]) =>
        promptModule.key === 'chat-title' ? Promise.resolve({ title: 'Auto title' }) : structuredMock(promptModule, ...rest),
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
      .values({ name: `chat-${Date.now()}`, kind: 'new_novel', premise: 'revenge cultivation' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
    await db
      .insert(schema.volumes)
      .values({ projectId, volumeKey: 'v1', ordinal: 1, objective: 'survive', status: 'approved', targetChapterCount: 10, startChapter: 1, endChapter: 10 });
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('creates every new session in project scope regardless of what the caller asks for', async () => {
    const session = await chat.createSession(projectId, {});
    expect(session).toMatchObject({ status: 'active', scopeType: 'project', scopeRef: null, title: null, mode: 'manual', summaryThroughOrdinal: 0 });
  });

  it('still validates scope refs on turn() for legacy scoped sessions', async () => {
    const [badVolume] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'volume', scopeRef: 'volume:missing' }).returning();
    if (!badVolume) throw new Error('failed to seed session');
    expect(await codeOf(chat.turn(projectId, badVolume.id, 'hello'))).toBe('CHT_003');

    const [badArc] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'arc', scopeRef: 'volume:v1' }).returning();
    if (!badArc) throw new Error('failed to seed session');
    expect(await codeOf(chat.turn(projectId, badArc.id, 'hello'))).toBe('CHT_003');
  });

  it('runs a full turn: messages persisted, proposal staged, run recorded', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'volume', scopeRef: 'volume:v1' }).returning();
    if (!session) throw new Error('failed to seed session');
    structuredMock.mockImplementationOnce(async () => ({
      reply: 'Raise the stakes: make the trial lethal.',
      changeSet: [{ op: 'volume.upsert', volumeKey: 'v1', objective: 'survive the lethal trials' }],
    }));

    const result = await chat.turn(projectId, session.id, 'how do I make volume 1 grip harder?');

    expect(result.userMessage).toMatchObject({ ordinal: 1, role: 'user' });
    expect(result.assistantMessage).toMatchObject({ ordinal: 2, role: 'assistant', proposalId: result.proposal?.id });
    expect(result.proposal).toMatchObject({ status: 'pending', kind: 'chat', scopeType: 'volume', scopeRef: 'volume:v1' });
    expect(result.proposal?.baseline).toHaveProperty('volume:v1');

    const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
    expect(run).toMatchObject({ graph: 'chat-turn', status: 'completed' });
    // The turn links its context pack so the run detail can explain where the input tokens went.
    expect(run?.contextPackId).not.toBeNull();

    // The structured call received the stable pack + playbook + the user message.
    const input = structuredMock.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, string>;
    expect(input['stableContext']).toContain('survive');
    // A legacy volume-scoped session now gets the hub playbook, not its old narrower one (chat-revamp design D1/A2).
    expect(input['scopeInstructions']).toContain("showrunner's right hand");
    expect(input['userMessage']).toContain('grip harder');
  });

  it('recovers an in-flight turn: the user message is persisted and pendingTurn is true while the model runs', async () => {
    const session = await chat.createSession(projectId, {});

    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    structuredMock.mockImplementationOnce(async () => {
      await gate;
      return { reply: 'done thinking' };
    });

    const turnPromise = chat.turn(projectId, session.id, 'take your time');

    // A second tab (or a refresh) loading the session mid-turn sees the user message and a pending run.
    let mid = await chat.listMessages(projectId, session.id, {});
    for (let i = 0; i < 200 && mid.length === 0; i++) {
      await Bun.sleep(10);
      mid = await chat.listMessages(projectId, session.id, {});
    }
    expect(mid.map(m => m.role)).toEqual(['user']);
    expect(mid[0]?.content).toBe('take your time');
    expect(await chat.hasPendingTurn(projectId, session.id)).toBe(true);

    release();
    await turnPromise;

    // Once the reply lands, the run completes and the indicator clears.
    const done = await chat.listMessages(projectId, session.id, {});
    expect(done.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(await chat.hasPendingTurn(projectId, session.id)).toBe(false);
  });

  it('should clear the pending turn and report the failure code when the model call fails', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => {
      throw AppErrorCode.AI_007.create();
    });

    const published: ProjectEvent[] = [];
    const unsubscribe = events.subscribe(projectId, event => published.push(event));

    expect(await codeOf(chat.turn(projectId, session.id, 'is anyone there?'))).toBe('AI_007');
    unsubscribe();

    expect(await chat.hasPendingTurn(projectId, session.id)).toBe(false);
    expect(await chat.failedTurn(projectId, session.id)).toMatchObject({ graph: 'chat-turn', code: 'AI_007' });
    // Ignores the background chat-title run's own events (this opener also qualifies for naming) — this
    // assertion is about the chat-turn run's lifecycle, not everything the project channel saw.
    const turnEvents = published.filter(event => event.type !== 'run' || event.graph === 'chat-turn');
    expect(turnEvents.map(event => (event.type === 'run' ? `run:${event.status}` : event.type))).toEqual(['run:running', 'chat', 'run:failed']);
  });

  it('should still report a failed turn whose message the database stamped later than the app stamped the failure', async () => {
    const session = await chat.createSession(projectId, {});
    const failedAt = new Date();
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({ projectId, graph: 'chat-turn', target: `session:${session.id}`, status: 'failed', input: {}, nodeTrace: [], startedAt: failedAt, endedAt: failedAt })
      .returning();
    await db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId, ordinal: 1, role: 'user', content: 'hello?', runId: run?.id, createdAt: new Date(failedAt.getTime() + 1) });

    expect(await chat.failedTurn(projectId, session.id)).toMatchObject({ runId: run?.id });
  });

  it('should not report a failed turn once the author has sent a newer message', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => {
      throw AppErrorCode.AI_007.create();
    });
    await codeOf(chat.turn(projectId, session.id, 'first try'));
    await db.insert(schema.chatMessages).values({ sessionId: session.id, projectId, ordinal: 2, role: 'user', content: 'never sent to a run' });

    expect(await chat.failedTurn(projectId, session.id)).toBeNull();
  });

  it('should report a turn’s status and how far the transcript has got, without the transcript', async () => {
    const session = await chat.createSession(projectId, {});
    expect(await chat.turnStatus(projectId, session.id)).toEqual({ pendingTurn: null, failedTurn: null, lastOrdinal: 0 });

    structuredMock.mockImplementationOnce(async () => {
      throw AppErrorCode.AI_007.create();
    });
    await codeOf(chat.turn(projectId, session.id, 'still there?'));

    expect(await chat.turnStatus(projectId, session.id)).toMatchObject({ pendingTurn: null, failedTurn: { code: 'AI_007' }, lastOrdinal: 1 });
  });

  it('returns no proposal for discussion-only turns and rejects archived sessions', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'Just thoughts, no changes yet.' }));

    const result = await chat.turn(projectId, session.id, 'thoughts on pacing?');
    expect(result.proposal).toBeNull();
    expect(result.assistantMessage.proposalId).toBeNull();

    await chat.setSessionStatus(projectId, session.id, 'archived');
    expect(await codeOf(chat.turn(projectId, session.id, 'hello?'))).toBe('CHT_002');
    await chat.setSessionStatus(projectId, session.id, 'active');
    structuredMock.mockImplementationOnce(async () => ({ reply: 'back again' }));
    expect(await codeOf(chat.turn(projectId, session.id, 'hello again'))).toBe('NO_ERROR');
  });

  it('compacts history past the verbatim window and advances the watermark', async () => {
    const session = await chat.createSession(projectId, {});

    // 7 turns = 14 messages > MAX_VERBATIM_TURNS(12) → compaction triggers on the next turn.
    for (let i = 0; i < 7; i++) {
      structuredMock.mockImplementationOnce(async () => ({ reply: `assistant reply ${i}` }));
      await chat.turn(projectId, session.id, `user message ${i}`);
    }

    structuredMock.mockImplementationOnce(async () => ({ summary: 'Decisions: lethal trials accepted. Open: rival motivation.' }));
    structuredMock.mockImplementationOnce(async () => ({ reply: 'post-compaction reply' }));
    await chat.turn(projectId, session.id, 'one more');

    const updated = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, session.id) });
    expect(updated?.summary).toContain('lethal trials accepted');
    expect(updated?.summaryThroughOrdinal).toBe(8);

    // Full transcript intact — compaction is a read-time window, not deletion.
    const messages = await db.query.chatMessages.findMany({ where: and(eq(schema.chatMessages.sessionId, session.id)) });
    expect(messages.length).toBe(16);

    const compactRun = await db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.graph, 'chat-compact')) });
    expect(compactRun?.status).toBe('completed');
  });

  it('creates hub sessions defaulting to manual and switches mode via update', async () => {
    const session = await chat.createSession(projectId, {});
    expect(session).toMatchObject({ scopeType: 'project', scopeRef: null, title: null, mode: 'manual' });

    const flipped = await chat.updateSession(projectId, session.id, { mode: 'auto', title: 'hub (auto)' });
    expect(flipped).toMatchObject({ mode: 'auto', title: 'hub (auto)' });
  });

  it('hub manual turn stages a kind=hub proposal with the full vocabulary incl. actions', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({
      reply: 'Premise sharpened; kicking off a batch.',
      changeSet: [
        { op: 'premise.update', premise: 'hub-refined premise' },
        { op: 'action.generate_chapters', count: 2 },
      ],
    }));

    const result = await chat.turn(projectId, session.id, 'sharpen the premise and generate two chapters');
    expect(result.proposal).toMatchObject({ status: 'pending', kind: 'hub', scopeType: 'project' });
    expect(result.applied).toBeUndefined();

    // Manual mode: nothing landed.
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.premise).not.toBe('hub-refined premise');

    // The hub playbook rode along with lookup + action vocabularies.
    const input = structuredMock.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, string>;
    expect(input['scopeInstructions']).toContain('action.generate_chapters');
    expect(input['scopeInstructions']).toContain('Lookup tools available');
    expect(input['stableContext']).toContain('CANON CATALOG');
    expect(input['volatileContext']).toContain('Story cursor');
  });

  it('runs an ordinary hub turn on an empty project — the bootstrap interview is retired', async () => {
    const [fresh] = await db
      .insert(schema.projects)
      .values({ name: `chat-empty-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!fresh) throw new Error('failed to seed project');

    const session = await chat.createSession(fresh.id, {});
    await chat.turn(fresh.id, session.id, 'I want to write something');

    const input = structuredMock.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, string>;
    const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.projectId, fresh.id), orderBy: desc(schema.contextPacks.id) });
    expect(input['scopeInstructions']).not.toContain('Interview first');
    expect(input['scopeInstructions']).not.toContain('BOOTSTRAP');
    expect(pack?.budgetTokens).toBe(CHAT_HUB_BUDGET);
  });

  it('hub auto turn applies the change-set in the same request with autoApplied provenance', async () => {
    const session = await chat.createSession(projectId, { mode: 'auto' });
    structuredMock.mockImplementationOnce(async () => ({
      reply: 'Done — premise updated.',
      changeSet: [{ op: 'premise.update', premise: 'auto-applied premise' }],
    }));

    const result = await chat.turn(projectId, session.id, 'tighten the premise hook');
    expect(result.proposal).toMatchObject({ status: 'applied', autoApplied: true });
    expect(result.applied?.applied).toEqual([{ artifactRef: 'premise', newRevision: null }]);
    expect(result.applyNote).toBeUndefined();

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.premise).toBe('auto-applied premise');
  });

  it('auto turn declines a finalize action with a note instead of running it', async () => {
    const session = await chat.createSession(projectId, { mode: 'auto' });
    structuredMock.mockImplementationOnce(async () => ({
      reply: 'Finalizing everything.',
      changeSet: [{ op: 'premise.update', premise: 'a premise the turn keeps' }, { op: 'action.finalize' }],
    }));

    const result = await chat.turn(projectId, session.id, 'finalize the drafted chapters');
    expect(result.applied?.opResults.map(op => op.status)).toEqual(['applied', 'declined']);
    expect(result.applied?.opResults[1]?.note).toContain('never applied automatically');
    expect(result.applyNote).toContain('never applied automatically');
    expect((await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }))?.premise).toBe('a premise the turn keeps');
  });

  it('executes declared lookups between rounds and audits them in tool_calls', async () => {
    const session = await chat.createSession(projectId, {});
    structuredMock.mockImplementationOnce(async () => ({ reply: 'Checking the lore first.', lookups: [{ tool: 'search_lore', args: { query: 'axiom system' } }] }));
    structuredMock.mockImplementationOnce(async () => ({ reply: 'Answer grounded in lookups.' }));

    const result = await chat.turn(projectId, session.id, 'what does the canon say about the axiom system?');
    expect(result.assistantMessage.content).toBe('Answer grounded in lookups.');
    expect(result.proposal).toBeNull();

    // The retrieval stub throws inside the handler → audited as handler_error; the loop still folds
    // the error text back into the conversation and re-invokes.
    const audit = await db.query.toolCalls.findFirst({ where: eq(schema.toolCalls.runId, result.runId) });
    expect(audit).toMatchObject({ node: 'chat-hub', tool: 'search_lore', status: 'handler_error' });
  });

  it('caps lookup rounds and falls back to the final reply', async () => {
    const session = await chat.createSession(projectId, {});
    for (let i = 0; i < 4; i++) {
      structuredMock.mockImplementationOnce(async () => ({ reply: `still looking ${i}`, lookups: [{ tool: 'get_entity', args: { entityKey: 'hero' } }] }));
    }

    const result = await chat.turn(projectId, session.id, 'dig through everything');
    // 1 initial + 3 lookup rounds = 4 calls; the 4th still asked for lookups, so its reply stands alone.
    expect(result.assistantMessage.content).toBe('still looking 3');
    expect(result.proposal).toBeNull();
  });

  it('enforces maxCallsPerRun across lookup rounds, not per round (get_draft caps at 2 for the whole turn)', async () => {
    const session = await chat.createSession(projectId, {});
    for (let i = 0; i < 3; i++) {
      structuredMock.mockImplementationOnce(async () => ({ reply: `pulling draft ${i}`, lookups: [{ tool: 'get_draft', args: { chapter: 1 } }] }));
    }
    structuredMock.mockImplementationOnce(async () => ({ reply: 'grounded in the drafts I pulled' }));

    const result = await chat.turn(projectId, session.id, 'compare chapter 1 across every draft revision you can pull');
    expect(result.assistantMessage.content).toBe('grounded in the drafts I pulled');

    // 3 rounds each declare one get_draft call; a per-round budget (the pre-fix bug) would pass all
    // three since each round resets the counter. Enforced per-turn, the 3rd call is over budget.
    const calls = await db.query.toolCalls.findMany({ where: and(eq(schema.toolCalls.runId, result.runId), eq(schema.toolCalls.tool, 'get_draft')), orderBy: schema.toolCalls.id });
    expect(calls.map(c => c.status)).toEqual(['ok', 'ok', 'budget_exceeded']);
  });
});
