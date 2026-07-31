/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ErrorField {
  field: string;
  msg: string;
}

/** The stable machine-readable error envelope every Shadow backend answers a non-2xx with. */
export interface ErrorResponse {
  code: string;
  type: string;
  message: string;
  fields?: ErrorField[] | null;
}

/**
 * Declaring the constants
 */

/**
 * The single error surface every transport raises on the client — the direct `APIRequest` client and the
 * server-function `call()` unwrap alike. Carries the machine `code` (for error pages / inline messages),
 * the field problems, and `retryAfterSeconds` for rate-limited responses.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields?: ErrorField[] | null;
  readonly retryAfterSeconds?: number;

  constructor(status: number, body: ErrorResponse, retryAfterSeconds?: number) {
    // Validation errors carry the actual field problems; fold them into the message so a toast explains
    // the rejection instead of the generic sentence.
    const fieldDetail = body.fields?.length ? ` — ${body.fields.map(field => `${field.field}: ${field.msg}`).join('; ')}` : '';
    super(`${body.message}${fieldDetail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** The field-level problems as a `{ field: message }` map for binding inline form errors; empty when there are none. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { field, msg } of this.fields ?? []) result[field] = msg;
    return result;
  }

  /**
   * Narrows an unknown value to `ApiError`. Prefers `instanceof`, but falls back to a shape check so the guard
   * still holds when the package is bundled more than once (a common SSR + client split), where `instanceof`
   * across the two class identities would otherwise miss.
   */
  static isApiError(value: unknown): value is ApiError {
    if (value instanceof ApiError) return true;
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'ApiError' &&
      typeof (value as { status?: unknown }).status === 'number' &&
      typeof (value as { code?: unknown }).code === 'string'
    );
  }
}

/** Type guard narrowing an unknown thrown value (a `catch` binding, a query/mutation error) to `ApiError`. */
export function isApiError(value: unknown): value is ApiError {
  return ApiError.isApiError(value);
}
