/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';
import { type FetchLike } from '../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Mirrors `APIRequest.timeout()`'s positive-finite-milliseconds contract, but as configuration validation rather than a per-call guard */
export function assertValidTimeout(timeout: number | undefined): void {
  if (timeout === undefined) return;
  if (!Number.isFinite(timeout) || timeout <= 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: `timeout must be a positive number of milliseconds, received ${timeout}` });
}

/**
 * Wraps a transport so every request it makes is bounded by a total time budget via `AbortSignal.timeout`,
 * merging the deadline with any caller-supplied signal. A fresh deadline is armed per call, so the 401 retry
 * paths get the full budget each attempt rather than sharing one clock.
 */
export function withTimeout(fetchFn: FetchLike, timeout: number | undefined): FetchLike {
  if (timeout === undefined) return fetchFn;
  return (url, init = {}) => {
    const deadline = AbortSignal.timeout(timeout);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return fetchFn(url, { ...init, signal });
  };
}
