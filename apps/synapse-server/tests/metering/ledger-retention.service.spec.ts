import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { type CatalogTimers } from '@modules/catalog/active-catalog.cache';
import { LedgerRetentionService } from '@modules/metering/ledger-retention.service';

import { FakeMeteringRepository } from './fake-metering.repository';

class FakeTimers implements CatalogTimers {
  readonly tickers: { intervalMs: number; tick: () => void; stopped: boolean }[] = [];

  every(intervalMs: number, tick: () => void): () => void {
    const ticker = { intervalMs, tick, stopped: false };
    this.tickers.push(ticker);
    return () => (ticker.stopped = true);
  }

  after(): { elapsed: Promise<void>; cancel: () => void } {
    return { elapsed: new Promise<void>(() => undefined), cancel: () => undefined };
  }
}

const NOW = new Date('2026-10-17T12:00:00.000Z');
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

let restoreLogger: RestoreLogger;
let restoreConfig: RestoreConfig;
beforeAll(() => {
  restoreLogger = silenceLogger();
  restoreConfig = setConfig({ 'synapse.ledger.retention-days': 400, 'synapse.request.timeout-ms': 300_000, 'synapse.shutdown.grace-ms': 30_000 });
});
afterAll(() => {
  restoreConfig();
  restoreLogger();
});

describe('LedgerRetentionService', () => {
  it('should mark rows pending past the request timeout, shutdown grace and margin, and prune past the retention period', async () => {
    const repository = new FakeMeteringRepository();
    await new LedgerRetentionService(repository.asRepository(), new FakeTimers()).sweep(NOW);
    expect(repository.sweeps).toEqual([{ unsettledBefore: new Date('2026-10-17T11:49:30.000Z'), pruneBefore: new Date('2025-09-12T12:00:00.000Z') }]);
  });

  it('should prune at most once a day while marking unsettled rows on every pass', async () => {
    const repository = new FakeMeteringRepository();
    const service = new LedgerRetentionService(repository.asRepository(), new FakeTimers());

    await service.sweep(NOW);
    await service.sweep(at(10 * 60_000));
    await service.sweep(at(86_400_000));

    expect(repository.sweeps.map(cutoffs => cutoffs.pruneBefore !== undefined)).toEqual([true, false, true]);
  });

  it('should keep the daily prune due when another replica held the lock', async () => {
    const repository = new FakeMeteringRepository();
    const service = new LedgerRetentionService(repository.asRepository(), new FakeTimers());

    repository.sweepResult = () => undefined;
    await service.sweep(NOW);
    repository.sweepResult = () => ({ unsettled: 0, pruned: 0 });
    await service.sweep(at(10 * 60_000));

    expect(repository.sweeps.map(cutoffs => cutoffs.pruneBefore !== undefined)).toEqual([true, true]);
  });

  it('should sweep once when ready, then every ten minutes until stopped', async () => {
    const repository = new FakeMeteringRepository();
    const timers = new FakeTimers();
    const service = new LedgerRetentionService(repository.asRepository(), timers);

    service.onApplicationReady();
    await service.sweep();
    timers.tickers[0]?.tick();
    await service.sweep();
    service.onApplicationStop();

    expect(timers.tickers.map(ticker => [ticker.intervalMs, ticker.stopped])).toEqual([[600_000, true]]);
    expect(repository.sweeps.length).toBeGreaterThanOrEqual(2);
  });

  it('should join a sweep already running rather than start a second', async () => {
    const repository = new FakeMeteringRepository();
    const service = new LedgerRetentionService(repository.asRepository(), new FakeTimers());
    await Promise.all([service.sweep(), service.sweep()]);
    expect(repository.sweeps).toHaveLength(1);
  });

  it('should never throw when the database fails', async () => {
    const repository = new FakeMeteringRepository();
    repository.sweepResult = () => new Error('connection reset');
    expect(await new LedgerRetentionService(repository.asRepository(), new FakeTimers()).sweep()).toBeUndefined();
  });
});
