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

/** The error every transport raises on the client; `retryAfterSeconds` is set for rate-limited responses. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields?: ErrorField[] | null;
  readonly retryAfterSeconds?: number;

  constructor(status: number, body: ErrorResponse, retryAfterSeconds?: number) {
    // Folded into the message so a toast explains a validation rejection instead of the generic sentence.
    const fieldDetail = body.fields?.length ? ` — ${body.fields.map(field => `${field.field}: ${field.msg}`).join('; ')}` : '';
    super(`${body.message}${fieldDetail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Field problems as a `{ field: message }` map for inline form errors. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { field, msg } of this.fields ?? []) result[field] = msg;
    return result;
  }

  // The shape check covers the package being bundled twice (SSR + client), where `instanceof` misses across the two class identities.
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

export function isApiError(value: unknown): value is ApiError {
  return ApiError.isApiError(value);
}
