import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export class ModelCallTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM call exceeded ${ms}ms timeout budget`);
    this.name = 'ModelCallTimeoutError';
  }
}

const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ConnectionRefused',
  'ConnectionClosed',
]);

const MAX_CAUSE_DEPTH = 4;

function statusOf(err: object): unknown {
  const direct = (err as { status?: unknown }).status;
  return direct ?? (err as { response?: { status?: unknown } }).response?.status;
}

/**
 * A failure worth trying again later: the call timed out, was rate limited, met a 5xx or lost its connection. A refusal the request itself
 * caused — authentication, a context-length or other 4xx — fails the same way however often it is retried.
 */
export function isTransientModelError(err: unknown, depth = 0): boolean {
  if (!(err instanceof Error) || depth > MAX_CAUSE_DEPTH) return false;
  if (err instanceof ModelCallTimeoutError || err.name === 'TimeoutError') return true;
  const status = statusOf(err);
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;
  if (err instanceof TypeError && /fetch failed|network/i.test(err.message)) return true;
  return isTransientModelError(err.cause, depth + 1);
}

/** The router's give-up error, flagged so a durable job knows whether a later attempt could fare better. */
export function modelCallFailed(lastErr: unknown): AppError {
  return AppErrorCode.AI_007.create({ transient: isTransientModelError(lastErr) }, lastErr);
}

export function isTransientModelFailure(err: AppError): boolean {
  return err.code === AppErrorCode.AI_007.code && err.data?.['transient'] === true;
}
