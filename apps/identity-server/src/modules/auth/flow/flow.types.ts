import { CookieSpec } from '@server/modules/auth/session';

/**
 * Outcome of one flow step. `COMPLETED` carries session cookies, `CONTINUE` advances a multi-step
 * flow, and `FAILED` reports a recoverable attempt. Expired or terminated flows are thrown.
 */
export type FlowStepResult =
  | { outcome: 'COMPLETED'; flowId: string; cookies: CookieSpec[] }
  | { outcome: 'CONTINUE'; flowId: string; status: string }
  | { outcome: 'FAILED'; flowId: string; status: string; attemptsLeft: number };
