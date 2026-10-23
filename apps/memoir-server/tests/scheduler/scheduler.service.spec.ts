import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';
import { setConfig } from '@shadow-library/common/testing';

import { SchedulerService, type SweepRun, type SweepRunRepository } from '@server/modules/scheduler';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => (resolve = res));
  return { promise, resolve };
}

function fakeSweepRuns(options: { storedRunAt?: number; rivalWins?: (name: string) => boolean; seed?: (names: string[]) => void } = {}) {
  const rows = new Map<string, Date>();
  const seeded: string[] = [];
  const claims: { name: string; cadenceMs: number }[] = [];
  const repository = {
    seed: async (names: string[]) => {
      options.seed?.(names);
      seeded.push(...names);
      for (const name of names) if (!rows.has(name)) rows.set(name, new Date(options.storedRunAt ?? 0));
      return new Map(names.map(name => [name, rows.get(name) as Date]));
    },
    claim: async (name: string, cadenceMs: number): Promise<SweepRun | null> => {
      claims.push({ name, cadenceMs });
      const lastRunAt = rows.get(name);
      if (!lastRunAt) return null;
      if (options.rivalWins?.(name)) rows.set(name, new Date());
      else if (Date.now() - lastRunAt.getTime() >= cadenceMs) return (rows.set(name, new Date()), { claimed: true, lastRunAt: rows.get(name) as Date });
      return { claimed: false, lastRunAt: rows.get(name) as Date };
    },
  } as unknown as SweepRunRepository;
  return { repository, rows, seeded, claims };
}

describe('SchedulerService', () => {
  afterEach(() => setSystemTime());

  it('should reject registering the same sweep name twice', () => {
    const scheduler = new SchedulerService(fakeSweepRuns().repository);
    scheduler.registerSweep('dup', 1000, () => {});
    expect(() => scheduler.registerSweep('dup', 1000, () => {})).toThrow();
  });

  it('should not run a sweep again before its cadence elapses', async () => {
    let runs = 0;
    const scheduler = new SchedulerService(fakeSweepRuns().repository);
    scheduler.registerSweep('cadenced', 1000, () => {
      runs++;
    });

    await (scheduler as any).tick();
    expect(runs).toBe(1);

    await (scheduler as any).tick();
    expect(runs).toBe(1);

    setSystemTime(Date.now() + 1001);
    await (scheduler as any).tick();
    expect(runs).toBe(2);
  });

  it('should not start a second tick while one is still in flight', async () => {
    let started = 0;
    const gate = deferred();
    const scheduler = new SchedulerService(fakeSweepRuns().repository);
    scheduler.registerSweep('slow', 0, async () => {
      started++;
      await gate.promise;
    });

    const first = (scheduler as any).tick();
    await (scheduler as any).tick();

    gate.resolve();
    await first;
    expect(started).toBe(1);
  });

  it('should isolate a failing sweep from the rest of the loop', async () => {
    let goodRuns = 0;
    const scheduler = new SchedulerService(fakeSweepRuns().repository);
    scheduler.registerSweep('failing', 0, () => {
      throw new Error('boom');
    });
    scheduler.registerSweep('good', 0, () => {
      goodRuns++;
    });

    await (scheduler as any).tick();
    expect(goodRuns).toBe(1);

    await (scheduler as any).tick();
    expect(goodRuns).toBe(2);
  });

  it('should drain an in-flight tick before onApplicationStop resolves', async () => {
    const gate = deferred();
    let sweepFinished = false;
    const scheduler = new SchedulerService(fakeSweepRuns().repository);
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

  it('should skip a due sweep when another replica already claimed its cadence window', async () => {
    let runs = 0;
    const sweepRuns = fakeSweepRuns({ rivalWins: () => true });
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('contended', 1000, () => {
      runs++;
    });

    await (scheduler as any).tick();

    expect(sweepRuns.claims).toEqual([{ name: 'contended', cadenceMs: 1000 }]);
    expect(runs).toBe(0);
  });

  it('should not query again until the rival run that beat it is a cadence old', async () => {
    let runs = 0;
    let rivalWins = true;
    const sweepRuns = fakeSweepRuns({ rivalWins: () => rivalWins });
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('contended', 1000, () => {
      runs++;
    });

    await (scheduler as any).tick();
    await (scheduler as any).tick();
    expect(sweepRuns.claims).toHaveLength(1);

    rivalWins = false;
    setSystemTime(Date.now() + 1001);
    await (scheduler as any).tick();
    expect(sweepRuns.claims).toHaveLength(2);
    expect(runs).toBe(1);
  });

  it('should issue no claim after a restart while the stored run is still within its cadence', async () => {
    const sweepRuns = fakeSweepRuns({ storedRunAt: Date.now() - 500 });
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('weekly', 1000, () => {});

    await (scheduler as any).tick();
    expect(sweepRuns.claims).toEqual([]);

    setSystemTime(Date.now() + 501);
    await (scheduler as any).tick();
    expect(sweepRuns.claims.map(claim => claim.name)).toEqual(['weekly']);
  });

  it('should reseed a sweep whose row disappeared instead of claiming it forever', async () => {
    const sweepRuns = fakeSweepRuns();
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('vanishing', 1000, () => {});
    await (scheduler as any).tick();

    sweepRuns.rows.delete('vanishing');
    setSystemTime(Date.now() + 1001);
    await (scheduler as any).tick();
    await (scheduler as any).tick();

    expect(sweepRuns.seeded).toEqual(['vanishing', 'vanishing']);
    expect(sweepRuns.rows.has('vanishing')).toBe(true);
  });

  it('should seed every registered sweep before the tick loop starts', async () => {
    const restoreConfig = setConfig({ 'scheduler.enabled': true, 'scheduler.tick-interval-ms': 60_000 });
    const sweepRuns = fakeSweepRuns();
    const scheduler = new SchedulerService(sweepRuns.repository);
    restoreConfig();
    scheduler.registerSweep('first', 1000, () => {});
    scheduler.registerSweep('second', 1000, () => {});

    await scheduler.onApplicationReady();
    await scheduler.onApplicationStop();

    expect(sweepRuns.seeded).toEqual(['first', 'second']);
    expect(sweepRuns.claims).toEqual([]);
  });

  it('should seed a sweep registered after boot before ever claiming it', async () => {
    const sweepRuns = fakeSweepRuns();
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('early', 1000, () => {});
    await (scheduler as any).tick();

    scheduler.registerSweep('late', 1000, () => {});
    await (scheduler as any).tick();

    expect(sweepRuns.seeded).toEqual(['early', 'late']);
    expect(sweepRuns.claims.map(claim => claim.name)).toEqual(['early', 'late']);
  });

  it('should not claim a sweep whose seeding failed until a later tick seeds it', async () => {
    let failSeed = true;
    const sweepRuns = fakeSweepRuns({
      seed: () => {
        if (failSeed) throw new Error('database unavailable');
      },
    });
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('unseeded', 0, () => {});

    await (scheduler as any).tick();
    expect(sweepRuns.claims).toEqual([]);

    failSeed = false;
    await (scheduler as any).tick();
    expect(sweepRuns.claims.map(claim => claim.name)).toEqual(['unseeded']);
  });

  it('should isolate a failing claim from the remaining sweeps', async () => {
    let goodRuns = 0;
    const sweepRuns = fakeSweepRuns({
      rivalWins: name => {
        if (name === 'unclaimable') throw new Error('database unavailable');
        return false;
      },
    });
    const scheduler = new SchedulerService(sweepRuns.repository);
    scheduler.registerSweep('unclaimable', 0, () => {});
    scheduler.registerSweep('good', 0, () => {
      goodRuns++;
    });

    await (scheduler as any).tick();

    expect(goodRuns).toBe(1);
  });
});
