/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { utils } from '../utils';

/**
 * Defining types
 */

export interface AppErrorObject {
  code: string;
  message: string;
}

/**
 * Full-fidelity wire shape for process-boundary transport (IPC, queues, worker threads). Carries the
 * status and exposure that responses deliberately omit, so `from()` can restore an error without
 * downgrading an internal one into an exposed one.
 */
export interface SerializedAppError extends AppErrorObject {
  status: number;
  isInternal: boolean;
}

type ErrorCodeClass<T extends ErrorCode> = new (code: string, message: string, status?: number, isInternal?: boolean) => T;

/**
 * Declaring the constants
 *
 * The single error catalog base: a key carries everything an error needs — machine code, message
 * with optional `{placeholder}` interpolation, category (encoded as the HTTP status, the most
 * widely understood numeric taxonomy; non-HTTP consumers map ranges to exit codes, retry policy,
 * or dialog kinds), and whether the message is internal-only. `create()`/`throw()` mean the key
 * alone decides what is thrown — packages declare catalogs by subclassing and using the factories.
 *
 * `ErrorCode` and `AppError` share this module because each reaches for the other at runtime —
 * `create()` builds the error, `AppError.internal()` and `toResponse()` read the shared keys — so
 * splitting them into sibling files reintroduces an import cycle.
 */

export class ErrorCode {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly status = 500,
    readonly isInternal = false,
  ) {}

  /*!
   * Factories — called on the catalog subclass (`AppErrorCode.notFound(...)`) so the key belongs
   * to its catalog; the trailing status parameter covers outliers like 410, 429 and 503.
   */

  /** The request is malformed or violates a business rule (400) */
  static badRequest<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 400): T {
    return new this(code, message, status, false);
  }

  /** The operation requires an established identity (401) */
  static unauthenticated<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 401): T {
    return new this(code, message, status, false);
  }

  /** The authenticated identity lacks the required privileges (403) */
  static forbidden<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 403): T {
    return new this(code, message, status, false);
  }

  /** The requested resource or identifier could not be located (404) */
  static notFound<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 404): T {
    return new this(code, message, status, false);
  }

  /** The operation conflicts with the current state of the target resource (409) */
  static conflict<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 409): T {
    return new this(code, message, status, false);
  }

  /** The input is syntactically correct but violates data constraints (422) */
  static validation<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 422): T {
    return new this(code, message, status, false);
  }

  /** A dependency failed transiently — retryable, unlike internal errors (503) */
  static unavailable<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 503): T {
    return new this(code, message, status, false);
  }

  /** A defect or broken invariant: the message stays in logs, responses show the generic face (500) */
  static internal<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 500): T {
    return new this(code, message, status, true);
  }

  /** Builds this key's error; `data` interpolates the `{placeholders}` in the message */
  create(data?: Record<string, any>, cause?: unknown): AppError {
    return new AppError(this, data, cause);
  }

  /** Creates and throws — an expression of type `never`, usable in `??` fallbacks, ternaries, and brace-less catches */
  throw(data?: Record<string, any>, cause?: unknown): never {
    const error = this.create(data, cause);
    Error.captureStackTrace(error, this.throw);
    throw error;
  }

  /*!
   * Shared codes
   */

  /** Unknown error — the public face every internal error presents in responses */
  static readonly UNKNOWN = ErrorCode.internal('UNKNOWN', 'Unknown Error');
  /** Validation error */
  static readonly VALIDATION = ErrorCode.validation('VALIDATION_ERROR', 'Validation Error');
  /** Free-form internal invariants raised via `AppError.internal(reason)` */
  static readonly INTERNAL = ErrorCode.internal('INTERNAL', '{reason}');
  /** An outbound API request answered a failure status */
  static readonly API_REQUEST_FAILED = ErrorCode.internal('API_REQUEST_FAILED', 'API request failed with status code {status}');
  /** An outbound API request was aborted after exceeding its total time budget — retryable, hence 504 rather than a masked internal error */
  static readonly API_REQUEST_TIMEOUT = ErrorCode.unavailable('API_REQUEST_TIMEOUT', 'API request timed out after {timeout}ms', 504);
  /** An outbound API request failed without a usable response — DNS, connection, TLS, aborted stream or malformed body; the message stays generic so `toResponse()` leaks no topology, detail rides on `data.reason` and `cause` */
  static readonly API_REQUEST_NETWORK_ERROR = ErrorCode.unavailable('API_REQUEST_NETWORK_ERROR', 'API request failed due to a network or protocol error');
  /** An internal service call could not resolve the target service to a URL */
  static readonly SERVICE_UNKNOWN = ErrorCode.internal('SERVICE_UNKNOWN', 'Service could not be resolved: {reason}');
}

/**
 * The single error class of the ecosystem: which key created it decides everything — status,
 * exposure, message. `is()` matches specific keys by code string (so it survives serialization
 * boundaries and duplicate package copies) and whole catalogs by class.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly isInternal: boolean;

  constructor(
    readonly errorCode: ErrorCode,
    readonly data?: Record<string, any>,
    cause?: unknown,
  ) {
    super(data ? utils.string.interpolate(errorCode.message, data) : errorCode.message, cause === undefined ? undefined : { cause });
    this.name = this.constructor.name;
    this.code = errorCode.code;
    this.status = errorCode.status;
    this.isInternal = errorCode.isInternal;
  }

  /** A free-form internal invariant: the message stays in logs, responses show the generic face */
  static internal(reason: string, cause?: unknown): AppError {
    return new AppError(ErrorCode.INTERNAL, { reason }, cause);
  }

  /** Narrow to a specific key (matched by code string) or to a whole catalog (matched by class) */
  static is(error: unknown, match?: ErrorCode | typeof ErrorCode): error is AppError {
    if (!(error instanceof AppError)) return false;
    if (match === undefined) return true;
    if (match instanceof ErrorCode) return error.code === match.code;
    return error.errorCode instanceof match;
  }

  /**
   * Rehydrates an error that crossed a process boundary (IPC, queue payloads, worker threads).
   * Exposure defaults to internal when the wire object omits it, so masking fails closed rather than
   * leaking a reconstructed error's raw message.
   */
  static from(object: AppErrorObject & { status?: number; isInternal?: boolean }): AppError {
    return new AppError(new ErrorCode(object.code, object.message, object.status ?? 500, object.isInternal ?? true));
  }

  /** Full detail — for logs and process-internal transport; round-trips through `from()` */
  toObject(): SerializedAppError {
    return { code: this.code, message: this.message, status: this.status, isInternal: this.isInternal };
  }

  /** Masked shape for responses: internal errors expose only the generic face */
  toResponse(): AppErrorObject {
    if (this.isInternal) return { code: ErrorCode.UNKNOWN.code, message: ErrorCode.UNKNOWN.message };
    return { code: this.code, message: this.message };
  }
}
