/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { CookieSpec } from '@server/modules/auth/session';

/**
 * Defining types
 */

/**
 * The outcome of a single flow step. COMPLETED carries the session cookies, CONTINUE advances a
 * multi-step flow without a failure, and FAILED reports a recoverable bad attempt. Terminal errors
 * (flow expired/terminated) are thrown as ServerErrors rather than represented here.
 */
export type FlowStepResult =
  | { outcome: 'COMPLETED'; flowId: string; cookies: CookieSpec[] }
  | { outcome: 'CONTINUE'; flowId: string; status: string }
  | { outcome: 'FAILED'; flowId: string; status: string; attemptsLeft: number };
