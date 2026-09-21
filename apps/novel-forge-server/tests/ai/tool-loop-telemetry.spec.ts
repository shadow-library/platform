import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config } from '@shadow-library/common';

import { resolveReasoningEffort } from '@modules/ai/defaults';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { estimateCallCostUsd } from '@modules/ai/quota';
import { JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
import { runToolLoop } from '@modules/ai/tools/tool-loop';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_tool_loop_telemetry`;
const JUDGE_MODEL = 'x-ai/grok-4.6';
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

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

interface Completion {
  status?: number;
  content?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  usage?: Record<string, number>;
}

function completionBody(reply: Completion): string {
  const message = reply.toolCall
    ? {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: reply.toolCall.name, arguments: JSON.stringify(reply.toolCall.args) } }],
      }
    : { role: 'assistant', content: reply.content ?? '' };
  return JSON.stringify({
    id: 'gen-fixture',
    object: 'chat.completion',
    created: 0,
    model: JUDGE_MODEL,
    choices: [{ index: 0, finish_reason: reply.toolCall ? 'tool_calls' : 'stop', message }],
    usage: reply.usage,
  });
}

describe.if(pgAvailable)('ModelRouterService model_calls telemetry', () => {
  let db: PrimaryDatabase;
  let server: ReturnType<typeof Bun.serve>;
  let replies: Completion[] = [];
  const requests: Record<string, unknown>[] = [];

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    server = Bun.serve({
      port: 0,
      fetch: async request => {
        requests.push((await request.json()) as Record<string, unknown>);
        const reply = replies.shift() ?? { status: 500 };
        if (reply.status) return new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), { status: reply.status });
        return new Response(completionBody(reply), { headers: { 'content-type': 'application/json' } });
      },
    });
    setConfig('ai.openrouter.api.key', 'test-openrouter-key');
    setConfig('ai.openrouter.api.url', `http://localhost:${server.port}`);
  });

  afterAll(async () => {
    setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');
    await server.stop(true);
    await (db as unknown as { $client: SQL }).$client.close();
  });

  beforeEach(() => {
    replies = [];
    requests.length = 0;
  });

  function makeRouter(): ModelRouterService {
    return new ModelRouterService(
      new TelemetryHandler({ getPostgresClient: () => db } as never),
      { getPostgresClient: () => db } as never,
      { enforce: async () => undefined } as never,
      { defaultsFor: async () => undefined } as never,
    );
  }

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `tool-loop-${Date.now()}-${Math.random()}`, kind: 'new_novel', config: { models: { judge: { provider: 'openrouter', model: JUDGE_MODEL } } } })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function runJudge(projectId: bigint, runId: string): Promise<void> {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const telemetry = { projectId, runId, node: 'judge', promptKey: 'judge', promptVersion: '2.3.0', role: 'judge' };
    const model = await makeRouter().chatFor('judge', telemetry, project as never);
    const toolCtx: ToolContext = {
      chapter: 3,
      db: { query: db.query, select: db.select.bind(db) },
      node: 'judge',
      projectId,
      retrieval: { searchLore: mock(async () => []), searchProse: mock(async () => []) } as never,
      runId,
    };
    const registry = new ToolRegistryService();
    const messages = [new SystemMessage('You are the continuity judge.'), new HumanMessage('Draft: the lighthouse keeper lit the lamp twice.')];
    await runToolLoop(model, registry.forNode('judge', toolCtx), registry.getRaw('judge'), messages, toolCtx, db).finally(awaitAllCallbacks);
  }

  function callsFor(runId: string) {
    return db.query.modelCalls.findMany({ where: eq(schema.modelCalls.runId, runId), orderBy: asc(schema.modelCalls.id) });
  }

  it('should write one model_calls row per tool round with tokens, provider cost and reasoning effort', async () => {
    const projectId = await createProject();
    replies = [
      { toolCall: { name: 'search_lore', args: { query: 'lighthouse' } }, usage: { prompt_tokens: 1200, completion_tokens: 40, total_tokens: 1240, cost: 0.0031 } },
      { content: JUDGE_OK, usage: { prompt_tokens: 1300, completion_tokens: 25, total_tokens: 1325, cost: 0.0029 } },
    ];

    await runJudge(projectId, 'wf-judge-rounds');

    const rows = await callsFor('wf-judge-rounds');
    const effort = resolveReasoningEffort(JUDGE_MODEL, 'review');
    expect(effort).toBeDefined();
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.inputTokens, row.outputTokens, Number(row.costUsd)])).toEqual([
      [1200, 40, 0.0031],
      [1300, 25, 0.0029],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ projectId, node: 'judge', role: 'judge', provider: 'openrouter', model: JUDGE_MODEL, promptKey: 'judge', status: 'ok', attempt: 0 });
      expect(row.reasoningEffort).toBe(effort as string);
      expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(requests.map(body => (body['reasoning'] as { effort?: string } | undefined)?.effort)).toEqual([effort, effort]);
  });

  it('should record the provider-reported cost on a structured call too', async () => {
    const projectId = await createProject();
    replies = [{ content: JUDGE_OK, usage: { prompt_tokens: 700, completion_tokens: 20, total_tokens: 720, cost: 0.0011 } }];
    const judgePrompt = {
      key: 'judge' as const,
      version: '2.3.0',
      kind: 'analytical' as const,
      system: 'test',
      template: { formatMessages: async () => [] } as never,
      schema: JudgeSchema,
    };
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    await makeRouter().structured(
      judgePrompt,
      { draft: 'the tide came in at noon' },
      { projectId, runId: 'wf-structured', promptKey: 'judge', promptVersion: '2.3.0', role: 'judge' },
      project as never,
    );
    await awaitAllCallbacks();

    const [row] = await callsFor('wf-structured');
    expect(Number(row?.costUsd)).toBe(0.0011);
  });

  it('should fall back to the list-price estimate when the provider reports no cost', async () => {
    const projectId = await createProject();
    replies = [{ content: JUDGE_OK, usage: { prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 } }];

    await runJudge(projectId, 'wf-judge-estimate');

    const [row] = await callsFor('wf-judge-estimate');
    expect(Number(row?.costUsd)).toBeCloseTo(estimateCallCostUsd(JUDGE_MODEL, 2000, 100), 6);
  });

  it('should record a failed round as a transport_error row before the loop rethrows', async () => {
    const projectId = await createProject();
    replies = [
      { toolCall: { name: 'search_lore', args: { query: 'lamp' } }, usage: { prompt_tokens: 900, completion_tokens: 30, total_tokens: 930, cost: 0.002 } },
      { status: 503 },
    ];

    await expect(runJudge(projectId, 'wf-judge-error')).rejects.toThrow();

    const rows = await callsFor('wf-judge-error');
    expect(rows.map(row => row.status)).toEqual(['ok', 'transport_error']);
    expect(rows[1]).toMatchObject({ projectId, node: 'judge', role: 'judge', model: JUDGE_MODEL, reasoningEffort: resolveReasoningEffort(JUDGE_MODEL, 'review') as string });
    expect(rows[1]?.error).toMatchObject({ message: expect.stringContaining('503') });
  });
});
