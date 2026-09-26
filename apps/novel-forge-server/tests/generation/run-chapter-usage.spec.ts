import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';

type Row = Record<string, unknown>;

interface FakeDbOptions {
  workflowRunFindFirst?: Row;
  workflowRunsFindMany?: Row[];
  modelCalls?: Row[];
  groupedUsageRows?: Row[];
  totalCount?: number;
}

interface FakeDb {
  db: unknown;
  findFirstCalls: { columns?: Record<string, boolean> }[];
}

// `select` serves two different grouped queries in `listRuns` (a plain count, and `runUsageTotals`' grouped
// usage) — distinguished by which columns each one asks for, since a hand-rolled fake cannot evaluate drizzle's `where`/`groupBy`.
function fakeDb(opts: FakeDbOptions = {}): FakeDb {
  const findFirstCalls: { columns?: Record<string, boolean> }[] = [];
  const db = {
    query: {
      workflowRuns: {
        findFirst: async (args: { columns?: Record<string, boolean> }) => (findFirstCalls.push(args), opts.workflowRunFindFirst),
        findMany: async () => opts.workflowRunsFindMany ?? [],
      },
      modelCalls: { findMany: async () => opts.modelCalls ?? [] },
    },
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          'total' in columns
            ? Promise.resolve([{ total: opts.totalCount ?? 0 }])
            : Object.assign(Promise.resolve(opts.groupedUsageRows ?? []), { groupBy: () => opts.groupedUsageRows ?? [] }),
      }),
    }),
  };
  return { db, findFirstCalls };
}

function makeService({ db }: FakeDb): GenerationService {
  const databaseService = { getPostgresClient: () => db } as never;
  const noop = {} as never;
  return new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
}

describe('GenerationService.getChapterCost', () => {
  it('should fold every model_calls row tagged with this chapter into one total, grouped by role', async () => {
    const calls = [
      {
        role: 'judge',
        model: 'anthropic/claude-sonnet-5',
        status: 'ok',
        costSource: 'provider',
        costUsd: '0.01',
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 5,
        latencyMs: 10,
      },
      {
        role: 'generation',
        model: 'anthropic/claude-sonnet-5',
        status: 'ok',
        costSource: 'provider',
        costUsd: '0.05',
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 50,
        latencyMs: 100,
      },
    ];
    const service = makeService(fakeDb({ modelCalls: calls }));

    const result = await service.getChapterCost(1n, 5);

    expect(result.chapter).toBe(5);
    expect(result.totals.calls).toBe(2);
    expect(result.totals.costUsd).toBeCloseTo(0.06);
    expect(result.byRole.map(r => r.role).sort()).toEqual(['generation', 'judge']);
  });

  it('should report zero cost for a chapter no action has touched yet', async () => {
    const service = makeService(fakeDb({}));

    const result = await service.getChapterCost(1n, 9);

    expect(result.totals).toMatchObject({ calls: 0, costUsd: 0 });
    expect(result.byRole).toEqual([]);
  });
});

describe('GenerationService.getRunUsage', () => {
  it('should 404 for a run that does not belong to the project', async () => {
    const service = makeService(fakeDb({ workflowRunFindFirst: undefined }));

    await expect(service.getRunUsage(1n, 'missing')).rejects.toMatchObject({ code: 'PRJ_001' });
  });

  it('should query only safe columns — never rawOutput, error, input or a context pack link', async () => {
    const run = {
      id: 'run-1',
      projectId: 1n,
      jobId: null,
      graph: 'chapter-generation',
      target: 'chapter-5',
      status: 'completed',
      outcome: 'completed',
      nodeTrace: ['plan'],
      startedAt: new Date('2026-09-01T00:00:00Z'),
      endedAt: new Date('2026-09-01T00:01:00Z'),
    };
    const calls = [
      {
        runId: 'run-1',
        model: 'anthropic/claude-sonnet-5',
        status: 'ok',
        costSource: 'provider',
        costUsd: '0.02',
        inputTokens: 40,
        cachedInputTokens: 0,
        outputTokens: 20,
        latencyMs: 200,
      },
    ];
    const { db, findFirstCalls } = fakeDb({ workflowRunFindFirst: run, modelCalls: calls });
    const service = makeService({ db, findFirstCalls });

    const result = await service.getRunUsage(1n, 'run-1');

    const columns = findFirstCalls[0]?.columns ?? {};
    expect(columns).not.toHaveProperty('input');
    expect(columns).not.toHaveProperty('error');
    expect(columns).not.toHaveProperty('contextPackId');
    expect(result).not.toHaveProperty('input');
    expect(result.totals.durationMs).toBe(60_000);
    expect(result.totals.calls).toBe(1);
    expect(result.calls).toHaveLength(1);
  });
});

describe('GenerationService.listRuns', () => {
  const run = {
    id: 'run-1',
    projectId: 1n,
    jobId: null,
    graph: 'chat-turn',
    target: 'session:s1',
    status: 'completed',
    outcome: 'completed',
    nodeTrace: [],
    startedAt: new Date(),
    endedAt: new Date(),
  };

  it('should report total/limit/offset alongside items for paging', async () => {
    const service = makeService(fakeDb({ workflowRunsFindMany: [run], totalCount: 42 }));

    const result = await service.listRuns(1n, { limit: 10, offset: 20 });

    expect(result.total).toBe(42);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.totals).toMatchObject({ calls: 0, costUsd: 0 });
  });

  it('should reject from > to with a typed 400 instead of querying', async () => {
    const service = makeService(fakeDb({ workflowRunsFindMany: [run], totalCount: 0 }));

    await expect(service.listRuns(1n, { limit: 10, offset: 0, from: new Date('2026-09-10'), to: new Date('2026-09-01') })).rejects.toMatchObject({ code: 'AI_014' });
  });

  it('should reject an unparsable date (Invalid Date) with a typed 400', async () => {
    const service = makeService(fakeDb({ workflowRunsFindMany: [run], totalCount: 0 }));

    await expect(service.listRuns(1n, { limit: 10, offset: 0, from: new Date('not-a-date') })).rejects.toMatchObject({ code: 'AI_014' });
  });
});
