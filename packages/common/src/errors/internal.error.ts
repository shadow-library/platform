/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ErrorCode } from './error-code.error';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class InternalError extends Error {
  private readonly publicErrorCode: ErrorCode;

  constructor(message: string);
  constructor(publicErrorCode: ErrorCode, message: string);
  constructor(publicErrorCode: string | ErrorCode, message?: string) {
    if (!message) {
      message = publicErrorCode as string;
      publicErrorCode = ErrorCode.UNKNOWN;
    }
    super(message);
    this.name = this.constructor.name;
    this.publicErrorCode = publicErrorCode as ErrorCode;
  }

  setCause(cause: Error): this {
    this.cause = cause;
    return this;
  }

  getPublicErrorCode(): ErrorCode {
    return this.publicErrorCode;
  }

  getMessage(): string {
    return this.message;
  }
}
