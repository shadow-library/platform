import { describe, expect, it, mock } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

async function fakeTransaction(changeSet: ChangeOp[], options: { kind?: string; volumes?: Record<string, unknown>[] } = {}) {
  const updates: Record<string, unknown>[] = [];
  const deleted: unknown[] = [];
  const project = { id: 7n, premise: 'A ferryman carries the living.', brief: null, themes: null, instructions: null };
  const volumes = options.volumes ?? [];
  const tx = {
    query: {
      projects: { findFirst: mock(async () => project) },
      volumes: { findFirst: mock(async () => volumes[0]), findMany: mock(async () => volumes) },
      arcs: { findMany: mock(async () => []) },
    },
    delete: () => ({ where: async (condition: unknown) => void deleted.push(condition) }),
    select: () => ({ from: () => ({ where: () => ({ for: async () => [proposal] }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...proposal, ...values }] }) };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
  const refs = volumes.length > 0 ? volumes.map(volume => `volume:${String(volume['volumeKey'])}`) : ['premise'];
  const proposal = {
    id: 300n,
    projectId: 7n,
    kind: options.kind ?? 'chat',
    status: 'pending',
    changeSet,
    baseline: await loadArtifactStates(tx as never, 7n, refs),
    messageId: null,
    summary: null,
  };
  const db = { transaction: mock(async () => undefined) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, { has: () => true, get: () => undefined } as never);
  return { service, tx, db, updates, deleted };
}

const approvedVolume = { id: 1n, projectId: 7n, volumeKey: 'volume_4', ordinal: 4, status: 'approved', revision: 2, contentHash: 'v4', startChapter: 1, endChapter: 10 };

describe('ProposalApplyService.apply inside a caller transaction', () => {
  it('should apply content ops on the caller’s transaction without opening its own', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'premise.update', premise: 'A ferryman carries the dead.' }]);

    const result = await service.apply(7n, 300n, { tx: tx as never });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ premise: 'A ferryman carries the dead.' });
    expect(result.proposal.status).toBe('applied');
    expect(result.applied).toEqual([{ artifactRef: 'premise', newRevision: null }]);
  });

  it('should let a Blueprint lock retire an approved volume its own earlier lock made', async () => {
    const { service, tx, deleted } = await fakeTransaction([{ op: 'volume.remove', volumeKey: 'volume_4' }], { kind: 'blueprint', volumes: [approvedVolume] });

    const result = await service.apply(7n, 300n, { tx: tx as never });

    expect(result.proposal.status).toBe('applied');
    expect(deleted).toHaveLength(1);
  });

  it('should still refuse every other scope the approved volume', async () => {
    const { service, tx, deleted } = await fakeTransaction([{ op: 'volume.remove', volumeKey: 'volume_4' }], { kind: 'chat', volumes: [approvedVolume] });

    await expect(service.apply(7n, 300n, { tx: tx as never })).rejects.toMatchObject({ code: 'RFN_004' });
    expect(deleted).toEqual([]);
  });

  it('should refuse an action op, which can only run after a commit', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'action.validate', scope: 'novel' }]);

    await expect(service.apply(7n, 300n, { tx: tx as never })).rejects.toThrow('action ops cannot run inside a caller transaction');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
