import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { ChatRefineSchema } from '@modules/ai/schemas/chat-refine.schema';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const CTX = { projectId: BigInt(1), runId: 'run-1', promptKey: 'chat-refine', promptVersion: '2.0.0', role: 'chat' };
const VALID = JSON.stringify({ reply: 'ok' });

const emptyTemplate = { formatMessages: async () => [] } as never;
const chatPrompt = {
  key: 'chat-refine' as const,
  version: '2.0.0',
  kind: 'analytical' as const,
  role: 'chat' as const,
  system: 'test',
  template: emptyTemplate,
  schema: ChatRefineSchema,
};

function stubRouterDb(): unknown {
  return {
    query: { llmCache: { findFirst: async () => undefined } },
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
  };
}

function makeRouter(client: unknown): ModelRouterService {
  const router = new ModelRouterService(
    {} as never,
    { getPostgresClient: () => stubRouterDb() } as never,
    { enforce: async () => undefined } as never,
    { defaultsFor: async () => undefined } as never,
  );
  (router as unknown as Record<string, unknown>)['buildClient'] = () => client;
  (router as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, error: () => undefined, warn: () => undefined, info: () => undefined };
  return router;
}

interface RunWrite {
  status: unknown;
  outcome: unknown;
  endedAt: unknown;
}

function makeWorkflowService(router: ModelRouterService): { service: WorkflowRunService; writes: RunWrite[] } {
  const writes: RunWrite[] = [];
  const db = {
    query: { workflowRuns: { findFirst: async () => undefined } },
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'run-1' }] }) }),
    update: () => ({
      set: (values: RunWrite) => ({
        where: () => ({
          returning: async () => {
            writes.push(values);
            return [{ projectId: BigInt(1), graph: 'chat-turn', target: 'session:1' }];
          },
        }),
      }),
    }),
  };
  const service = new WorkflowRunService(
    { getPostgresClient: () => db } as never,
    {} as never,
    router,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { publish: () => undefined } as never,
  );
  (service as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, error: () => undefined, warn: () => undefined, info: () => undefined };
  return { service, writes };
}

function registered(router: ModelRouterService): Map<string, AbortController> {
  return (router as unknown as { runAborts: Map<string, AbortController> }).runAborts;
}

describe('ModelRouterService cancellation registry', () => {
  it('should report no live run when aborting an unregistered runId', () => {
    const router = makeRouter({});
    expect(router.abortRun('nope')).toBe(false);
  });

  it('should abort a bound run and leave the signal aborted', () => {
    const router = makeRouter({});
    const signal = router.bindRunSignal('run-1');
    expect(signal.aborted).toBe(false);
    expect(router.abortRun('run-1')).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it('should return the same signal when a runId is bound twice', () => {
    const router = makeRouter({});
    expect(router.bindRunSignal('run-1')).toBe(router.bindRunSignal('run-1'));
  });

  it('should report no live run once the signal is released', () => {
    const router = makeRouter({});
    router.bindRunSignal('run-1');
    router.releaseRunSignal('run-1');
    expect(router.abortRun('run-1')).toBe(false);
  });
});

describe('ModelRouterService model call under cancellation', () => {
  it('should refuse the call and never reach the model when the run is already cancelled', async () => {
    let invokeCalls = 0;
    const router = makeRouter({ invoke: async () => ({ content: (invokeCalls++, VALID) }) });
    router.bindRunSignal('run-1');
    router.abortRun('run-1');

    await expect(router.structured(chatPrompt, {}, CTX)).rejects.toMatchObject({ code: 'AI_013' });
    expect(invokeCalls).toBe(0);
  });

  it('should not let the retry ladder re-attempt a call aborted mid-flight', async () => {
    let invokeCalls = 0;
    const router = makeRouter({
      invoke: async () => {
        invokeCalls++;
        router.abortRun('run-1');
        throw new Error('aborted');
      },
    });
    router.bindRunSignal('run-1');

    await expect(router.structured(chatPrompt, {}, CTX)).rejects.toMatchObject({ code: 'AI_013' });
    expect(invokeCalls).toBe(1);
  });

  it('should pass the run signal to the model so a provider can abort mid-call', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const router = makeRouter({
      invoke: async (_messages: unknown, options: { signal?: AbortSignal }) => {
        seen.push(options.signal);
        return { content: VALID };
      },
    });
    const signal = router.bindRunSignal('run-1');

    await router.structured(chatPrompt, {}, CTX);
    expect(seen).toEqual([signal]);
  });

  it('should discard a partial stream rather than feeding it to the repair ladder', async () => {
    let invokeCalls = 0;
    const router = makeRouter({
      stream: async () =>
        (async function* () {
          yield { content: '{"reply":"partial' };
          router.abortRun('run-1');
          yield { content: ' more"}' };
        })(),
      invoke: async () => ({ content: (invokeCalls++, VALID) }),
    });
    router.bindRunSignal('run-1');

    await expect(router.streamStructured(chatPrompt, {}, CTX, { onDelta: () => undefined })).rejects.toMatchObject({ code: 'AI_013' });
    expect(invokeCalls).toBe(0);
  });
});

describe('WorkflowRunService.cancel', () => {
  it('should report no live run for an unknown runId without writing a row', () => {
    const router = makeRouter({});
    const { service, writes } = makeWorkflowService(router);
    expect(service.cancel('unknown')).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('should report no live run for one that has already settled', async () => {
    const router = makeRouter({});
    const { service } = makeWorkflowService(router);
    await service.runChain(BigInt(1), 'chat-turn', 'session:1', {}, async () => 'done');
    expect(service.cancel('run-1')).toBe(false);
  });
});

describe('WorkflowRunService run lifecycle', () => {
  it('should complete a run and deregister its controller', async () => {
    const router = makeRouter({});
    const { service, writes } = makeWorkflowService(router);

    const { result } = await service.runChain(BigInt(1), 'chat-turn', 'session:1', {}, async () => 'done');

    expect(result).toBe('done');
    expect(writes[0]).toMatchObject({ status: 'completed' });
    expect(registered(router).size).toBe(0);
  });

  it('should fail a run and deregister its controller', async () => {
    const router = makeRouter({});
    const { service, writes } = makeWorkflowService(router);

    const run = service.runChain(BigInt(1), 'chat-turn', 'session:1', {}, async () => {
      throw new Error('boom');
    });

    await expect(run).rejects.toThrow('boom');
    expect(writes[0]).toMatchObject({ status: 'failed' });
    expect(registered(router).size).toBe(0);
  });

  it('should settle a cancelled run as cancelled with an end time and deregister its controller', async () => {
    const router = makeRouter({});
    const { service, writes } = makeWorkflowService(router);

    const run = service.runChain(BigInt(1), 'chat-turn', 'session:1', {}, async runId => {
      expect(service.cancel(runId)).toBe(true);
      throw new Error('aborted');
    });

    await expect(run).rejects.toThrow('aborted');
    expect(writes[0]).toMatchObject({ status: 'cancelled', outcome: 'cancelled' });
    expect(writes[0]?.endedAt).toBeInstanceOf(Date);
    expect(registered(router).size).toBe(0);
  });

  it('should settle as cancelled when the chain finishes after the cancel rather than reporting success', async () => {
    const router = makeRouter({});
    const { service, writes } = makeWorkflowService(router);

    const run = service.runChain(BigInt(1), 'chat-turn', 'session:1', {}, async runId => {
      service.cancel(runId);
      return 'done';
    });

    await expect(run).rejects.toMatchObject({ code: 'AI_013' });
    expect(writes[0]).toMatchObject({ status: 'cancelled' });
  });
});

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_run_cancellation`;

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

describe.if(pgAvailable)('workflow run settle guard', () => {
  let db: PrimaryDatabase;
  let sql: SQL;
  let service: WorkflowRunService;

  beforeAll(async () => {
    const connectionString = await createDatabaseFromTemplate(dbName);
    sql = new SQL(connectionString);
    db = drizzle({ client: sql, schema }) as unknown as PrimaryDatabase;
    service = new WorkflowRunService(
      { getPostgresClient: () => db } as never,
      {} as never,
      makeRouter({}),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        publish: () => undefined,
      } as never,
    );
  });

  afterAll(async () => {
    await sql?.close();
  });

  async function seedCancelledRun(): Promise<string> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `settle-guard-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({ projectId: project.id, graph: 'chat-turn', target: 'session:1', status: 'cancelled', endedAt: new Date(), nodeTrace: [] })
      .returning({ id: schema.workflowRuns.id });
    if (!run) throw new Error('failed to seed run');
    return run.id;
  }

  const settled = (runId: string) => db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, runId) });

  it('should not let a late completion reopen a run that already settled as cancelled', async () => {
    const runId = await seedCancelledRun();

    await (service as unknown as { completeRun: (id: string, o: string, s: string, t: string[]) => Promise<void> }).completeRun(runId, 'completed', 'completed', ['chat-turn']);

    expect(await settled(runId)).toMatchObject({ status: 'cancelled' });
  });

  it('should not let a late failure reopen a run that already settled as cancelled', async () => {
    const runId = await seedCancelledRun();

    await (service as unknown as { failRun: (id: string, err: unknown) => Promise<void> }).failRun(runId, new Error('late boom'));

    const row = await settled(runId);
    expect(row).toMatchObject({ status: 'cancelled' });
    expect(row?.error).toBeNull();
  });
});
