import { describe, expect, it, mock } from 'bun:test';

import { sliceDigest } from '@modules/blueprint/engine/blueprint-round';
import { type RoundWithJob } from '@modules/blueprint/engine/blueprint-round.service';
import { blueprintStep, BlueprintStepRegistry } from '@modules/blueprint/engine/blueprint-step.registry';
import { BLUEPRINT_CHANGE_OPS, BlueprintStepService } from '@modules/blueprint/engine/blueprint-step.service';
import { type AnyBlueprintStep, type LockPlan } from '@modules/blueprint/engine/blueprint-step.types';
import { type NewLedgerEntry } from '@modules/blueprint/ledger/ledger.types';
import { startStep } from '@modules/blueprint/steps/start.step';
import { type Blueprint, type Ledger } from '@server/database';

import { engineCoreScreen, engineOptions, enginePass, engineWorldScreen, ledgerEntry, round } from './blueprint-fixtures';

interface FakeState {
  projectKind?: string;
  latest?: RoundWithJob;
  ready?: Blueprint.Round;
  active?: Ledger.Entry[];
  perStep?: RoundWithJob[];
}

const ALL_STEPS = [blueprintStep(startStep), blueprintStep(enginePass), blueprintStep(engineCoreScreen), blueprintStep(engineWorldScreen)];

function fakeService(state: FakeState = {}, steps: AnyBlueprintStep[] = ALL_STEPS) {
  const calls: string[] = [];
  const tx = {
    query: {
      projects: {
        findFirst: mock(async () => {
          calls.push('read:project');
          return { id: 7n, kind: state.projectKind ?? 'new_novel' };
        }),
      },
      decisionLedgerEntries: {
        findMany: mock(async () => {
          calls.push('read:ledger');
          return state.active ?? [];
        }),
      },
    },
  };
  const db = {
    query: tx.query,
    transaction: mock(async (run: (executor: unknown) => Promise<unknown>) => run(tx)),
  };
  const rounds = {
    lockStep: mock<(projectId: bigint, stepKey: string, tx: unknown) => Promise<void>>(async (_projectId, stepKey) => {
      calls.push(`lock:${stepKey}`);
    }),
    latestForStep: mock(async () => {
      calls.push('read:latest');
      return state.latest;
    }),
    latestReady: mock(async () => {
      calls.push('read:ready');
      return state.ready;
    }),
    latestPerStep: mock(async () => state.perStep ?? []),
    settle: mock(async () => {
      calls.push('settle');
      return undefined;
    }),
    create: mock(async (row: Blueprint.NewRound) => {
      calls.push('create');
      return round({ ...row, id: 12n, status: 'pending', jobId: null } as Partial<Blueprint.Round>);
    }),
  };
  const ledger = {
    append: mock(async (_projectId: bigint, entries: NewLedgerEntry[]) => {
      calls.push('ledger.append');
      return entries.map((entry, index) => ledgerEntry({ ...entry, id: 100n + BigInt(index) } as Partial<Ledger.Entry>));
    }),
    supersede: mock(async (_projectId: bigint, entryId: bigint, next: Partial<Ledger.Entry>) => ledgerEntry({ ...next, id: 200n, supersedesId: entryId })),
    withdraw: mock(async (_projectId: bigint, entryId: bigint, reason: string) => ledgerEntry({ id: entryId, supersededAt: new Date(0), withdrawnReason: reason })),
  };
  const proposals = { create: mock<(...args: unknown[]) => Promise<{ id: bigint }>>(async () => ({ id: 300n })) };
  const proposalApply = { apply: mock<(...args: unknown[]) => Promise<unknown>>(async () => ({ proposal: { id: 300n, status: 'applied' } })) };
  const databaseService = { getPostgresClient: () => db };
  const registry = new BlueprintStepRegistry(steps);
  const service = new BlueprintStepService(databaseService as never, rounds as never, registry, ledger as never, proposals as never, proposalApply as never);
  return { service, calls, rounds, ledger, proposals, proposalApply, tx };
}

function withPlan(plan: Partial<LockPlan>): AnyBlueprintStep {
  return blueprintStep({ ...startStep, materialise: async () => ({ entries: [], ...plan }) });
}

const readyRound = round({ options: { understood: [{ id: 'c1', label: 'A ferry that only runs at night', kind: 'element' }] } });
const readyPass = round({ stepKey: 'engine', round: 4, options: engineOptions });

describe('BlueprintStepService.openRound', () => {
  it('should refuse a round while the step already has one running, before writing anything', async () => {
    const { service, rounds, ledger } = fakeService({ latest: { round: round({ status: 'running' }), jobStatus: 'in_progress' } });

    await expect(service.openRound(7n, 'start', { steer: 'Quieter', keepAsDirection: true })).rejects.toMatchObject({ code: 'BPR_002' });
    expect(ledger.append).not.toHaveBeenCalled();
    expect(rounds.create).not.toHaveBeenCalled();
  });

  it('should take the step’s lock first, then write the ledger side effects before the round', async () => {
    const { service, calls, rounds, ledger, tx } = fakeService({ latest: { round: readyRound, jobStatus: 'done' }, ready: readyRound });

    const created = await service.openRound(7n, 'start', {
      steer: ' Quieter ',
      keepAsDirection: true,
      feedback: [{ optionId: 'c1', verdict: 'not', reason: 'Too gothic' }],
      input: { text: 'A ferry town.' },
    });

    expect(calls).toEqual(['lock:start', 'read:project', 'read:latest', 'read:ready', 'ledger.append', 'create']);
    expect(rounds.lockStep.mock.calls[0]?.[2]).toBe(tx as never);
    expect(ledger.append.mock.calls[0]?.[1]).toEqual([
      { kind: 'direction', phase: 'idea', topic: 'start.steer', statement: 'Quieter', decidedBy: 'author' },
      { kind: 'rejected', phase: 'idea', topic: 'start.rejected', statement: 'A ferry that only runs at night', why: 'Too gothic', decidedBy: 'author' },
    ]);
    expect(rounds.create.mock.calls[0]?.[0]).toMatchObject({ projectId: 7n, stepKey: 'start', round: 2, steer: 'Quieter', input: { text: 'A ferry town.' }, focus: null });
    expect(created.status).toBe('pending');
  });

  it('should run a sourced screen’s round on its pass, focused on the screen', async () => {
    const { service, calls, rounds, ledger } = fakeService({ latest: { round: readyPass, jobStatus: 'done' }, ready: readyPass });

    await service.openRound(7n, 'engine_world', { nudges: ['Darker'], feedback: [{ optionId: 'w1', verdict: 'not', reason: 'Too neat' }] });

    expect(calls[0]).toBe('lock:engine');
    expect(rounds.create.mock.calls[0]?.[0]).toMatchObject({ stepKey: 'engine', round: 5, focus: 'engine_world', nudges: ['Darker'] });
    expect(ledger.append.mock.calls[0]?.[1]).toEqual([
      { kind: 'rejected', phase: 'world', topic: 'engine_world.rejected', statement: 'Every crossing costs a memory', why: 'Too neat', decidedBy: 'author' },
    ]);
  });

  it('should refuse feedback on an option outside the screen’s slice', async () => {
    const { service } = fakeService({ ready: readyPass });
    await expect(service.openRound(7n, 'engine_world', { feedback: [{ optionId: 'p1', verdict: 'more' }] })).rejects.toMatchObject({ code: 'BPR_005' });
  });

  it('should settle a round whose job was cancelled underneath it before opening the next', async () => {
    const { service, calls } = fakeService({ latest: { round: round({ status: 'pending' }), jobStatus: 'cancelled' } });
    await service.openRound(7n, 'start', {});
    expect(calls).toEqual(['lock:start', 'read:project', 'read:latest', 'settle', 'read:ready', 'create']);
  });

  it('should refuse malformed input, a nudge the step does not offer and a project that is not an original novel', async () => {
    await expect(fakeService().service.openRound(7n, 'start', { input: { startingType: 'poem' } })).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(fakeService().service.openRound(7n, 'start', { nudges: ['Make it a heist'] })).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(fakeService({ projectKind: 'translation' }).service.openRound(7n, 'start', {})).rejects.toMatchObject({ code: 'BPR_003' });
  });
});

describe('BlueprintStepService.lock', () => {
  const selection = { chips: [{ optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' }] };

  it('should take the step’s lock and append the step’s entries without staging any content', async () => {
    const { service, ledger, proposals, calls } = fakeService({ ready: readyRound });

    const result = await service.lock(7n, 'start', selection);

    expect(calls).toEqual(['lock:start', 'read:project', 'read:latest', 'read:ready', 'read:ledger', 'ledger.append']);
    expect(ledger.append.mock.calls[0]?.[1]).toEqual([
      {
        kind: 'direction',
        topic: 'start',
        statement: 'A ferry that only runs at dusk',
        payload: { kind: 'element', optionId: 'c1' },
        phase: 'idea',
        decidedBy: 'author',
        stepKey: 'start',
      },
    ]);
    expect(proposals.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ proposal: null, followUp: null });
    expect(result.entries).toHaveLength(1);
  });

  it('should supersede the last lock’s entries on a re-lock and withdraw what it no longer holds', async () => {
    const previous = ledgerEntry({ id: 1n, kind: 'direction', payload: { optionId: 'c1' } });
    const ruledOut = ledgerEntry({ id: 2n, kind: 'rejected' });
    const { service, ledger } = fakeService({ ready: readyRound, active: [previous, ruledOut] });

    const result = await service.lock(7n, 'start', selection);

    expect(ledger.supersede.mock.calls[0]?.[1]).toBe(1n);
    expect(ledger.supersede.mock.calls[0]?.[2]).toMatchObject({ kind: 'direction', statement: 'A ferry that only runs at dusk', decidedBy: 'author', stepKey: 'start' });
    expect(ledger.withdraw.mock.calls.map(call => call[1])).toEqual([2n]);
    expect(result.entries.map(entry => entry.supersedesId)).toEqual([1n]);
  });

  it('should lock a sourced screen against its slice of the pass’s latest round, in the screen’s phase', async () => {
    const { service, ledger, calls } = fakeService({ ready: readyPass });

    await service.lock(7n, 'engine_world', { optionId: 'w1' });

    expect(calls[0]).toBe('lock:engine');
    expect(ledger.append.mock.calls[0]?.[1]).toEqual([
      {
        kind: 'decision',
        topic: 'world.rules',
        statement: 'Every crossing costs a memory',
        phase: 'world',
        decidedBy: 'author',
        stepKey: 'engine_world',
        payload: { lockedSlice: sliceDigest(engineOptions.world) },
      },
    ]);
    await expect(service.lock(7n, 'engine_world', { optionId: 'p1' })).rejects.toMatchObject({ code: 'BPR_005' });
  });

  it('should refuse to lock a pass', async () => {
    await expect(fakeService({ ready: readyPass }).service.lock(7n, 'engine', { optionId: 'w1' })).rejects.toMatchObject({ code: 'BPR_007' });
  });

  it('should apply a materialised change-set as the author inside the lock transaction, with content ops only', async () => {
    const changeSet = [{ op: 'premise.update' as const, premise: 'A ferryman carries the dead.' }];
    const { service, proposals, proposalApply, tx } = fakeService({ ready: readyRound }, [withPlan({ changeSet })]);

    const result = await service.lock(7n, 'start', selection);

    expect(proposals.create.mock.calls[0]).toEqual([
      7n,
      { kind: 'blueprint', scopeType: 'project', scopeRef: 'blueprint:start', summary: 'Blueprint: start locked', changeSet, allowedOps: BLUEPRINT_CHANGE_OPS },
      tx,
    ]);
    expect(BLUEPRINT_CHANGE_OPS.some(op => op.startsWith('action.'))).toBe(false);
    expect(proposalApply.apply.mock.calls[0]).toEqual([7n, 300n, { tx }]);
    expect(result.proposal?.id).toBe(300n);
  });

  it('should run the follow-up after the commit and report its failure without undoing the lock', async () => {
    const afterCommit = mock(async () => {
      throw new TypeError('queue unavailable');
    });
    const { service, ledger } = fakeService({ ready: readyRound }, [withPlan({ entries: [{ kind: 'decision', topic: 'start', statement: 'A ferry town' }], afterCommit })]);

    const result = await service.lock(7n, 'start', selection);

    expect(ledger.append).toHaveBeenCalled();
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(result.entries).toHaveLength(1);
    expect(result.followUp).toEqual({ ok: false, error: 'The follow-up work failed; the lock itself is saved.' });
  });

  it('should report a follow-up that succeeded', async () => {
    const { service } = fakeService({ ready: readyRound }, [withPlan({ afterCommit: async () => undefined })]);
    expect((await service.lock(7n, 'start', selection)).followUp).toEqual({ ok: true });
  });

  it('should refuse to lock while a round is running or on an option no round offered', async () => {
    await expect(fakeService({ latest: { round: round({ status: 'pending' }), jobStatus: 'pending' } }).service.lock(7n, 'start', selection)).rejects.toMatchObject({
      code: 'BPR_002',
    });
    await expect(fakeService().service.lock(7n, 'start', selection)).rejects.toMatchObject({ code: 'BPR_005' });
    await expect(fakeService({ ready: readyRound }).service.lock(7n, 'start', { chips: [] })).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('BlueprintStepService.state', () => {
  it('should show each screen its slice of its pass’s latest round', async () => {
    const { service } = fakeService({ perStep: [{ round: readyPass, jobStatus: 'done' }] });

    const states = await service.state(7n);
    const byKey = new Map(states.map(state => [state.step.key, state.latestRound]));

    expect(byKey.get('start')).toBeNull();
    expect(byKey.get('engine')?.options).toEqual(engineOptions);
    expect(byKey.get('engine_world')?.options).toEqual(engineOptions.world);
    expect(byKey.get('engine_core')?.options).toEqual(engineOptions.core);
  });
});
