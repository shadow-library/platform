/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * Shared, isomorphic HTTP contracts for the identity API. The actual transport now lives server-side
 * in `server-fetch.ts` (reached through TanStack Start server functions); this module holds only the
 * error/result shapes, which are safe to import from both the server bundle and the browser bundle.
 */

/** A single field-level validation problem, folded into the thrown error's message. */
export interface ErrorFieldDto {
  field: string;
  msg: string;
}

/** The stable machine-readable error envelope every identity endpoint answers non-2xx with. */
export interface ErrorResponseDto {
  code: string;
  type: string;
  message: string;
  fields?: ErrorFieldDto[] | null;
}

export type QueryValue = string | number | boolean;

/**
 * The serializable failure a server function reports for a non-2xx, non-modeled response. Server
 * functions must return plain data across the RPC boundary — a thrown `ApiError` subclass would lose
 * its `status`/`fields`/`retryAfterSeconds` through the serializer — so failures travel as this
 * envelope and are rehydrated into an `ApiError` on the client by `call()`.
 */
export interface ApiFailure extends ErrorResponseDto {
  status: number;
  retryAfterSeconds?: number;
}

/** A server-function result: the typed body on success (including modeled non-2xx), or a failure. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/**
 * Raised on the client for any response the caller did not model. Carries the machine `code` (for the
 * error page / inline messages), the field problems, and `retryAfterSeconds` for rate-limited responses.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields: ErrorResponseDto['fields'];
  readonly retryAfterSeconds?: number;

  constructor(status: number, body: ErrorResponseDto, retryAfterSeconds?: number) {
    // Validation errors carry the actual field problems; fold them into the message so a toast
    // explains the rejection instead of the generic sentence.
    const fieldDetail = body.fields?.length ? ` — ${body.fields.map(field => `${field.field}: ${field.msg}`).join('; ')}` : '';
    super(`${body.message}${fieldDetail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Declaring the constants
 */

/**
 * Unwraps a server-function result: returns the typed body, or rehydrates the failure envelope into a
 * thrown `ApiError` so callers (queries, mutations, the flow state machine) see the same error surface
 * they did when the fetch ran in the browser.
 */
export async function call<T>(result: Promise<ApiResult<T>>): Promise<T> {
  const resolved = await result;
  if (resolved.ok) return resolved.data;
  throw new ApiError(resolved.failure.status, resolved.failure, resolved.failure.retryAfterSeconds);
}
