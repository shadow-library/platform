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

  /** `POST /account/onboarding` called a second time; `default_currency` is locked and essentials cannot be re-run */
  static readonly ACC_003 = AppErrorCode.conflict('ACC_003', 'Onboarding has already been completed for this account');

  /** `PATCH /account` named a field that is never writable through this route (auth_provider, default_currency, timestamps) — §5.5 */
  static readonly ACC_004 = AppErrorCode.badRequest('ACC_004', "Field '{field}' is immutable and cannot be changed via PATCH");

  /*!
   * Command Errors
   */

  /** The envelope names a command type this server has no registered handler for */
  static readonly CMD_001 = AppErrorCode.badRequest('CMD_001', "Unknown command type '{type}'");

  /*!
   * Device Errors
   */

  /** No device with that id belongs to the caller; a foreign device id reads exactly like a nonexistent one */
  static readonly DEV_001 = AppErrorCode.notFound('DEV_001', 'Device not found');

  /*!
   * Sync Errors
   */

  /** The delta request names a domain no module has registered a `DeltaSource` for */
  static readonly SYN_001 = AppErrorCode.badRequest('SYN_001', "Unknown sync domain '{domain}'");

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
