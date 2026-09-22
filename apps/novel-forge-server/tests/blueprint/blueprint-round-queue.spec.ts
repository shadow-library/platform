import { describe, expect, it, mock } from 'bun:test';

import { BlueprintRoundQueue } from '@modules/blueprint/engine/blueprint-round-queue.service';
import { type RoundWithJob } from '@modules/blueprint/engine/blueprint-round.service';
import { blueprintStep, BlueprintStepRegistry } from '@modules/blueprint/engine/blueprint-step.registry';
import { startStep } from '@modules/blueprint/steps/start.step';
import { type Blueprint } from '@server/database';

import { enginePass, engineWorldScreen, round } from './blueprint-fixtures';

interface FakeState {
  latest?: RoundWithJob;
  enqueueFails?: boolean;
  cancelOutcome?: 'cancelled' | 'stopping' | 'already_settled';
}

function fakeQueue(state: FakeState = {}) {
  const opened = round({ id: 12n, round: 3, status: 'pending', jobId: null });
  const steps = { openRound: mock(async () => opened) };
  let latest = state.latest;
  const rounds = {
    attachJob: mock(async (_roundId: bigint, jobId: string) => ({ ...opened, jobId })),
    settle: mock(async (_roundId: bigint, status: Blueprint.RoundStatus, error: string | null) => {
      if (latest) latest = { ...latest, round: { ...latest.round, status, error } };
      return { ...opened, status, error };
    }),
    latestForStep: mock<(projectId: bigint, stepKey: string) => Promise<RoundWithJob | undefined>>(async () => latest),
  };
  const jobService = {
    enqueue: mock(async () => {
      if (state.enqueueFails) throw new TypeError('database unavailable');
      return 'job-9';
    }),
    cancel: mock(async () => ({ status: 'cancelled', outcome: state.cancelOutcome ?? 'cancelled' })),
  };
  const jobExecutor = { dispatch: mock(async () => undefined) };
  const registry = new BlueprintStepRegistry([blueprintStep(startStep), blueprintStep(enginePass), blueprintStep(engineWorldScreen)]);
  const queue = new BlueprintRoundQueue(steps as never, rounds as never, registry, jobService as never, jobExecutor as never);
  return { queue, steps, rounds, jobService, jobExecutor };
}

describe('BlueprintRoundQueue.start', () => {
  it('should queue a blueprint job for the round and dispatch it once the round names it', async () => {
    const { queue, jobService, rounds, jobExecutor } = fakeQueue();

    const queued = await queue.start(7n, 'start', { steer: 'Quieter' });

    expect(jobService.enqueue.mock.calls[0]).toEqual([7n, 'blueprint', 'start#3', { roundId: '12' }] as never);
    expect(rounds.attachJob.mock.calls[0]).toEqual([12n, 'job-9'] as never);
    expect(jobExecutor.dispatch.mock.calls[0]).toEqual(['job-9'] as never);
    expect(queued.jobId).toBe('job-9');
  });

  it('should fail the round when the job cannot be queued', async () => {
    const { queue, rounds, jobExecutor } = fakeQueue({ enqueueFails: true });

    await expect(queue.start(7n, 'start', {})).rejects.toThrow('database unavailable');
    expect(rounds.settle.mock.calls[0]?.[1]).toBe('failed');
    expect(jobExecutor.dispatch).not.toHaveBeenCalled();
  });
});

describe('BlueprintRoundQueue.cancel', () => {
  it('should cancel a queued round through its job and settle it at once', async () => {
    const { queue, jobService, rounds } = fakeQueue({ latest: { round: round({ status: 'pending', jobId: 'job-9' }), jobStatus: 'pending' } });

    const result = await queue.cancel(7n, 'start');

    expect(jobService.cancel.mock.calls[0]).toEqual(['job-9', 7n] as never);
    expect(rounds.settle.mock.calls[0]?.[1]).toBe('cancelled');
    expect(result).toMatchObject({ outcome: 'cancelled', round: { status: 'cancelled' } });
  });

  it('should cancel a sourced screen’s round on its pass', async () => {
    const { queue, rounds } = fakeQueue({
      latest: { round: round({ stepKey: 'engine', status: 'running', jobId: 'job-9' }), jobStatus: 'in_progress' },
      cancelOutcome: 'stopping',
    });

    await queue.cancel(7n, 'engine_world');

    expect(rounds.latestForStep.mock.calls[0]?.[1]).toBe('engine');
  });

  it('should leave a running round for its runner to settle', async () => {
    const { queue, rounds } = fakeQueue({ latest: { round: round({ status: 'running', jobId: 'job-9' }), jobStatus: 'in_progress' }, cancelOutcome: 'stopping' });

    expect((await queue.cancel(7n, 'start')).outcome).toBe('stopping');
    expect(rounds.settle).not.toHaveBeenCalled();
  });

  it('should refuse when the step has no running round', async () => {
    await expect(fakeQueue({ latest: { round: round({ status: 'ready' }), jobStatus: 'done' } }).queue.cancel(7n, 'start')).rejects.toMatchObject({ code: 'BPR_006' });
    await expect(fakeQueue().queue.cancel(7n, 'start')).rejects.toMatchObject({ code: 'BPR_006' });
  });
});
