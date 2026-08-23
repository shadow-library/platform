import { describe, expect, it } from 'bun:test';

import { SchedulerService } from '@server/modules/scheduler';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => (resolve = res));
  return { promise, resolve };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SchedulerService', () => {
  it('should reject registering the same sweep name twice', () => {
    const scheduler = new SchedulerService();
    scheduler.registerSweep('dup', 1000, () => {});
    expect(() => scheduler.registerSweep('dup', 1000, () => {})).toThrow();
  });

  it('should not run a sweep again before its cadence elapses', async () => {
    let runs = 0;
    const scheduler = new SchedulerService();
    scheduler.registerSweep('cadenced', 50, () => {
      runs++;
    });

    await (scheduler as any).tick();
    expect(runs).toBe(1);

    await (scheduler as any).tick();
    expect(runs).toBe(1);

    await sleep(60);
    await (scheduler as any).tick();
    expect(runs).toBe(2);
  });

  it('should not start a second tick while one is still in flight', async () => {
    let started = 0;
    const gate = deferred();
    const scheduler = new SchedulerService();
    scheduler.registerSweep('slow', 0, async () => {
      started++;
      await gate.promise;
    });

    const first = (scheduler as any).tick();
    const second = (scheduler as any).tick();
    expect(started).toBe(1);

    gate.resolve();
    await first;
    await second;
  });

  it('should isolate a failing sweep from the rest of the loop', async () => {
    let goodRuns = 0;
    const scheduler = new SchedulerService();
    scheduler.registerSweep('failing', 0, () => {
      throw new Error('boom');
    });
    scheduler.registerSweep('good', 0, () => {
      goodRuns++;
    });

    await (scheduler as any).tick();
    expect(goodRuns).toBe(1);

    await sleep(10);
    await (scheduler as any).tick();
    expect(goodRuns).toBe(2);
  });

  it('should drain an in-flight tick before onApplicationStop resolves', async () => {
    const gate = deferred();
    let sweepFinished = false;
    const scheduler = new SchedulerService();
    scheduler.registerSweep('draining', 0, async () => {
      await gate.promise;
      sweepFinished = true;
    });

    const tickPromise = (scheduler as any).tick();

    const stopPromise = scheduler.onApplicationStop();
    gate.resolve();
    await stopPromise;
    await tickPromise;

    expect(sweepFinished).toBe(true);
  });
});
