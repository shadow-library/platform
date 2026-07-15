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
}
