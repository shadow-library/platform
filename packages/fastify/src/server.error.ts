/**
 * Importing npm packages
 */
import { AppError, ErrorCode, ErrorType } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const ERROR_STATUS_CODES: Record<ErrorType, number> = {
  [ErrorType.CLIENT_ERROR]: 400,
  [ErrorType.HTTP_ERROR]: 400,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.SERVER_ERROR]: 500,
  [ErrorType.UNAUTHENTICATED]: 401,
  [ErrorType.UNAUTHORIZED]: 403,
  [ErrorType.VALIDATION_ERROR]: 422,
  [ErrorType.CONFLICT]: 409,
};

export class ServerError extends AppError<ServerErrorCode> {
  getStatusCode(): number {
    return this.error.getStatusCode();
  }
}

export class ServerErrorCode extends ErrorCode {
  private readonly statusCode: number;

  protected constructor(code: string, type: ErrorType, msg: string, statusCode?: number) {
    super(code, type, msg);
    this.statusCode = statusCode ?? ERROR_STATUS_CODES[type];
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  /*!
   * List of all server related errors
   */

  /** An unexpected server error occurred while processing the request */
  static readonly S001 = new ServerErrorCode('S001', ErrorType.SERVER_ERROR, 'An unexpected server error occurred while processing the request');
  /** The requested endpoint does not exist */
  static readonly S002 = new ServerErrorCode('S002', ErrorType.NOT_FOUND, 'The requested endpoint does not exist');
  /** The provided input data is invalid or does not meet validation requirements */
  static readonly S003 = new ServerErrorCode('S003', ErrorType.VALIDATION_ERROR, 'The provided input data is invalid or does not meet validation requirements');
  /** Authentication credentials are required to access this resource */
  static readonly S004 = new ServerErrorCode('S004', ErrorType.UNAUTHENTICATED, 'Authentication credentials are required to access this resource');
  /** Access denied due to insufficient permissions to perform this operation */
  static readonly S005 = new ServerErrorCode('S005', ErrorType.UNAUTHORIZED, 'Access denied due to insufficient permissions to perform this operation');
  /** The request is malformed or contains invalid parameters */
  static readonly S006 = new ServerErrorCode('S006', ErrorType.CLIENT_ERROR, 'The request is malformed or contains invalid parameters');
  /** Rate limit exceeded due to too many requests sent in a given time frame */
  static readonly S007 = new ServerErrorCode('S007', ErrorType.CLIENT_ERROR, 'Rate limit exceeded due to too many requests sent in a given time frame', 429);
  /** Resource conflict as the requested operation conflicts with existing data */
  static readonly S008 = new ServerErrorCode('S008', ErrorType.CONFLICT, 'Resource conflict as the requested operation conflicts with existing data');
  /** The requested resource could not be found */
  static readonly S009 = new ServerErrorCode('S009', ErrorType.NOT_FOUND, 'The requested resource could not be found');
  /** Access blocked due to security policy restrictions */
  static readonly S010 = new ServerErrorCode('S010', ErrorType.UNAUTHORIZED, 'Access blocked due to security policy restrictions');
}
