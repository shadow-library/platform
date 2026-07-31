/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { CheckpointJanitor } from '@modules/jobs/checkpoint.janitor';
import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { JobsModule } from '@modules/jobs/jobs.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// ─── ConcurrencyController ────────────────────────────────────────────────────

describe('ConcurrencyController', () => {
  it('serializes concurrent calls with the same key', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];

    // task1 has a 20ms delay; task2 should only start after task1 resolves.
    const task1 = controller.run('shared', async () => {
      await new Promise<void>(r => setTimeout(r, 20));
      results.push(1);
    });
    const task2 = controller.run('shared', async () => {
      results.push(2);
    });

    await Promise.all([task1, task2]);
    expect(results).toEqual([1, 2]);
  });

  it('runs concurrent calls with different keys in parallel', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];

    // task1 sleeps 30ms; task2 has no delay and a different key, so it finishes first.
    const task1 = controller.run('key-a', async () => {
      await new Promise<void>(r => setTimeout(r, 30));
      results.push(1);
    });
    const task2 = controller.run('key-b', async () => {
      results.push(2);
    });

    await Promise.all([task1, task2]);
    expect(results).toEqual([2, 1]);
  });

  it('propagates errors thrown by fn', async () => {
    const controller = new ConcurrencyController();
    const boom = new Error('boom');
    await expect(
      controller.run('err-key', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('releases the lock after fn throws so subsequent calls succeed', async () => {
    const controller = new ConcurrencyController();
    await expect(
      controller.run('release-key', async () => {
        throw new Error('oops');
      }),
    ).rejects.toThrow('oops');
    const result = await controller.run('release-key', async () => 42);
    expect(result).toBe(42);
  });

  it('returns "local" lock key for local LLM calls', () => {
    const controller = new ConcurrencyController();
    expect(controller.lockKey(1n, true)).toBe('local');
    expect(controller.lockKey(99n, true)).toBe('local');
  });

  it('returns project-scoped lock key for remote LLM calls', () => {
    const controller = new ConcurrencyController();
    expect(controller.lockKey(42n, false)).toBe('project:42');
    expect(controller.lockKey(7n, false)).toBe('project:7');
  });

  it('serializes three concurrent calls on the same key in order', async () => {
    const controller = new ConcurrencyController();
    const results: number[] = [];
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const t1 = controller.run('triple', async () => {
      await delay(10);
      results.push(1);
    });
    const t2 = controller.run('triple', async () => {
      results.push(2);
    });
    const t3 = controller.run('triple', async () => {
      results.push(3);
    });

    await Promise.all([t1, t2, t3]);
    expect(results).toEqual([1, 2, 3]);
  });
});

// ─── JobService smoke test ────────────────────────────────────────────────────

describe('JobService', () => {
  it('exposes all required instance methods', () => {
    expect(typeof JobService.prototype.enqueue).toBe('function');
    expect(typeof JobService.prototype.start).toBe('function');
    expect(typeof JobService.prototype.progress).toBe('function');
    expect(typeof JobService.prototype.succeed).toBe('function');
    expect(typeof JobService.prototype.fail).toBe('function');
    expect(typeof JobService.prototype.get).toBe('function');
    expect(typeof JobService.prototype.listByProject).toBe('function');
    expect(typeof JobService.prototype.recoverStuck).toBe('function');
    expect(typeof JobService.prototype.onModuleInit).toBe('function');
  });
});

// ─── JobExecutor smoke test ───────────────────────────────────────────────────

describe('JobExecutor', () => {
  it('exposes dispatch method', () => {
    expect(typeof JobExecutor.prototype.dispatch).toBe('function');
  });
});

// ─── CheckpointJanitor smoke test ────────────────────────────────────────────

describe('CheckpointJanitor', () => {
  it('exposes purge and onModuleInit methods', () => {
    expect(typeof CheckpointJanitor.prototype.purge).toBe('function');
    expect(typeof CheckpointJanitor.prototype.onModuleInit).toBe('function');
  });
});

// ─── JobsModule smoke test ────────────────────────────────────────────────────

describe('JobsModule', () => {
  it('is a constructable class', () => {
    expect(typeof JobsModule).toBe('function');
  });
});
