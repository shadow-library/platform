import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ToolRegistryService } from '@modules/ai/tools';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { IdeationTurnRegistrar } from '@modules/ideation/ideation-turn.registrar';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { ChatTurnRegistry } from '@modules/refinement/chat-turn.registry';
import { ChatService } from '@modules/refinement/chat.service';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_ideation_chat_guards`;

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

describe.if(pgAvailable)('ChatService ideation guards', () => {
  let db: PrimaryDatabase;
  let chat: ChatService;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;

    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const workflowRuns = new WorkflowRunService(databaseService, noop, noop, noop, noop, noop);
    const modelRouter = { structured: noop, resolveModel: () => ({ provider: 'openrouter', model: 'x-ai/grok-4.6' }) } as never;
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
    );

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `ideation-chat-guards-${Date.now()}`, kind: 'new_novel', premise: 'revenge cultivation' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('rejects creating a chat session with scopeType ideation', async () => {
    expect(await codeOf(chat.createSession(projectId, { scopeType: 'ideation' }))).toBe('IDE_005');
  });

  it('rejects a turn on an existing ideation-scope session', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'ideation', mode: 'manual' }).returning();
    if (!session) throw new Error('failed to seed session');

    expect(await codeOf(chat.turn(projectId, session.id, 'hello'))).toBe('IDE_005');
  });
});

describe('IdeationTurnRegistrar', () => {
  it('hands the ideation scope to the studio and leaves every other scope to the chat turn', () => {
    const registry = new ChatTurnRegistry();
    const turn = mock(async () => ({}) as never);
    new IdeationTurnRegistrar(registry, { turn } as never).onModuleInit();

    expect(registry.get('project')).toBeUndefined();
    void registry.get('ideation')?.(1n, 'session', 'hello');
    expect(turn).toHaveBeenCalledWith(1n, 'session', 'hello');
  });
});
