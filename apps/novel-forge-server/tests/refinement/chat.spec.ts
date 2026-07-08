/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { SQL } from 'bun';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ChatService } from '@modules/refinement/chat.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
    return err instanceof AppError ? err.getCode() : String(err);
  }
}

describe.if(pgAvailable)('ChatService', () => {
  let db: PrimaryDatabase;
  let chat: ChatService;
  let projectId: bigint;
  const structuredMock = mock<() => Promise<unknown>>(async () => ({ reply: 'stub' }));

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;

    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const workflowRuns = new WorkflowRunService(databaseService, noop, noop, noop, noop, noop);
    const modelRouter = { structured: structuredMock } as never;
    chat = new ChatService(databaseService, assembler, modelRouter, workflowRuns, new ProposalService(databaseService));

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

  it('validates scope refs at session creation', async () => {
    expect(await codeOf(chat.createSession(projectId, { scopeType: 'volume', scopeRef: 'volume:missing' }))).toBe('CHT_003');
    expect(await codeOf(chat.createSession(projectId, { scopeType: 'arc', scopeRef: 'volume:v1' }))).toBe('CHT_003');
    const session = await chat.createSession(projectId, { scopeType: 'volume', scopeRef: 'volume:v1', title: 'refine v1' });
    expect(session).toMatchObject({ status: 'active', scopeRef: 'volume:v1', summaryThroughOrdinal: 0 });
  });

  it('runs a full turn: messages persisted, proposal staged, run recorded', async () => {
    const session = await chat.createSession(projectId, { scopeType: 'volume', scopeRef: 'volume:v1' });
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

    // The structured call received the stable pack + playbook + the user message.
    const input = structuredMock.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, string>;
    expect(input['stableContext']).toContain('survive');
    expect(input['scopeInstructions']).toContain('Only this volume may change');
    expect(input['userMessage']).toContain('grip harder');
  });

  it('returns no proposal for discussion-only turns and rejects archived sessions', async () => {
    const session = await chat.createSession(projectId, { scopeType: 'novel' });
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
    const session = await chat.createSession(projectId, { scopeType: 'volume', scopeRef: 'volume:v1' });

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
});
