import { describe, expect, it, mock } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

async function fakeTransaction(changeSet: ChangeOp[]) {
  const updates: Record<string, unknown>[] = [];
  const project = { id: 7n, premise: 'A ferryman carries the living.', brief: null, themes: null, instructions: null };
  const tx = {
    query: { projects: { findFirst: mock(async () => project) } },
    select: () => ({ from: () => ({ where: () => ({ for: async () => [proposal] }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...proposal, ...values }] }) };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
  const proposal = { id: 300n, projectId: 7n, status: 'pending', changeSet, baseline: await loadArtifactStates(tx as never, 7n, ['premise']), messageId: null, summary: null };
  const db = { transaction: mock(async () => undefined) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, { has: () => true, get: () => undefined } as never);
  return { service, tx, db, updates };
}

describe('ProposalApplyService.apply inside a caller transaction', () => {
  it('should apply content ops on the caller’s transaction without opening its own', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'premise.update', premise: 'A ferryman carries the dead.' }]);

    const result = await service.apply(7n, 300n, { tx: tx as never });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ premise: 'A ferryman carries the dead.' });
    expect(result.proposal.status).toBe('applied');
    expect(result.applied).toEqual([{ artifactRef: 'premise', newRevision: null }]);
  });

  it('should refuse an action op, which can only run after a commit', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'action.validate', scope: 'novel' }]);

    await expect(service.apply(7n, 300n, { tx: tx as never })).rejects.toThrow('action ops cannot run inside a caller transaction');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
