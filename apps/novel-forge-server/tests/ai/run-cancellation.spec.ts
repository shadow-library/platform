import { afterEach, describe, expect, it } from 'bun:test';

import { RunCancellationService } from '@modules/ai/graphs/run-cancellation.service';
import { type RecordedCancel } from '@modules/ai/graphs/run-control.repository';

interface FakeRuns {
  recorded: RecordedCancel | null;
  wanted: Set<string> | Error;
  heartbeats: boolean[];
}

const services: RunCancellationService[] = [];

function cancellation(local: string[] = []): { service: RunCancellationService; runs: FakeRuns; aborted: string[] } {
  const aborted: string[] = [];
  const runs: FakeRuns = { recorded: { silentMs: 0 }, wanted: new Set(), heartbeats: [] };
  const repository = {
    requestCancel: async () => runs.recorded,
    stillWanted: async (_runIds: string[], heartbeat: boolean) => {
      runs.heartbeats.push(heartbeat);
      if (runs.wanted instanceof Error) throw runs.wanted;
      return runs.wanted;
    },
  };
  const modelRouter = { abortRun: (runId: string) => (aborted.push(runId), local.includes(runId)) };
  const service = new RunCancellationService(repository as never, modelRouter as never);
  services.push(service);
  return { service, runs, aborted };
}

afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
});

describe('RunCancellationService.request', () => {
  it('should report stopping for a run another replica holds once the cancel is recorded and that replica is heartbeating', async () => {
    const { service, runs } = cancellation();
    runs.recorded = { silentMs: 4_000 };

    expect(await service.request('run-remote')).toBe('stopping');
  });

  it('should abort a run this replica holds at once, whatever its heartbeat says', async () => {
    const { service, runs, aborted } = cancellation(['run-local']);
    runs.recorded = { silentMs: 120_000 };

    expect(await service.request('run-local')).toBe('stopping');
    expect(aborted).toEqual(['run-local']);
  });

  it('should report not_delivered when the cancel is recorded but the run’s replica has gone silent', async () => {
    const { service, runs } = cancellation();
    runs.recorded = { silentMs: 31_000 };

    expect(await service.request('run-orphan')).toBe('not_delivered');
  });

  it('should report already_settled when no running run took the cancel', async () => {
    const { service, runs } = cancellation();
    runs.recorded = null;

    expect(await service.request('run-done')).toBe('already_settled');
  });
});

describe('RunCancellationService.check', () => {
  it('should check a run as soon as it is watched, so a cancel recorded before the run got here aborts it before it starts work', async () => {
    const { service, aborted } = cancellation();

    service.watch('run-1');
    await service.check();

    expect(aborted).toEqual(['run-1']);
  });

  it('should leave wanted runs running and abort the watched runs that were cancelled, settled elsewhere or deleted', async () => {
    const { service, runs, aborted } = cancellation();
    runs.wanted = new Set(['run-keep']);
    service.watch('run-keep');
    service.watch('run-cancelled');
    await service.check();

    expect(aborted).toEqual(['run-cancelled']);
    expect(runs.heartbeats).toHaveLength(2);
  });

  it('should abort nothing when the check cannot read the runs', async () => {
    const { service, runs, aborted } = cancellation();
    runs.wanted = new Error('database unreachable');
    service.watch('run-1');
    await service.check();

    expect(aborted).toEqual([]);
  });

  it('should stop checking a run once it is unwatched', async () => {
    const { service, runs, aborted } = cancellation();
    service.watch('run-1');
    await service.check();
    service.unwatch('run-1');
    runs.heartbeats.length = 0;
    await service.check();

    expect(aborted).toEqual(['run-1']);
    expect(runs.heartbeats).toEqual([]);
  });

  it('should heartbeat no more often than its interval', async () => {
    const { service, runs } = cancellation();
    runs.wanted = new Set(['run-1']);
    const start = Math.ceil(performance.now()) + 1;
    service.watch('run-1');
    await service.check();
    runs.heartbeats.length = 0;

    await service.check(start + 10_000);
    await service.check(start + 11_000);
    await service.check(start + 15_000);

    expect(runs.heartbeats).toEqual([true, false, true]);
  });
});
