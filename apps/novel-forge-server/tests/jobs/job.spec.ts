import { describe, expect, it } from 'bun:test';

import { ConcurrencyController } from '@modules/jobs/concurrency.controller';

function gate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>(resolve => (open = resolve));
  return { opened, open };
}

describe('ConcurrencyController', () => {
  it('should serialize concurrent calls with the same key', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];
    const first = gate();

    const task1 = controller.run('shared', async () => {
      await first.opened;
      results.push(1);
    });
    const task2 = controller.run('shared', async () => {
      results.push(2);
    });

    await Promise.resolve();
    expect(results).toEqual([]);
    first.open();
    await Promise.all([task1, task2]);
    expect(results).toEqual([1, 2]);
  });

  it('should run concurrent calls with different keys in parallel', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];
    const first = gate();

    const task1 = controller.run('key-a', async () => {
      await first.opened;
      results.push(1);
    });
    const task2 = controller.run('key-b', async () => {
      results.push(2);
    });

    await task2;
    first.open();
    await task1;
    expect(results).toEqual([2, 1]);
  });

  it('should propagate errors thrown by fn', async () => {
    const controller = new ConcurrencyController();
    const boom = new Error('boom');
    await expect(
      controller.run('err-key', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('should release the lock after fn throws so subsequent calls succeed', async () => {
    const controller = new ConcurrencyController();
    await expect(
      controller.run('release-key', async () => {
        throw new Error('oops');
      }),
    ).rejects.toThrow('oops');
    const result = await controller.run('release-key', async () => 42);
    expect(result).toBe(42);
  });

  it('should share one lock key across projects for local LLM calls', () => {
    const controller = new ConcurrencyController();
    expect(controller.lockKey(1n, true)).toBe('local');
    expect(controller.lockKey(99n, true)).toBe('local');
  });

  it('should scope the lock key to the project for remote LLM calls', () => {
    const controller = new ConcurrencyController();
    expect(controller.lockKey(42n, false)).toBe('project:42');
    expect(controller.lockKey(7n, false)).toBe('project:7');
  });

  it('should serialize three concurrent calls on the same key in order', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];
    const first = gate();

    const t1 = controller.run('triple', async () => {
      await first.opened;
      results.push(1);
    });
    const t2 = controller.run('triple', async () => {
      results.push(2);
    });
    const t3 = controller.run('triple', async () => {
      results.push(3);
    });

    first.open();
    await Promise.all([t1, t2, t3]);
    expect(results).toEqual([1, 2, 3]);
  });
});
