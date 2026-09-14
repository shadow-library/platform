/**
 * Importing npm packages
 */
import { AppError } from '@shadow-library/common';

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

/** RFC 9110 §10.2.3 allows either delta-seconds or an HTTP date; a date already past reads as "retry now" */
export function retryAfterSecondsOf(response: Response): number | undefined {
  /** `Number('')` is 0, so a blank header would otherwise read as "retry now" rather than "no hint" */
  const header = response.headers.get('retry-after')?.trim();
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;

  const deadline = Date.parse(header);
  return Number.isNaN(deadline) ? undefined : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/** Identity answering "stop", as opposed to any other reason an exchange could not be completed */
export function isThrottled(error: unknown): boolean {
  const value: unknown = AppError.is(error) ? error.data?.throttled : undefined;
  return value === true;
}

/** The hint a throttled exchange carried, rescued from the error so a guard can put it back on the wire */
export function retryAfterHint(error: unknown): number | undefined {
  const value: unknown = AppError.is(error) ? error.data?.retryAfterSeconds : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
