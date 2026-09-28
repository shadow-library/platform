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

function enforcingDb(project: Promise<unknown>, windowRows: unknown[] = []) {
  return { ...fakeDb(windowRows, []), query: { projects: { findFirst: () => project } } };
}

const AT_CALL_LIMIT = [{ model: 'anthropic/claude-sonnet-5', calls: 1000, inputTokens: '0', outputTokens: '0', recordedCostUsd: '0' }];

describe('AiQuotaService.enforce', () => {
  it('should refuse the model call as retryable when usage cannot be read', async () => {
    const service = new AiQuotaService({ getPostgresClient: () => enforcingDb(Promise.reject(new Error('connection terminated'))) } as never);

    await expect(service.enforce(7n)).rejects.toMatchObject({ code: 'AI_018', data: { retryable: true } });
  });

  it('should let the model call through when the owner is under both limits', async () => {
    const service = new AiQuotaService({ getPostgresClient: () => enforcingDb(Promise.resolve({ ownerKind: 'user', ownerId: 1n })) } as never);

    await expect(service.enforce(7n)).resolves.toBeUndefined();
  });

  it('should refuse the model call once the owner reaches the call limit', async () => {
    const service = new AiQuotaService({ getPostgresClient: () => enforcingDb(Promise.resolve({ ownerKind: 'user', ownerId: 1n }), AT_CALL_LIMIT) } as never);

    await expect(service.enforce(7n)).rejects.toMatchObject({ code: 'AI_008' });
  });

  it('should limit a project with no owner against the shared ownerless bucket', async () => {
    const service = new AiQuotaService({ getPostgresClient: () => enforcingDb(Promise.resolve({ ownerKind: 'user', ownerId: null }), AT_CALL_LIMIT) } as never);

    await expect(service.enforce(7n)).rejects.toMatchObject({ code: 'AI_008' });
  });
});
