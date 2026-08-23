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

  /** No quest with that id belongs to the caller, or it has been soft-deleted; a foreign or deactivated id reads exactly like a nonexistent one */
  static readonly QST_002 = AppErrorCode.notFound('QST_002', 'Quest not found');

  /** Anchor scheduling is strict-time; a quest cannot become (or be created as) Anchor without a start time */
  static readonly QST_003 = AppErrorCode.badRequest('QST_003', 'Anchor quests require a start time');

  /** The quest's recurrence rule does not place an occurrence on the given date */
  static readonly QST_004 = AppErrorCode.badRequest('QST_004', 'This quest has no occurrence on {date}');

  /** Postpone is unavailable for Recovery and Optional quests (PRD §2.2) */
  static readonly QST_005 = AppErrorCode.badRequest('QST_005', 'Postpone is not available for this quest');

  /** Quest logs are editable for 7 days after the fact, then read-only (PRD §3.3/S10) */
  static readonly QST_006 = AppErrorCode.forbidden('QST_006', 'This quest log is outside its 7-day edit window');

  /** No quest log exists at the addressed occurrence, or it belongs to another account */
  static readonly QST_007 = AppErrorCode.notFound('QST_007', 'Quest log not found');

  /** Reschedule moves a scheduled time; day-level quests (Goal/Recovery/Optional) have none to move */
  static readonly QST_008 = AppErrorCode.badRequest('QST_008', 'Reschedule is not available for this quest');

  /*!
   * Cosmetic Errors
   */

  /** The cosmetic is already unlocked for this account, so a repeat purchase must not charge again */
  static readonly CSM_001 = AppErrorCode.conflict('CSM_001', 'This cosmetic is already unlocked');

  /*!
   * Finance Errors
   */

  /** A category with this key already exists for the account */
  static readonly FIN_001 = AppErrorCode.conflict('FIN_001', 'A category with this key already exists');

  /** This subscription cycle has already produced its expense; a multi-device race converges here rather than duplicating */
  static readonly FIN_002 = AppErrorCode.conflict('FIN_002', 'This billing cycle has already been confirmed');

  /** No expense with that id belongs to the caller; a foreign expense id reads exactly like a nonexistent one */
  static readonly FIN_003 = AppErrorCode.notFound('FIN_003', 'Expense not found');

  /** No subscription with that id belongs to the caller */
  static readonly FIN_004 = AppErrorCode.notFound('FIN_004', 'Subscription not found');

  /** No category with that id belongs to the caller, or it is not one of the 9 built-ins */
  static readonly FIN_005 = AppErrorCode.notFound('FIN_005', 'Category not found');

  /** An expense edit tried to change the currency; the product models a currency change as delete+create so a new rate can be locked */
  static readonly FIN_006 = AppErrorCode.badRequest('FIN_006', 'Currency cannot be changed on an existing expense; delete and re-create it instead');

  /*!
   * OCR Errors
   */

  /** The account's daily OCR scan quota is exhausted; `resetAt` is the next local-midnight instant in the account timezone (ARCHITECTURE §14.3) */
  static readonly OCR_001 = AppErrorCode.badRequest('OCR_001', 'Daily OCR scan quota exhausted; resets at {resetAt}', 429);

  /** No `OcrStructuringClient` implementation is wired for this environment yet (real client lands with T-33) — the endpoint never fabricates a result */
  static readonly OCR_002 = AppErrorCode.unavailable('OCR_002', 'OCR structuring service is not configured');

  /*!
   * Metric Errors
   */

  /** A metric with this name already exists for the account (`metrics_account_id_name_unique`) */
  static readonly MET_001 = AppErrorCode.conflict('MET_001', 'A metric with this name already exists');

  /** No metric with that id belongs to the caller, or it has been deactivated; a foreign or deactivated id reads exactly like a nonexistent one */
  static readonly MET_002 = AppErrorCode.notFound('MET_002', 'Metric not found');

  /** A built-in metric's identity/classification cannot be edited or deleted through `metric.update`/`metric.delete` (PRD §3.8) */
  static readonly MET_003 = AppErrorCode.forbidden('MET_003', 'Built-in metrics cannot be modified or deleted');

  /** `metric.delete` on a metric still referenced by a quest's consequences requires `detach: true` (S6) — this is the warning, not a hard block */
  static readonly MET_004 = AppErrorCode.conflict('MET_004', "This metric is used by {questCount} quest(s); pass 'detach: true' to remove those links and deactivate it");
}
