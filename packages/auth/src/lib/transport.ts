import { AppError } from '@shadow-library/common';

import { AuthErrorCode } from '../errors';
import { type FetchLike } from '../interfaces';

export const TOO_MANY_REQUESTS = 429;

export function assertValidTimeout(timeout: number | undefined): void {
  if (timeout === undefined) return;
  if (!Number.isFinite(timeout) || timeout <= 0) throw AuthErrorCode.CONFIG_INVALID.create({ reason: `timeout must be a positive number of milliseconds, received ${timeout}` });
}

/** A fresh deadline is armed per call, so the 401 retry paths get the full budget each attempt rather than sharing one clock */
export function withTimeout(fetchFn: FetchLike, timeout: number | undefined): FetchLike {
  if (timeout === undefined) return fetchFn;
  return (url, init = {}) => {
    const deadline = AbortSignal.timeout(timeout);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return fetchFn(url, { ...init, signal });
  };
}

/** RFC 9110 §10.2.3 allows delta-seconds or an HTTP date; a past date reads as "retry now" */
export function retryAfterSecondsOf(response: Response): number | undefined {
  // `Number('')` is 0, so a blank header would otherwise read as "retry now" rather than "no hint"
  const header = response.headers.get('retry-after')?.trim();
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;

  const deadline = Date.parse(header);
  return Number.isNaN(deadline) ? undefined : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function isThrottled(error: unknown): boolean {
  const value: unknown = AppError.is(error) ? error.data?.throttled : undefined;
  return value === true;
}

export function retryAfterHint(error: unknown): number | undefined {
  const value: unknown = AppError.is(error) ? error.data?.retryAfterSeconds : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
