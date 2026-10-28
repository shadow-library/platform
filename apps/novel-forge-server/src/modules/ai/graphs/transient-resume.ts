import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '@shadow-library/common';

import { isTransientModelFailure } from '../transient-model-error';

const RESUME_BACKOFF_MS = 5_000;

export interface TransientResumeOptions {
  signal: AbortSignal;
  /** Kept short against the claim TTL, which the job keeps heartbeating while it waits. */
  backoffMs?: number;
  /** Asked after the backoff; false keeps the failure, e.g. because what the resumed node would write is no longer the run's to write. */
  mayResume: () => Promise<boolean>;
  onResume?: (err: AppError) => void;
}

function isTransientFailure(err: unknown): err is AppError {
  return AppError.is(err) && isTransientModelFailure(err);
}

/** `invoke(true)` must resume the checkpointed graph rather than start it over, so only the node that failed runs again. */
export async function resumeOnceOnTransientFailure<T>(invoke: (resume: boolean) => Promise<T>, options: TransientResumeOptions): Promise<T> {
  const { signal } = options;
  try {
    return await invoke(false);
  } catch (err) {
    if (!isTransientFailure(err) || signal.aborted) throw err;
    await delay(options.backoffMs ?? RESUME_BACKOFF_MS, undefined, { signal }).catch(() => undefined);
    if (signal.aborted || !(await options.mayResume().catch(() => false))) throw err;
    options.onResume?.(err);
    return invoke(true);
  }
}
