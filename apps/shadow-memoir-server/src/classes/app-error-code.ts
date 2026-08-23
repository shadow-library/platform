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

  /** The account is mid-deletion (§21); normal traffic is refused until the state machine finishes or is never started */
  static readonly ACC_002 = AppErrorCode.forbidden('ACC_002', 'This account is being deleted and cannot process this request');

  /*!
   * Command Errors
   */

  /** The envelope names a command type this server has no registered handler for */
  static readonly CMD_001 = AppErrorCode.badRequest('CMD_001', "Unknown command type '{type}'");

  /*!
   * Hero Errors
   */

  /** A coin spend exceeds the balance; the `accounts.coins >= 0` CHECK is the backstop, this is the surfaced refusal */
  static readonly HRO_001 = AppErrorCode.conflict('HRO_001', 'Not enough coins for this purchase');

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
