/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { ModelRouterService } from '@modules/ai/model-router.service';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
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
const dbName = `${baseConnectionString.split('/').pop()}_router_cache`;
const JUDGE_OK = JSON.stringify({ verdict: 'consistent', findings: [] });

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

function judgePrompt(chain: { invoke: (...args: unknown[]) => Promise<{ content: string }> }) {
  return { key: 'judge' as const, version: '1.0.0', kind: 'analytical' as const, system: 'test', template: { pipe: () => chain } as never, schema: JudgeSchema };
}

describe.if(pgAvailable)('ModelRouterService cache + resilience', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  function makeRouter(chain: { invoke: (...args: unknown[]) => Promise<{ content: string }> }): ModelRouterService {
    const router = new ModelRouterService({} as never, { getPostgresClient: () => db } as never);
    (router as unknown as Record<string, unknown>)['buildClient'] = () => ({ pipe: () => chain });
    return router;
  }

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `router-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('serves a cacheable role from cache on identical input (one model call)', async () => {
    const projectId = await createProject();
    let calls = 0;
    const chain = {
      invoke: async () => {
        calls++;
        return { content: JUDGE_OK };
      },
    };
    const router = makeRouter(chain);
    const ctx = { projectId, promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };

    await router.structured<JudgeOutput>(judgePrompt(chain), { prose: 'same' }, ctx);
    await router.structured<JudgeOutput>(judgePrompt(chain), { prose: 'same' }, ctx);
    expect(calls).toBe(1); // second call is a cache hit

    await router.structured<JudgeOutput>(judgePrompt(chain), { prose: 'different' }, ctx);
    expect(calls).toBe(2); // different input misses the cache

    const rows = await db.query.llmCache.findMany({ where: eq(schema.llmCache.projectId, projectId) });
    expect(rows).toHaveLength(2);
  });

  it('retries a transient transport error with backoff and then succeeds', async () => {
    const projectId = await createProject();
    let calls = 0;
    const chain = {
      invoke: async () => {
        calls++;
        if (calls === 1) throw new Error('transient boom');
        return { content: JUDGE_OK };
      },
    };
    const router = makeRouter(chain);

    const result = await router.structured<JudgeOutput>(judgePrompt(chain), { prose: 'retry-me' }, { projectId, promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(calls).toBe(2);
  });
});

describe.if(pgAvailable)('TelemetryHandler attribution via metadata', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(`${dbName}_telemetry`);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  it('writes a model_calls row tagged with project/run/node from nfTelemetry metadata', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `telemetry-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const handler = new TelemetryHandler({ getPostgresClient: () => db } as never);
    const runId = 'lc-run-1';
    const metadata = {
      nfTelemetry: {
        projectId: String(project.id),
        runId: 'wf-run-9',
        node: 'judge',
        promptKey: 'judge',
        promptVersion: '1.0.0',
        role: 'judge',
        provider: 'xai',
        model: 'grok',
        attempt: 0,
      },
    };

    await handler.handleLLMStart({} as never, [], runId, undefined, undefined, undefined, metadata);
    await handler.handleLLMEnd({ generations: [[{ text: '{}' }]], llmOutput: { usage: { input_tokens: 5, output_tokens: 7 } } } as never, runId);

    const row = await db.query.modelCalls.findFirst({ where: eq(schema.modelCalls.projectId, project.id) });
    expect(row?.runId).toBe('wf-run-9');
    expect(row?.node).toBe('judge');
    expect(row?.role).toBe('judge');
    expect(row?.inputTokens).toBe(5);
  });
});
