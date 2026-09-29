import { describe, expect, it, mock } from 'bun:test';

import { type Ledger } from '@server/database';

import { type OpToggleHook, type OpToggleResult } from '@modules/refinement/proposal-apply.service';
import { ProposalOpUndoService } from '@modules/refinement/proposal-op-undo.service';
import { type OpSource } from '@modules/refinement/write-policy';

const OP = { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' } as const;
const ENTRY = { id: 41n, topic: 'idea.abc' } as unknown as Ledger.Entry;
const TX = { transaction: 'the undo transaction' };

/** An engine that moves the change unless told it already stood, running the caller's follow-up inside its transaction only when it did. */
function fakeService(source: OpSource, changed = true) {
  const toggle = async <T>(hook?: OpToggleHook<T>): Promise<OpToggleResult<T>> => {
    const base = { proposal: { id: 300n } as never, artifacts: [], staleMarked: [], changed, op: OP, source };
    return changed && hook ? { ...base, followUp: await hook(TX as never, { op: OP, source }) } : base;
  };
  const apply = {
    undoOp: mock((_projectId: bigint, _proposalId: bigint, _opIndex: number, hook?: OpToggleHook<unknown>) => toggle(hook)),
    redoOp: mock((_projectId: bigint, _proposalId: bigint, _opIndex: number, hook?: OpToggleHook<unknown>) => toggle(hook)),
  };
  const ideas = { reject: mock(async () => ENTRY), withdrawRejection: mock(async () => ENTRY) };
  return { service: new ProposalOpUndoService(apply as never, ideas as never), apply, ideas };
}

describe('ProposalOpUndoService', () => {
  it('should turn an undone idea down inside the undo’s transaction, not_now unless the author chose a scope', async () => {
    const { service, ideas } = fakeService('idea');

    const result = await service.undo(7n, 300n, 0);
    await service.undo(7n, 300n, 0, { scope: 'never', why: 'Mara belongs in another book.' });

    expect(result.rejection).toBe(ENTRY);
    expect(ideas.reject.mock.calls).toEqual([
      [7n, 300n, 0, { scope: 'not_now', why: undefined }, TX],
      [7n, 300n, 0, { scope: 'never', why: 'Mara belongs in another book.' }, TX],
    ] as never);
  });

  it('should record nothing when the undone change was the author’s own words', async () => {
    const { service, ideas } = fakeService('quoted');

    const result = await service.undo(7n, 300n, 2, { scope: 'never' });

    expect(result.rejection).toBeNull();
    expect(ideas.reject).not.toHaveBeenCalled();
  });

  it('should record nothing when the undo moved nothing — a repeat, or a turn already reverted as a whole', async () => {
    const { service, ideas } = fakeService('idea', false);

    const result = await service.undo(7n, 300n, 0);

    expect(result.rejection).toBeNull();
    expect(ideas.reject).not.toHaveBeenCalled();
  });

  it('should withdraw the rejection of an idea the author redid, inside the redo’s transaction', async () => {
    const { service, ideas } = fakeService('idea');

    await service.redo(7n, 300n, 0);

    expect(ideas.withdrawRejection).toHaveBeenCalledWith(7n, OP, expect.any(String), TX);
  });

  it('should leave the Notebook alone when redoing the author’s own words', async () => {
    const { service, ideas } = fakeService('quoted');

    await service.redo(7n, 300n, 2);

    expect(ideas.withdrawRejection).not.toHaveBeenCalled();
  });

  it('should record nothing when the engine refuses the undo', async () => {
    const { service, apply, ideas } = fakeService('idea');
    apply.undoOp.mockImplementation(() => Promise.reject(Object.assign(new Error('refused'), { code: 'RFN_015' })));

    await expect(service.undo(7n, 300n, 0)).rejects.toMatchObject({ code: 'RFN_015' });
    expect(ideas.reject).not.toHaveBeenCalled();
  });
});
