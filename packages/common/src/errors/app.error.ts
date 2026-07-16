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

  /** Rehydrates an error that crossed a process boundary (IPC, queue payloads, worker threads) */
  static from(object: AppErrorObject & { status?: number }): AppError {
    return new AppError(new ErrorCode(object.code, object.message, object.status ?? 500));
  }

  /** Full detail — for logs and process-internal transport */
  toObject(): AppErrorObject {
    return { code: this.code, message: this.message };
  }

  /** Masked shape for responses: internal errors expose only the generic face */
  toResponse(): AppErrorObject {
    if (!this.isInternal) return this.toObject();
    return { code: ErrorCode.UNKNOWN.code, message: ErrorCode.UNKNOWN.message };
  }
}
