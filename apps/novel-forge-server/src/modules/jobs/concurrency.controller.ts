/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ConcurrencyController {
  private readonly locks = new Map<string, Promise<void>>();

  // Serialize concurrent calls for the same key by chaining each call onto
  // the previous promise. Different keys run fully in parallel.
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(key) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>(r => (resolve = r));
    this.locks.set(key, next);

    await existing;
    try {
      return await fn();
    } finally {
      resolve();
      // Only delete if no new waiter has replaced this promise since we set it.
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  lockKey(projectId: bigint, isLocal: boolean): string {
    return isLocal ? 'local' : `project:${projectId}`;
  }
}
