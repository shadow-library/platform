import { AppError } from '@shadow-library/common';

import { type SettledStatus } from '@modules/metering';
import { ProviderCallError } from '@modules/providers';
import { AppErrorCode } from '@server/classes';

import { type AbortCause } from './request-abort';

export interface DispatchFailure {
  error: AppError;
  status: SettledStatus;
}

const SHUTDOWN_REASON = 'Synapse is shutting down; retry the call';
const DISCONNECT_REASON = 'The caller went away before the call finished';
const NOTHING_TRIED_REASON = 'No deployment could be tried';

export function shuttingDown(): AppError {
  return AppErrorCode.SYN_PROVIDERS_EXHAUSTED.create({ reason: SHUTDOWN_REASON });
}

export function providersExhausted(last: ProviderCallError | undefined): AppError {
  return AppErrorCode.SYN_PROVIDERS_EXHAUSTED.create({ reason: last?.message ?? NOTHING_TRIED_REASON });
}

function cancelled(cause: AbortCause | undefined): DispatchFailure {
  if (cause === 'timeout') return { status: 'cancelled', error: AppErrorCode.SYN_TIMEOUT.create() };
  if (cause === 'shutdown') return { status: 'cancelled', error: shuttingDown() };
  return { status: 'cancelled', error: AppErrorCode.SYN_PROVIDERS_EXHAUSTED.create({ reason: DISCONNECT_REASON }) };
}

function isRefusal(error: AppError): boolean {
  return AppError.is(error, AppErrorCode.SYN_BUDGET_CALLS) || AppError.is(error, AppErrorCode.SYN_BUDGET_COST);
}

/**
 * The `SYN_*` error a failed call answers and the status the ledger records. Once the request is aborted, whatever the upstream threw is
 * only the abort's echo. Of a provider's own failures a malformed session is the caller's fault and every other one is Synapse's; running
 * out of retryable deployments is decided by the failover loop.
 */
export function dispatchFailure(error: unknown, cause: AbortCause | undefined): DispatchFailure {
  if (AppError.is(error)) return { status: isRefusal(error) ? 'refused' : 'error', error };
  if (cause) return cancelled(cause);
  if (!(error instanceof ProviderCallError)) return { status: 'error', error: AppError.internal('The call failed unexpectedly', error) };
  if (error.code === 'aborted') return cancelled(undefined);
  if (error.code === 'timeout') return { status: 'cancelled', error: AppErrorCode.SYN_TIMEOUT.create() };
  if (error.code === 'invalid_session') return { status: 'error', error: AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'synapse.session', reason: error.message }) };
  return { status: 'error', error: AppErrorCode.SYN_UPSTREAM_ERROR.create({ reason: error.message, upstreamCode: error.code ?? null, upstreamStatus: error.status ?? null }) };
}
