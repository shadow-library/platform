/**
 * Importing npm packages
 */
import { ErrorType } from '@shadow-library/common';
import { ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class AppErrorCode extends ServerErrorCode {
  /**
   * Application Error Codes
   */

  /** Application not found */
  static readonly APP_001 = new AppErrorCode('APP_001', ErrorType.NOT_FOUND, 'Application not found');
  /** Application already exists */
  static readonly APP_002 = new AppErrorCode('APP_002', ErrorType.CONFLICT, 'Application already exists');
  /** Application role not found */
  static readonly APP_003 = new AppErrorCode('APP_003', ErrorType.NOT_FOUND, 'Application role not found');

  /**
   * User Error Codes
   */

  /** User not found */
  static readonly USR_001 = new AppErrorCode('USR_001', ErrorType.NOT_FOUND, 'User not found');
  /** Username already exists */
  static readonly USR_002 = new AppErrorCode('USR_002', ErrorType.CONFLICT, 'Username already exists');
  /** Email already exists */
  static readonly USR_003 = new AppErrorCode('USR_003', ErrorType.CONFLICT, 'Email already exists');
  /** Phone number already exists */
  static readonly USR_004 = new AppErrorCode('USR_004', ErrorType.CONFLICT, 'Phone number already exists');
}
