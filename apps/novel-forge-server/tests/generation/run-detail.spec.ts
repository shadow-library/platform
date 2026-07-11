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
import { GenerationService } from '@modules/generation/generation.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_run_detail`;

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

describe.if(pgAvailable)('run detail observability', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  let projectId: bigint;
  let runId: string;
  let callId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    // getRun/getRunCall/getRunContext are pure DB reads — every AI collaborator can be a stub.
    service = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `run-detail-${Date.now()}`, kind: 'new_novel', premise: 'observability test' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    const [pack] = await db
      .insert(schema.contextPacks)
      .values({
        projectId,
        purpose: 'chat_hub',
        hash: 'run-detail-hash',
        budgetTokens: 20_000,
        usedTokens: 12_345,
        sections: [
          { key: 'premise', tier: 'canonical', segment: 'stable', tokens: 500, truncated: false, sourceRefs: ['premise'], rendered: '## PREMISE\n\nx' },
          { key: 'catalog', tier: 'canonical', segment: 'stable', tokens: 9_000, truncated: true, sourceRefs: [], rendered: '## CATALOG\n\ny' },
          { key: 'pipeline_status', tier: 'working', segment: 'volatile', tokens: 300, truncated: false, sourceRefs: [], rendered: '## STATUS\n\nz' },
        ] as never,
        rendered: 'FULL RENDERED CONTEXT',
      })
      .returning();
    if (!pack) throw new Error('failed to seed pack');

    const [run] = await db
      .insert(schema.workflowRuns)
      .values({ projectId, graph: 'chat-turn', target: 'session:x', status: 'completed', input: { content: 'one sentence' } as never, contextPackId: pack.id })
      .returning();
    if (!run) throw new Error('failed to seed run');
    runId = run.id;

    const [call] = await db
      .insert(schema.modelCalls)
      .values({
        projectId,
        runId,
        node: 'chat-turn',
        role: 'chat',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        promptKey: 'chat-refine',
        promptVersion: '2.0.0',
        status: 'ok',
        inputTokens: 13_000,
        outputTokens: 450,
        latencyMs: 2_100,
        attempt: 0,
        rawOutput: '{"reply":"the raw model answer"}',
      })
      .returning();
    if (!call) throw new Error('failed to seed model call');
    callId = call.id;

    await db
      .insert(schema.toolCalls)
      .values({ runId, node: 'chat-hub', tool: 'search_lore', args: { query: 'axiom' } as never, status: 'ok', resultDigest: 'abcd1234', latencyMs: 80 });
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('returns model calls, tool calls, and the pack anatomy in one run detail', async () => {
    const run = await service.getRun(projectId, runId);

    expect(run.modelCalls).toHaveLength(1);
    expect(run.modelCalls[0]).toMatchObject({ promptKey: 'chat-refine', promptVersion: '2.0.0', inputTokens: 13_000 });
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]).toMatchObject({ tool: 'search_lore', status: 'ok', args: { query: 'axiom' } });

    expect(run.contextPack).toMatchObject({ purpose: 'chat_hub', budgetTokens: 20_000, usedTokens: 12_345 });
    expect(run.contextPack?.sections).toEqual([
      { key: 'premise', tier: 'canonical', segment: 'stable', tokens: 500, truncated: false },
      { key: 'catalog', tier: 'canonical', segment: 'stable', tokens: 9_000, truncated: true },
      { key: 'pipeline_status', tier: 'working', segment: 'volatile', tokens: 300, truncated: false },
    ]);
  });

  it('serves the full rendered context and the raw model output lazily', async () => {
    const context = await service.getRunContext(projectId, runId);
    expect(context.rendered).toBe('FULL RENDERED CONTEXT');
    expect(context.sections).toHaveLength(3);

    const call = await service.getRunCall(projectId, runId, callId);
    expect(call.rawOutput).toBe('{"reply":"the raw model answer"}');
  });

  it('handles runs without a linked pack and rejects unknown refs', async () => {
    const [bare] = await db.insert(schema.workflowRuns).values({ projectId, graph: 'chat-compact', target: 'session:y', status: 'completed' }).returning();
    if (!bare) throw new Error('failed to seed bare run');

    const detail = await service.getRun(projectId, bare.id);
    expect(detail.contextPack).toBeUndefined();
    expect(detail.toolCalls).toEqual([]);

    await expect(service.getRunContext(projectId, bare.id)).rejects.toThrow(/No context pack/);
    await expect(service.getRunCall(projectId, runId, 999_999n)).rejects.toThrow();
  });

  it('links the chat turn pack to its run row', async () => {
    const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, runId) });
    expect(run?.contextPackId).not.toBeNull();
  });
});
