import { describe, expect, it, mock } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

async function fakeTransaction(
  changeSet: ChangeOp[],
  options: { kind?: string; volumes?: Record<string, unknown>[]; facts?: Record<string, unknown>[]; plannedChapter?: number } = {},
) {
  const updates: Record<string, unknown>[] = [];
  const deleted: unknown[] = [];
  const project = { id: 7n, premise: 'A ferryman carries the living.', brief: null, themes: null, instructions: null };
  const volumes = options.volumes ?? [];
  const facts = options.facts ?? [];
  const tx = {
    query: {
      projects: { findFirst: mock(async () => project) },
      volumes: { findFirst: mock(async () => volumes[0]), findMany: mock(async () => volumes) },
      briefs: { findFirst: mock(async () => (options.plannedChapter === undefined ? undefined : { chapter: options.plannedChapter })), findMany: mock(async () => []) },
      canonFacts: { findFirst: mock(async () => facts[0]), findMany: mock(async () => facts) },
      milestones: { findMany: mock(async () => []) },
      chapters: { findFirst: mock(async () => undefined) },
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
  const namedRefs = [...volumes.map(volume => `volume:${String(volume['volumeKey'])}`), ...facts.map(fact => `fact:${String(fact['factKey'])}`)];
  const refs = namedRefs.length > 0 ? namedRefs : ['premise'];
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

const volume = { id: 1n, projectId: 7n, volumeKey: 'volume_4', ordinal: 4, title: 'The Flood', objective: 'Reach the far bank.', body: null, revision: 2, contentHash: 'v4' };

describe('ProposalApplyService.apply inside a caller transaction', () => {
  it('should apply content ops on the caller’s transaction without opening its own', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'premise.update', premise: 'A ferryman carries the dead.' }]);

    const result = await service.apply(7n, 300n, { tx: tx as never });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ premise: 'A ferryman carries the dead.' });
    expect(result.proposal.status).toBe('applied');
    expect(result.applied).toEqual([{ artifactRef: 'premise', newRevision: null }]);
  });

  it('should refuse to remove a volume a chapter plan still belongs to', async () => {
    const { service, tx, deleted } = await fakeTransaction([{ op: 'volume.remove', volumeKey: 'volume_4' }], { volumes: [volume], plannedChapter: 3 });

    await expect(service.apply(7n, 300n, { tx: tx as never })).rejects.toMatchObject({ code: 'VOL_002' });
    expect(deleted).toEqual([]);
  });

  it('should remove a volume no chapter plan belongs to, and stage an inverse that restores its goal', async () => {
    const { service, tx, deleted } = await fakeTransaction([{ op: 'volume.remove', volumeKey: 'volume_4' }], { volumes: [volume] });

    const result = await service.apply(7n, 300n, { tx: tx as never });

    expect(deleted).toHaveLength(1);
    expect(result.applied).toEqual([{ artifactRef: 'volume:volume_4', newRevision: null }]);
    expect(JSON.parse(JSON.stringify(result.proposal.inverseOps))).toEqual([
      { op: 'volume.upsert', volumeKey: 'volume_4', ordinal: 4, title: 'The Flood', objective: 'Reach the far bank.', body: null },
    ]);
  });

  it('should write only the goal fields of a volume', async () => {
    const { service, tx, updates } = await fakeTransaction([{ op: 'volume.upsert', volumeKey: 'volume_4', objective: 'Burn the ferry.' }], { volumes: [volume] });

    await service.apply(7n, 300n, { tx: tx as never });

    const volumeUpdate = updates.find(update => 'objective' in update);
    expect(Object.keys(volumeUpdate ?? {}).sort()).toEqual(['body', 'contentHash', 'objective', 'ordinal', 'revision', 'state', 'title', 'updatedAt']);
    expect(volumeUpdate).toMatchObject({ objective: 'Burn the ferry.', title: 'The Flood', revision: 3 });
  });

  it('should refuse an action op, which can only run after a commit', async () => {
    const { service, tx, db, updates } = await fakeTransaction([{ op: 'action.validate', scope: 'novel' }]);

    await expect(service.apply(7n, 300n, { tx: tx as never })).rejects.toThrow('action ops cannot run inside a caller transaction');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});

const datedFact = { id: 1n, projectId: 7n, factKey: 'f1', text: 'the vault is empty', subjects: null, constraintNote: null, writerNote: null, terms: null, revealChapter: 12 };

describe('ProposalApplyService.apply — clearing a fact reveal date', () => {
  it('should write an explicit null and stage an inverse that restores the old date', async () => {
    const { service, tx, updates } = await fakeTransaction([{ op: 'fact.upsert', factKey: 'f1', revealChapter: null }], { facts: [datedFact] });

    const result = await service.apply(7n, 300n, { tx: tx as never });

    const factUpdate = updates.find(update => 'revealChapter' in update);
    expect(factUpdate?.['revealChapter']).toBeNull();
    const inverseOps = JSON.parse(JSON.stringify(result.proposal.inverseOps)) as Record<string, unknown>[];
    expect(inverseOps[0]).toHaveProperty('revealChapter', 12);
  });
});
