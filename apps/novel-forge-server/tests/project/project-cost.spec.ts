import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { costGroupFor, type CostUsageRow, summarizeCost } from '@modules/project/project/project-cost';
import { ProjectService } from '@modules/project/project/project.service';
import { estimateCallCostUsd } from '@modules/ai/quota';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const SONNET = 'anthropic/claude-sonnet-5';
const OPUS = 'anthropic/claude-opus-5';
const DAY_MS = 24 * 60 * 60 * 1000;

function usageRow(overrides: Partial<CostUsageRow>): CostUsageRow {
  return {
    role: 'generation',
    model: SONNET,
    window: 'last7Days',
    calls: 1,
    inputTokens: 0,
    outputTokens: 0,
    recordedCostUsd: 0,
    unpricedInputTokens: 0,
    unpricedOutputTokens: 0,
    ...overrides,
  };
}

describe('costGroupFor', () => {
  it('should map a routed role to its model group', () => {
    expect(costGroupFor('generation')).toBe('writing');
    expect(costGroupFor('judge')).toBe('review');
  });

  it('should map a namespaced prompt key to its namespace group', () => {
    expect(costGroupFor('bible:world')).toBe(costGroupFor('bible'));
  });

  it('should put an unroutable role under other', () => {
    expect(costGroupFor('unknown')).toBe('other');
  });
});

describe('summarizeCost', () => {
  it('should return zeroes and empty breakdowns for a project with no calls', () => {
    expect(summarizeCost([])).toEqual({
      totalCostUsd: 0,
      estimatedCostUsd: 0,
      last7DaysCostUsd: 0,
      last30DaysCostUsd: 0,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      byGroup: [],
      byRole: [],
      byModel: [],
    });
  });

  it('should prefer recorded cost and estimate only the tokens that recorded none', () => {
    const summary = summarizeCost([
      usageRow({ calls: 3, inputTokens: 3_000_000, outputTokens: 300_000, recordedCostUsd: 1.5, unpricedInputTokens: 1_000_000, unpricedOutputTokens: 100_000 }),
    ]);
    const estimate = estimateCallCostUsd(SONNET, 1_000_000, 100_000);

    expect(estimate).toBeGreaterThan(0);
    expect(summary.estimatedCostUsd).toBeCloseTo(estimate, 9);
    expect(summary.totalCostUsd).toBeCloseTo(1.5 + estimate, 9);
    expect(summary.byModel[0]).toMatchObject({ key: SONNET, label: 'Claude Sonnet 5', calls: 3, inputTokens: 3_000_000, outputTokens: 300_000 });
  });

  it('should count the last 7 days inside the last 30 days and leave older spend out of both', () => {
    const summary = summarizeCost([
      usageRow({ window: 'last7Days', recordedCostUsd: 1 }),
      usageRow({ window: 'last30Days', recordedCostUsd: 2 }),
      usageRow({ window: 'older', recordedCostUsd: 4 }),
    ]);

    expect(summary.last7DaysCostUsd).toBe(1);
    expect(summary.last30DaysCostUsd).toBe(3);
    expect(summary.totalCostUsd).toBe(7);
  });

  it('should break spend down by group, role and model, highest spend first', () => {
    const summary = summarizeCost([
      usageRow({ role: 'generation', model: SONNET, recordedCostUsd: 1 }),
      usageRow({ role: 'revision', model: SONNET, recordedCostUsd: 0.5 }),
      usageRow({ role: 'plan', model: OPUS, recordedCostUsd: 4 }),
      usageRow({ role: 'plan', model: OPUS, window: 'older', recordedCostUsd: 1 }),
    ]);

    expect(summary.byGroup.map(item => [item.key, item.costUsd])).toEqual([
      ['planning', 5],
      ['writing', 1.5],
    ]);
    expect(summary.byRole.map(item => item.key)).toEqual(['plan', 'generation', 'revision']);
    expect(summary.byModel.map(item => [item.key, item.calls])).toEqual([
      [OPUS, 2],
      [SONNET, 2],
    ]);
  });

  it('should fall back to the model id as the label for a model the registry no longer lists', () => {
    const summary = summarizeCost([usageRow({ model: 'retired/model-x', recordedCostUsd: 0.25 })]);

    expect(summary.byModel[0]).toMatchObject({ key: 'retired/model-x', label: 'retired/model-x', estimatedCostUsd: 0 });
  });
});

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_project_cost`;

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

describe.if(pgAvailable)('ProjectService.cost', () => {
  let db: PrimaryDatabase;
  let service: ProjectService;
  let projectId: bigint;
  let otherProjectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    service = new ProjectService({ getPostgresClient: () => db } as never, noop, noop, noop, noop);

    const [project, other] = await db
      .insert(schema.projects)
      .values([
        { name: `project-cost-${Date.now()}`, kind: 'new_novel', premise: 'a lighthouse keeper counts the ships that never arrive' },
        { name: `project-cost-other-${Date.now()}`, kind: 'new_novel', premise: 'unrelated' },
      ])
      .returning();
    if (!project || !other) throw new Error('failed to seed projects');
    projectId = project.id;
    otherProjectId = other.id;

    const now = Date.now();
    const call = { promptKey: 'generation', promptVersion: '1.0.0', provider: 'openrouter', status: 'ok' as const };
    await db.insert(schema.modelCalls).values([
      { ...call, projectId, role: 'generation', model: SONNET, inputTokens: 10_000, outputTokens: 2_000, costUsd: '0.050000', createdAt: new Date(now - DAY_MS) },
      { ...call, projectId, role: 'generation', model: SONNET, inputTokens: 1_000_000, outputTokens: 100_000, costUsd: null, createdAt: new Date(now - 10 * DAY_MS) },
      { ...call, projectId, role: 'plan', model: OPUS, inputTokens: 5_000, outputTokens: 1_000, costUsd: '0.200000', createdAt: new Date(now - 60 * DAY_MS) },
      { ...call, projectId, role: 'judge', model: SONNET, status: 'transport_error', costUsd: null, createdAt: new Date(now - DAY_MS) },
      { ...call, projectId: otherProjectId, role: 'generation', model: SONNET, inputTokens: 1, outputTokens: 1, costUsd: '9.000000' },
    ]);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should total this project’s calls only, estimating the one that recorded no cost', async () => {
    const cost = await service.cost(projectId);
    const estimate = estimateCallCostUsd(SONNET, 1_000_000, 100_000);

    expect(cost.calls).toBe(4);
    expect(cost.inputTokens).toBe(1_015_000);
    expect(cost.outputTokens).toBe(103_000);
    expect(cost.estimatedCostUsd).toBeCloseTo(estimate, 6);
    expect(cost.totalCostUsd).toBeCloseTo(0.25 + estimate, 6);
  });

  it('should bucket spend into the last 7 and last 30 days by call time', async () => {
    const cost = await service.cost(projectId);

    expect(cost.last7DaysCostUsd).toBeCloseTo(0.05, 6);
    expect(cost.last30DaysCostUsd).toBeCloseTo(0.05 + estimateCallCostUsd(SONNET, 1_000_000, 100_000), 6);
  });

  it('should break the spend down by group, role and model', async () => {
    const cost = await service.cost(projectId);

    expect(cost.byGroup.map(item => item.key).sort()).toEqual(['planning', 'review', 'writing']);
    expect(cost.byRole.find(item => item.key === 'judge')).toMatchObject({ calls: 1, costUsd: 0 });
    expect(cost.byModel.find(item => item.key === OPUS)).toMatchObject({ label: 'Claude Opus 5', calls: 1 });
    expect(cost.byModel.find(item => item.key === SONNET)?.calls).toBe(3);
  });
});
