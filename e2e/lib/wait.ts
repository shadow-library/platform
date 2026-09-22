/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface WaitOptions {
  /** Default 30 s — six ticks of identity's 5 s worker loop. */
  timeoutMs?: number;
  /** Default 500 ms. */
  intervalMs?: number;
  /** Prefixes the timeout error, naming what never happened. */
  message?: string;
}

/**
 * Declaring the constants
 */

export class WaitTimeoutError extends Error {
  override readonly name = 'WaitTimeoutError';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls `probe` until it yields a value other than `undefined` and returns it, for server work that lands asynchronously (worker
 * ticks, outbox dispatch, sweeps). A probe may throw — e.g. an `expect` on an intermediate state that must never occur — and the
 * error propagates at once instead of being retried. Throws `WaitTimeoutError` when the budget runs out.
 */
export async function waitUntil<T>(probe: () => Promise<T | undefined>, options: WaitOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) throw new WaitTimeoutError(`${options.message ?? 'condition not met'} within ${timeoutMs}ms`);
    await sleep(options.intervalMs ?? 500);
  }
}
