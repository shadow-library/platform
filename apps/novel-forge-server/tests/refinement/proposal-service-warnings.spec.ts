import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type ChangeOp, ProposalService } from '@modules/refinement';
import { stampIdeaIds } from '@modules/refinement/idea-id';
import { stageTurnChangeSet } from '@modules/refinement/turn-proposals';

function fakeExecutor(factRows: Record<string, unknown>[]) {
  return {
    query: { canonFacts: { findMany: async () => factRows } },
    insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [{ id: 300n, ...values }] }) }),
  };
}

const undateOp: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'f1', revealChapter: null }];

describe('ProposalService.create — reveal-clear warning always runs, even with caller-supplied warnings', () => {
  it('should carry the reveal-clear warning when the fact is currently dated', async () => {
    const service = new ProposalService(new FakeDatabaseService());
    const executor = fakeExecutor([{ factKey: 'f1', revealChapter: 12 }]);

    const proposal = await service.create(7n, { scopeType: 'project', kind: 'chat', changeSet: undateOp, warnings: [] }, executor as never);

    expect(proposal.warnings).toEqual([
      "fact:f1 is scheduled to reveal at chapter 12; this clears that date, so only an unlock condition can let a plan reveal it — check that's intended.",
    ]);
  });

  it('should carry no warning when the fact was already unscheduled', async () => {
    const service = new ProposalService(new FakeDatabaseService());
    const executor = fakeExecutor([{ factKey: 'f1', revealChapter: null }]);

    const proposal = await service.create(7n, { scopeType: 'project', kind: 'chat', changeSet: undateOp, warnings: [] }, executor as never);

    expect(proposal.warnings).toBeNull();
  });

  it('should hold a direct side the reveal-clear check flagged, applying nothing and staging every op as a card', async () => {
    const service = new ProposalService(new FakeDatabaseService());
    const executor = fakeExecutor([{ factKey: 'f1', revealChapter: 12 }]);
    const applied: bigint[] = [];
    const discarded: bigint[] = [];
    const port = {
      stage: (changeSet: ChangeOp[], warnings: string[]) => service.create(7n, { scopeType: 'project', kind: 'chat', changeSet, warnings }, executor as never),
      apply: async (id: bigint) => (applied.push(id), Promise.reject(new Error('never applied'))),
      discard: async (id: bigint) => discarded.push(id),
      linkApplied: async () => undefined,
    };
    const split = { ops: undateOp, direct: undateOp, cards: [], dispositions: [{ index: 0, side: 'direct' as const }], held: false };

    const staging = await stageTurnChangeSet(port, split, []);

    expect(applied).toEqual([]);
    expect(discarded).toEqual([300n]);
    expect(staging.appliedProposal).toBeNull();
    expect(staging.cardProposal?.changeSet).toEqual(stampIdeaIds(undateOp));
    expect(staging.cardProposal?.warnings?.length).toBeGreaterThan(0);
  });
});
