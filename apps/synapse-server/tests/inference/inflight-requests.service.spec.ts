import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { InflightRequests } from '@modules/inference/inflight-requests.service';

import { FakeTimers } from './inference.fixtures';

let restoreLogger: RestoreLogger;
let restoreConfig: RestoreConfig;
beforeAll(() => {
  restoreLogger = silenceLogger();
  restoreConfig = setConfig({ 'synapse.request.timeout-ms': 300_000, 'synapse.shutdown.grace-ms': 30_000 });
});
afterAll(() => {
  restoreConfig();
  restoreLogger();
});

const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 3; tick++) await Promise.resolve();
};

describe('InflightRequests', () => {
  it('should abort a request that outlives the request timeout', async () => {
    const timers = new FakeTimers();
    const abort = new InflightRequests(timers).begin();

    timers.delays[0]?.fire();
    await flush();

    expect([timers.delays[0]?.delayMs, abort.cause]).toEqual([300_000, 'timeout']);
  });

  it('should cancel the timeout of a request that ended and abort anything it left running', () => {
    const timers = new FakeTimers();
    const inflight = new InflightRequests(timers);
    const abort = inflight.begin();

    inflight.end(abort);

    expect([timers.delays[0]?.cancelled, inflight.size, abort.cause]).toEqual([true, 0, 'finished']);
  });

  it('should refuse new calls once draining, and abort the running ones only when the grace period ends', async () => {
    const timers = new FakeTimers();
    const inflight = new InflightRequests(timers);
    const running = inflight.begin();

    inflight.onApplicationStop();
    let refusal: unknown;
    try {
      inflight.begin();
    } catch (error) {
      refusal = error;
    }
    expect(AppError.is(refusal, AppErrorCode.SYN_PROVIDERS_EXHAUSTED)).toBe(true);
    expect(running.signal.aborted).toBe(false);

    const grace = timers.delays.find(delay => delay.delayMs === 30_000);
    grace?.fire();
    await flush();

    expect(running.cause).toBe('shutdown');
  });

  it('should start no grace period when nothing is running', () => {
    const timers = new FakeTimers();
    new InflightRequests(timers).onApplicationStop();
    expect(timers.delays).toHaveLength(0);
  });

  it('should wait for pending settlements before the database closes', async () => {
    const timers = new FakeTimers();
    const inflight = new InflightRequests(timers);
    let settle = (): void => undefined;
    inflight.track(new Promise<void>(resolve => (settle = resolve)));

    let destroyed = false;
    const destroying = inflight.onModuleDestroy().then(() => (destroyed = true));
    await flush();
    expect(destroyed).toBe(false);

    settle();
    await destroying;
    expect(destroyed).toBe(true);
  });
});
