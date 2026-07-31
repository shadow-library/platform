/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ApiError, type ErrorResponse } from './api-error';

/**
 * Defining types
 */

/**
 * The serializable failure a server function reports for a non-2xx, non-modeled response. Server functions
 * must return plain data across the RPC boundary — a thrown `ApiError` would lose its `status`/`fields`/
 * `retryAfterSeconds` through the serializer — so failures travel as this envelope and are rehydrated into
 * an `ApiError` on the client by `call()`.
 */
export interface ApiFailure extends ErrorResponse {
  status: number;
  retryAfterSeconds?: number;
}

/** A server-function result: the typed body on success (including modeled non-2xx), or a failure envelope. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/**
 * Declaring the constants
 */

/**
 * Unwraps a server-function result: returns the typed body, or rehydrates the failure envelope into a
 * thrown `ApiError` so callers (queries, mutations, flow state machines) see the same error surface they
 * would from a direct browser fetch.
 */
export async function call<T>(result: Promise<ApiResult<T>>): Promise<T> {
  const resolved = await result;
  if (resolved.ok) return resolved.data;
  throw new ApiError(resolved.failure.status, resolved.failure, resolved.failure.retryAfterSeconds);
}
