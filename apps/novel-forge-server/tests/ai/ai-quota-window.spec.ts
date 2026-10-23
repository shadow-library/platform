import { describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';

import { AiQuotaService } from '@modules/ai/ai-quota.service';

import { matchesWhere } from '../sql-filter';

interface Chain {
  from: () => Chain;
  innerJoin: () => Chain;
  where: (where?: SQL) => Chain;
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

describe('AiQuotaService window', () => {
  it('should leave refused rows out, since no model ran for a hard-line or Synapse budget refusal', async () => {
    const wheres: SQL[] = [];
    const capturing = (): Chain => {
      const self: Chain = {
        from: () => self,
        innerJoin: () => self,
        where: (where?: SQL) => (where && wheres.push(where), self),
        groupBy: async () => [],
        orderBy: () => self,
        limit: async () => [],
      };
      return self;
    };
    const db = { select: capturing };
    await new AiQuotaService({ getPostgresClient: () => db } as never).currentWindowStatus({ kind: 'user', id: 1n });
    const row = { ownerKind: 'user', ownerId: 1n, createdAt: new Date() };

    for (const where of wheres) {
      expect(matchesWhere({ ...row, status: 'ok' }, where)).toBe(true);
      expect(matchesWhere({ ...row, status: 'transport_error' }, where)).toBe(true);
      expect(matchesWhere({ ...row, status: 'refused' }, where)).toBe(false);
    }
    expect(wheres).toHaveLength(2);
  });
});
