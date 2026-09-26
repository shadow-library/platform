import { describe, expect, it } from 'bun:test';

import { singleFlight } from '../src/lib/single-flight';

describe('singleFlight', () => {
  it('should refuse a second run started in the same tick, before the first reaches its first await', async () => {
    const flight = singleFlight();
    let runs = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (release = resolve));
    const first = flight.run(async () => {
      runs++;
      await gate;
      return 'first';
    });
    const second = flight.run(async () => {
      runs++;
      return 'second';
    });
    expect(flight.busy).toBe(true);
    release();
    expect(await Promise.all([first, second])).toEqual(['first', undefined]);
    expect(runs).toBe(1);
  });

  it('should free the flag after a failure, so the author can try again', async () => {
    const flight = singleFlight();
    await expect(flight.run(() => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
    expect(flight.busy).toBe(false);
    expect(await flight.run(() => Promise.resolve(2))).toBe(2);
  });
});
