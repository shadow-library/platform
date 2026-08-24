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
   * Compassion Errors
   */

  /** No pending Recovery Quest exists for the day; already completed, expired, or never spawned */
  static readonly RCV_001 = AppErrorCode.notFound('RCV_001', 'No pending recovery quest for today');

  /** `plan.setLock` named a quest id that does not belong to the caller, or is not active */
  static readonly LCK_001 = AppErrorCode.notFound('LCK_001', 'Quest not found');

  /** The day has already been closed by rollover; the plan can no longer be locked or unlocked */
  static readonly LCK_002 = AppErrorCode.conflict('LCK_002', 'This day is already closed and cannot be locked');

  /*!
   * Cosmetic Errors
   */

  /** The cosmetic is already unlocked for this account, so a repeat purchase must not charge again */
  static readonly CSM_001 = AppErrorCode.conflict('CSM_001', 'This cosmetic is already unlocked');

  /** The command named a `cosmeticId` that is not in the T-21 catalogue */
  static readonly CSM_002 = AppErrorCode.notFound('CSM_002', 'Unknown cosmetic');

  /** `EquipCosmetic` addressed a cosmetic the account has not unlocked yet */
  static readonly CSM_003 = AppErrorCode.forbidden('CSM_003', 'This cosmetic has not been unlocked yet');

  /** `PurchaseCosmetic` addressed a catalogue entry with no coin price — achievement-only cosmetics are never purchasable (PRD §2.9) */
  static readonly CSM_004 = AppErrorCode.badRequest('CSM_004', 'This cosmetic is not available for purchase');

  /*!
   * Title Errors
   */

  /** `title.display` named a title the account has not earned; titles are never user-selected into existence, only chosen for display among ones already earned (PRD §2.9) */
  static readonly TTL_001 = AppErrorCode.forbidden('TTL_001', 'This title has not been earned yet');

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

  /*!
   * Quick-log Errors
   */

  /** No meal preset with that id belongs to the caller */
  static readonly QLG_001 = AppErrorCode.notFound('QLG_001', 'Meal preset not found');

  /*!
   * Billing Errors
   */

  /** The webhook's signature did not verify, or its timestamp fell outside the configured tolerance — the route has no identity auth, so this is the whole authentication decision (ARCHITECTURE §16.1) */
  static readonly BIL_001 = AppErrorCode.unauthenticated('BIL_001', 'Webhook signature verification failed');

  /** The `{provider}` path segment names no configured adapter */
  static readonly BIL_002 = AppErrorCode.notFound('BIL_002', "Unknown billing provider '{provider}'");

  /** No webhook secret or hosted-checkout endpoint is configured for this environment; the billing surface never falls back to an unverified or fabricated one */
  static readonly BIL_003 = AppErrorCode.unavailable('BIL_003', 'Billing provider is not configured');

  /*!
   * Receipt Errors
   */

  /** No receipt with that ref belongs to the caller, is not yet confirmed, or has been deleted; a foreign ref reads exactly like a nonexistent one (§19.2) */
  static readonly RCP_001 = AppErrorCode.notFound('RCP_001', 'Receipt not found');

  /** `POST /receipts` named a content type outside {jpeg, png, webp, heic} */
  static readonly RCP_002 = AppErrorCode.badRequest('RCP_002', "Unsupported content type '{contentType}'");

  /** Declared or HEAD-verified size exceeds `storage.max-receipt-bytes`; on confirm, the object is deleted before this is thrown */
  static readonly RCP_003 = AppErrorCode.badRequest('RCP_003', 'Receipt exceeds the {maxBytes}-byte size limit');

  /** `POST /receipts/{ref}/confirm` found no object at the presigned key — the client never PUT, or the PUT failed */
  static readonly RCP_004 = AppErrorCode.badRequest('RCP_004', 'No upload found for this receipt; PUT to the presigned URL before confirming');

  /*!
   * AI Errors
   */

  /** Free tier's monthly AI quota is exhausted; the third submission of the calendar month is refused before any `ai_tasks` row is written (ARCHITECTURE §15.1, PRD §6.8) */
  static readonly AI_001 = AppErrorCode.forbidden('AI_001', 'Free-tier AI quota exhausted for this month; upgrade to submit more questions', 402);

  /** Paid tier's daily soft cap is exhausted (ARCHITECTURE §15.1, tunable via `quotas.ai-paid-daily`) */
  static readonly AI_002 = AppErrorCode.badRequest('AI_002', 'Daily AI quota exhausted; try again tomorrow', 429);

  /** No AI task with that id belongs to the caller; a foreign or nonexistent id reads exactly like a nonexistent one */
  static readonly AI_003 = AppErrorCode.notFound('AI_003', 'AI task not found');

  /** The task has already been claimed by the worker (or finished); the cancel-vs-claim race resolves in the worker's favor (ARCHITECTURE §15.1) */
  static readonly AI_004 = AppErrorCode.conflict('AI_004', 'This task is no longer pending and cannot be cancelled');

  /** The scheduled daily query is a paid-only surface (ARCHITECTURE §25, PRD §6.9) */
  static readonly AI_005 = AppErrorCode.forbidden('AI_005', 'A scheduled daily query requires a paid subscription', 402);

  /** No AI result with that id belongs to the caller */
  static readonly AI_006 = AppErrorCode.notFound('AI_006', 'AI result not found');

  /** `suggestionIndex` addressed a position outside the result's `suggestions` array */
  static readonly AI_007 = AppErrorCode.badRequest('AI_007', 'This result has no suggestion at index {suggestionIndex}');

  /** The addressed suggestion's deep-link quest id does not belong to the caller, or no longer exists */
  static readonly AI_008 = AppErrorCode.notFound('AI_008', 'The quest this suggestion targets was not found');

  /** In-cluster inference was unreachable or answered outside the prompt contract; the worker retries the task and refunds quota once attempts are exhausted (never surfaced to a client — no user route calls inference) */
  static readonly AI_009 = AppErrorCode.unavailable('AI_009', 'In-cluster inference did not return a usable answer');

  /** The §6.6 post-filter refused the model output; the task fails and its quota is refunded rather than shipping an answer that breaks a guardrail */
  static readonly AI_010 = AppErrorCode.unavailable('AI_010', 'The generated answer was refused by the output guardrails');

  /*!
   * Account Export Errors
   */

  /** No export job with that id belongs to the caller; a foreign or nonexistent id reads exactly like a nonexistent one */
  static readonly EXP_001 = AppErrorCode.notFound('EXP_001', 'Export job not found');

  /** ARCHITECTURE §20: 1/day/account abuse guard (`export.max-per-day`, tunable) */
  static readonly EXP_002 = AppErrorCode.conflict('EXP_002', 'Export request limit reached for today; try again later');
}
