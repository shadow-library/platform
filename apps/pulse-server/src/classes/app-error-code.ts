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
  /*!
   * Template Group Errors
   */

  /** Template group not found */
  static readonly TPL_GRP_001 = new AppErrorCode('TPL_GRP_001', ErrorType.NOT_FOUND, 'Template group not found');
  /** Template group with the given key already exists */
  static readonly TPL_GRP_002 = new AppErrorCode('TPL_GRP_002', ErrorType.CONFLICT, 'Template group with the given key already exists');
}
