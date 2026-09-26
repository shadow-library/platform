import { describe, expect, it } from 'bun:test';

import { AiQuotaService } from '@modules/ai/ai-quota.service';

interface Chain {
  from: () => Chain;
  innerJoin: () => Chain;
  where: () => Chain;
  groupBy: () => Promise<unknown[]>;
  orderBy: () => Chain;
  limit: () => Promise<unknown[]>;
}

function chain(result: unknown[]): Chain {
  const self: Chain = {
    from: () => self,
    innerJoin: () => self,
    where: () => self,
    groupBy: () => Promise.resolve(result),
    orderBy: () => self,
    limit: () => Promise.resolve(result),
  };
  return self;
}

// The window-usage query selects {model, calls, ...} and ends in .groupBy(); the oldest-call query
// selects {createdAt} and ends in .orderBy().limit() — distinguishing them by their `select` columns is
// what lets one fake serve both queries `currentWindowStatus` issues.
function fakeDb(windowRows: unknown[], oldestRows: unknown[]) {
  return {
    select: (columns: Record<string, unknown>) => chain('createdAt' in columns ? oldestRows : windowRows),
  };
}

describe('AiQuotaService.currentWindowStatus', () => {
  it('should report zero usage and a null reset when the window is empty', async () => {
    const service = new AiQuotaService({ getPostgresClient: () => fakeDb([], []) } as never);

    const status = await service.currentWindowStatus({ kind: 'user', id: 1n });

    expect(status.calls).toBe(0);
    expect(status.costUsd).toBe(0);
    expect(status.resetsAt).toBeNull();
  });

  it('should sum window usage and report when the oldest call ages out of the window', async () => {
    const windowRows = [{ model: 'anthropic/claude-sonnet-5', calls: 3, inputTokens: '0', outputTokens: '0', recordedCostUsd: '0.05' }];
    const oldestCreatedAt = new Date('2026-09-01T00:00:00Z');
    const service = new AiQuotaService({ getPostgresClient: () => fakeDb(windowRows, [{ createdAt: oldestCreatedAt }]) } as never);

    const status = await service.currentWindowStatus({ kind: 'user', id: 1n });

    expect(status.calls).toBe(3);
    expect(status.costUsd).toBeCloseTo(0.05);
    expect(status.resetsAt).toEqual(new Date(oldestCreatedAt.getTime() + status.windowMs));
  });
});
