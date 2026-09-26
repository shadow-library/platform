import { describe, expect, it } from 'bun:test';

import { runWithCostTier, scopedCostTier } from '@modules/ai/cost-tier-scope';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

function fakeApply(runTier: string | null, runId: string | null = 'run-1') {
  const changeSet: ChangeOp[] = [{ op: 'action.validate', scope: 'novel' }];
  const proposal = { id: 300n, projectId: 7n, kind: 'hub', status: 'pending', changeSet, baseline: {}, runId, messageId: null, summary: null };
  const update = () => ({ set: (values: object) => ({ where: () => ({ returning: async () => [{ ...proposal, ...values }] }) }) });
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => [proposal] }) }) }),
    update,
    insert: () => ({ values: async () => undefined }),
  };
  const lookups: unknown[] = [];
  const db = {
    transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    select: (columns: unknown) => {
      lookups.push(columns);
      return { from: () => ({ where: async () => [{ costTier: runTier }] }) };
    },
    update,
  };
  const seen: unknown[] = [];
  const executor = async () => {
    seen.push(scopedCostTier());
    return { summary: 'validated' };
  };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, { has: () => true, get: () => executor } as never);
  return { service, seen, lookups };
}

describe('ProposalApplyService actions and the cost tier', () => {
  it('should run a proposed action at the tier of the chat turn that proposed it, even when applied later', async () => {
    const { service, seen } = fakeApply('economy');

    await runWithCostTier('performant', () => service.apply(7n, 300n));

    expect(seen).toEqual(['economy']);
  });

  it('should leave the caller’s tier in charge when the proposal did not come from a chat turn', async () => {
    const { service, seen, lookups } = fakeApply(null, null);

    await runWithCostTier('performant', () => service.apply(7n, 300n));

    expect(seen).toEqual(['performant']);
    expect(lookups).toHaveLength(0);
  });

  it('should ignore a run input that carries no known tier', async () => {
    const { service, seen } = fakeApply('lavish');

    await service.apply(7n, 300n);

    expect(seen).toEqual([undefined]);
  });
});
