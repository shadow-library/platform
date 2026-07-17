/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { utils } from '../utils';
import { ErrorCode } from './error-code.error';

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

/**
 * Declaring the constants
 *
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
