import { describe, expect, it } from 'bun:test';

import { TurnCostService } from '@modules/refinement/turn-cost.service';

interface Row {
  id?: string;
  parentRunId?: string | null;
  runId?: string | null;
  role?: string;
  [key: string]: unknown;
}

function fakeDb(childRuns: Row[], modelCalls: Row[]) {
  return {
    query: {
      workflowRuns: { findMany: async () => childRuns },
      modelCalls: { findMany: async () => modelCalls },
    },
  };
}

function call(runId: string, costUsd: string): Row {
  return { runId, model: 'anthropic/claude-sonnet-5', status: 'ok', costSource: 'provider', costUsd, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, latencyMs: 10 };
}

describe('TurnCostService.forMessages', () => {
  it('should return no entries for a session with no assistant runs', async () => {
    const service = new TurnCostService({ getPostgresClient: () => fakeDb([], []) } as never);

    const result = await service.forMessages(1n, [{ id: 1n, role: 'user', runId: null }]);

    expect(result.size).toBe(0);
  });

  it("should fold a turn's own calls plus its title run's calls, linked by parent_run_id, into one total", async () => {
    const db = fakeDb([{ id: 'title-1', parentRunId: 'turn-1' }], [call('turn-1', '0.01'), call('title-1', '0.001')]);
    const service = new TurnCostService({ getPostgresClient: () => db } as never);

    const result = await service.forMessages(1n, [{ id: 42n, role: 'assistant', runId: 'turn-1' }]);

    const totals = result.get(42n);
    expect(totals?.calls).toBe(2);
    expect(totals?.costUsd).toBeCloseTo(0.011);
  });

  it('should never attach a figure to a user message, even though it shares the turn run id with the reply', async () => {
    const db = fakeDb([], [call('turn-1', '0.01')]);
    const service = new TurnCostService({ getPostgresClient: () => db } as never);

    const result = await service.forMessages(1n, [
      { id: 1n, role: 'user', runId: 'turn-1' },
      { id: 2n, role: 'assistant', runId: 'turn-1' },
    ]);

    expect(result.has(1n)).toBe(false);
    expect(result.get(2n)?.costUsd).toBeCloseTo(0.01);
  });

  it('should not attribute a compaction/title run belonging to a different turn', async () => {
    const db = fakeDb([{ id: 'title-1', parentRunId: 'turn-1' }], [call('turn-1', '0.01'), call('turn-2', '0.02'), call('title-1', '0.001')]);
    const service = new TurnCostService({ getPostgresClient: () => db } as never);

    const result = await service.forMessages(1n, [
      { id: 1n, role: 'assistant', runId: 'turn-1' },
      { id: 2n, role: 'assistant', runId: 'turn-2' },
    ]);

    expect(result.get(1n)?.costUsd).toBeCloseTo(0.011);
    expect(result.get(2n)?.costUsd).toBeCloseTo(0.02);
  });

  it('should report zero for a turn that made no calls', async () => {
    const service = new TurnCostService({ getPostgresClient: () => fakeDb([], []) } as never);

    const result = await service.forMessages(1n, [{ id: 1n, role: 'assistant', runId: 'turn-1' }]);

    expect(result.get(1n)?.calls).toBe(0);
  });
});
