/**
 * Importing npm packages
 */
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
   * Account Errors
   */

  /** An account already exists for the given identity provider subject */
  static readonly ACC_001 = AppErrorCode.conflict('ACC_001', 'An account already exists for this identity');

  /*!
   * Quest Errors
   */

  /** This occurrence has already been moved; a reschedule is append-only and one per (quest, date) */
  static readonly QST_001 = AppErrorCode.conflict('QST_001', 'This occurrence has already been rescheduled');

  /*!
   * Cosmetic Errors
   */

  /** The cosmetic is already unlocked for this account, so a repeat purchase must not charge again */
  static readonly CSM_001 = AppErrorCode.conflict('CSM_001', 'This cosmetic is already unlocked');
}
