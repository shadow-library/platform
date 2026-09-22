import { describe, expect, it, mock } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type BlueprintPackParts } from '@modules/ai/context/blueprint-sections';
import { BlueprintRoundRunner } from '@modules/blueprint/engine/blueprint-round.runner';
import { blueprintStep, BlueprintStepRegistry } from '@modules/blueprint/engine/blueprint-step.registry';
import { type AnyBlueprintStep } from '@modules/blueprint/engine/blueprint-step.types';
import { startStep } from '@modules/blueprint/steps/start.step';
import { type Blueprint } from '@server/database';

import { engineCoreScreen, engineOptions, enginePass, engineWorldScreen, round } from './blueprint-fixtures';

interface FakeState {
  current?: Blueprint.Round;
  claimed?: boolean;
  output?: unknown;
  modelError?: Error;
  cancelRequested?: boolean;
  earlier?: Blueprint.Round[];
  steps?: AnyBlueprintStep[];
}

const readBack = { understood: [{ label: 'A ferry that only runs at night', kind: 'element' }], coachMessage: 'I read one place and no people yet.' };

function fakeRunner(state: FakeState = {}) {
  const current = state.current ?? round({ id: 12n, round: 2, status: 'pending', steer: 'Quieter', options: null });
  const earlier = state.earlier ?? [round({ id: 11n, round: 1, steer: 'Start small', coachMessage: 'Here is my reading.' })];
  const db = {
    query: {
      projects: { findFirst: mock(async () => ({ id: 7n, kind: 'new_novel', contentMode: 'standard' })) },
      decisionLedgerEntries: { findMany: mock(async () => []) },
    },
  };
  const rounds = {
    get: mock(async () => current),
    markRunning: mock(async () => state.claimed ?? true),
    markReady: mock<(roundId: bigint, outcome: unknown) => Promise<void>>(async () => undefined),
    settle: mock(async () => undefined),
    recentForStep: mock(async () => earlier),
    cancelRequested: mock(async () => state.cancelRequested ?? false),
  };
  const contextAssembler = {
    forBlueprint: mock<(projectId: bigint, ledger: unknown, parts: BlueprintPackParts) => Promise<unknown>>(async () => ({
      id: 5n,
      renderedStable: 'stable',
      renderedVolatile: 'volatile',
    })),
  };
  const modelRouter = {
    structured: mock<(prompt: unknown, input: unknown, telemetry: unknown) => Promise<unknown>>(async () => {
      if (state.modelError) throw state.modelError;
      return state.output ?? readBack;
    }),
  };
  const workflowRunService = {
    runChain: mock<(projectId: bigint, graph: string, target: string, input: unknown, fn: (runId: string) => Promise<unknown>, jobId?: string) => Promise<unknown>>(
      async (...args) => ({ runId: 'run-1', result: await args[4]('run-1') }),
    ),
    linkContextPack: mock(async () => undefined),
  };
  const pluginPolicy = { resolve: mock(async () => ({ writerClass: 'standard' })) };
  const registry = new BlueprintStepRegistry(state.steps ?? [blueprintStep(startStep)]);
  const runner = new BlueprintRoundRunner(
    { getPostgresClient: () => db } as never,
    rounds as never,
    registry,
    contextAssembler as never,
    modelRouter as never,
    workflowRunService as never,
    pluginPolicy as never,
  );
  return { runner, rounds, contextAssembler, modelRouter, workflowRunService };
}

const job = { id: 'job-9', projectId: 7n, payload: { roundId: '12' } };

describe('BlueprintRoundRunner.run', () => {
  it('should store the parsed options and coach message on the round', async () => {
    const { runner, rounds, workflowRunService, modelRouter } = fakeRunner();

    await runner.run(job);

    expect(rounds.markReady.mock.calls[0]).toEqual([
      12n,
      { options: { understood: [{ id: 'c1', label: 'A ferry that only runs at night', kind: 'element' }] }, coachMessage: 'I read one place and no people yet.' },
    ] as never);
    expect(workflowRunService.runChain.mock.calls[0]?.slice(1, 4)).toEqual(['blueprint-step', 'start#2', { roundId: '12' }] as never);
    expect(workflowRunService.runChain.mock.calls[0]?.[5]).toBe('job-9');
    expect(modelRouter.structured.mock.calls[0]?.[2]).toMatchObject({ runId: 'run-1', promptKey: 'blueprint-start', role: 'blueprint' });
  });

  it('should build the pack from the step’s earlier messages and this round’s steer', async () => {
    const { runner, contextAssembler } = fakeRunner();

    await runner.run(job);

    const parts = contextAssembler.forBlueprint.mock.calls[0]?.[2];
    expect(parts?.thread.map(message => message.text)).toEqual(['Start small', 'Here is my reading.']);
    expect(parts?.roundInput).toContain('Steer: Quieter');
  });

  it('should fail the round with a readable error when the model output cannot be used', async () => {
    const { runner, rounds } = fakeRunner({ modelError: AppErrorCode.AI_001.create() });

    await expect(runner.run(job)).rejects.toMatchObject({ code: 'AI_001' });
    expect(rounds.settle.mock.calls[0]).toEqual([12n, 'failed', 'AI model returned unparseable response'] as never);
  });

  it('should settle the round as cancelled when the author cancelled it mid-call', async () => {
    const { runner, rounds } = fakeRunner({ modelError: AppErrorCode.AI_013.create(), cancelRequested: true });

    await expect(runner.run(job)).rejects.toMatchObject({ code: 'AI_013' });
    expect(rounds.settle.mock.calls[0]).toEqual([12n, 'cancelled', null] as never);
  });

  it('should do nothing for a round that already settled', async () => {
    const { runner, modelRouter } = fakeRunner({ claimed: false });

    await runner.run(job);

    expect(modelRouter.structured).not.toHaveBeenCalled();
  });

  describe('a pass round focused on one screen', () => {
    const passRound = round({ id: 12n, stepKey: 'engine', round: 5, status: 'pending', focus: 'engine_world', options: null });
    const previous = round({ id: 11n, stepKey: 'engine', round: 4, options: engineOptions });
    const reworked = { core: [{ id: 'p9', label: 'A ferryman who forgets' }], world: [{ id: 'w9', label: 'The river keeps what it is paid' }] };
    const steps = [blueprintStep(enginePass), blueprintStep(engineCoreScreen), blueprintStep(engineWorldScreen)];

    it('should give toRound the previous options and keep the other screens’ slices', async () => {
      const { runner, rounds } = fakeRunner({ current: passRound, earlier: [previous], output: reworked, steps });

      await runner.run(job);

      expect(rounds.markReady.mock.calls[0]?.[1]).toEqual({ options: { core: engineOptions.core, world: reworked.world }, coachMessage: 'Reworked world.' } as never);
    });

    it('should refuse a pass whose toRound moved a slice it was not focused on', async () => {
      const careless = blueprintStep({ ...enginePass, toRound: (output: typeof reworked) => ({ options: output, coachMessage: 'Redid everything.' }) });
      const { runner, rounds } = fakeRunner({ current: passRound, earlier: [previous], output: reworked, steps: [careless, ...steps.slice(1)] });

      await expect(runner.run(job)).rejects.toThrow();
      expect(rounds.markReady).not.toHaveBeenCalled();
    });
  });
});
