/**
 * Importing npm packages
 */
import { type APIResponse, expect, type Page } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { findSetCookie, type FlowStepBody, identityDb } from '../../lib';

/**
 * Defining types
 */

type OutboxRecipient = 'email' | 'phone';

/** Options shared by the two pollers below — how long to keep looking and how often. */
interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/** A snapshot of a user's stored PASSWORD credential — enough to write it back verbatim, bypassing the reuse guard. */
export interface PasswordCredentialSnapshot {
  readonly hash: string;
  readonly algorithm: string;
  readonly version: number;
  /** Highest `password_history.id` at capture time, so restore can delete only the rows the test added. */
  readonly historyHighWater: string;
}

/**
 * Declaring the constants
 *
 * Identity-only helpers that the shared `e2e/lib` deliberately does not carry: driving the `OtpInput`
 * widget, timestamped throwaway registration emails, polling the `notification_outbox` for a freshly
 * enqueued OTP or side-effect row, and recognising the server's rate-limit refusal so a spec can skip
 * (never fail) when the sticky `register/init` budget is exhausted for the hour.
 */

/** Default poll budget for outbox reads — the rows are written transactionally, so they land fast; a few seconds covers replica/commit lag. */
const DEFAULT_POLL: Required<PollOptions> = { timeoutMs: 8_000, intervalMs: 300 };

/** The outbox template an organisation invitation is enqueued under; its payload carries the raw accept token. */
const INVITE_TEMPLATE = 'organisation-invitation';

/** A unique, unmistakably-synthetic `.test` email per registration run — timestamped so a rerun never collides with a prior account. */
export function uniqueRegistrationEmail(): string {
  return `e2e.reg.${Date.now()}@shadow-apps.test`;
}

/** True when a JSON API response is the platform's rate-limit refusal (`SEC_001`/429) — the signal to skip rather than fail. */
export async function isRateLimited(response: APIResponse): Promise<boolean> {
  if (response.status() !== 429) return false;
  return true;
}

/**
 * Types `code` into the shared `OtpInput` (a fieldset of single-character boxes). Each keystroke advances
 * focus internally, so we focus the first box and let `keyboard.type` follow the moving focus — driving the
 * boxes one at a time the way a human would, which also fires the widget's `onComplete` on the final digit.
 */
export async function fillOtp(page: Page, code: string): Promise<void> {
  const firstBox = page.getByRole('textbox', { name: /character 1 of \d/i });
  await firstBox.click();
  await page.keyboard.type(code, { delay: 40 });
}

async function pollPayloadValue(field: OutboxRecipient, recipient: string, templateKey: string, payloadKey: string, options: PollOptions): Promise<string> {
  const { timeoutMs, intervalMs } = { ...DEFAULT_POLL, ...options };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await identityDb()<{ value: string | null }[]>`
      SELECT ((payload #>> '{}')::jsonb) ->> ${payloadKey} AS value
      FROM notification_outbox
      WHERE ((recipients #>> '{}')::jsonb) ->> ${field} = ${recipient} AND template_key = ${templateKey}
      ORDER BY id DESC
      LIMIT 1
    `;
    const value = rows[0]?.value ?? undefined;
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`No ${templateKey} ${payloadKey} for ${recipient} within ${timeoutMs}ms`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Polls the identity outbox until `email` has an OTP under `templateKey`, returning it — or throws when none
 * lands in time. Identity stores `recipients`/`payload` as double-encoded jsonb string scalars (the values come
 * back as JSON *text*, not objects — see the report), so we unwrap with `#>> '{}'` and re-parse rather than the
 * plain `->> 'email'` the shared `fetchLatestOtp` uses, which returns NULL against this shape.
 */
export function pollOtp(email: string, templateKey: string, options: PollOptions = {}): Promise<string> {
  return pollPayloadValue('email', email, templateKey, 'code', options);
}

/** `pollOtp` for a code texted to `phone`. */
export function pollSmsOtp(phone: string, templateKey: string, options: PollOptions = {}): Promise<string> {
  return pollPayloadValue('phone', phone, templateKey, 'code', options);
}

/** The raw accept token of the newest organisation invitation enqueued for `email`. */
export function pollInviteToken(email: string, options: PollOptions = {}): Promise<string> {
  return pollPayloadValue('email', email, INVITE_TEMPLATE, 'token', options);
}

/** How many outbox rows identity has enqueued for `recipient`, optionally under one template. */
export async function countOutboxRows(field: OutboxRecipient, recipient: string, templateKey?: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM notification_outbox
    WHERE ((recipients #>> '{}')::jsonb) ->> ${field} = ${recipient} AND (${templateKey ?? null}::text IS NULL OR template_key = ${templateKey ?? null})
  `;
  return row?.count ?? 0;
}

/** The current highest `notification_outbox` id for `email`+`templateKey` (0 when none) — a baseline to prove a later action enqueued a *new* row. */
export async function maxOutboxId(email: string, templateKey: string): Promise<bigint> {
  const rows = await identityDb()<{ id: string }[]>`
    SELECT COALESCE(MAX(id), 0)::text AS id
    FROM notification_outbox
    WHERE ((recipients #>> '{}')::jsonb) ->> 'email' = ${email} AND template_key = ${templateKey}
  `;
  return BigInt(rows[0]?.id ?? '0');
}

/** Polls until a `notification_outbox` row newer than `afterId` exists for `email`+`templateKey`, proving the triggering action enqueued it. */
export async function pollOutboxRowAfter(email: string, templateKey: string, afterId: bigint, options: PollOptions = {}): Promise<void> {
  const { timeoutMs, intervalMs } = { ...DEFAULT_POLL, ...options };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const current = await maxOutboxId(email, templateKey);
    if (current > afterId) return;
    if (Date.now() >= deadline) throw new Error(`No new ${templateKey} outbox row for ${email} within ${timeoutMs}ms (baseline ${afterId})`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/** Asserts a JSON error envelope carries the expected machine `code`, surfacing the actual body in the failure message. */
export async function expectErrorCode(response: APIResponse, code: string): Promise<void> {
  const body = (await response.json()) as { code?: string };
  expect(body.code, `expected error code ${code}, got body ${JSON.stringify(body)}`).toBe(code);
}

/**
 * Snapshots `userId`'s PASSWORD credential (and the password-history high-water mark) so a spec that exercises a
 * real password change can put the seeded credential back verbatim afterwards. A UI "change it back" cannot do
 * this idempotently: identity refuses to reuse any of the last five passwords (`PASSWORD_HISTORY_DEPTH`), so on
 * a rerun both the temporary password and the seeded one are already in history. Writing the original hash
 * directly — and pruning the history rows the test appended — keeps the account usable by `auth.setup` forever.
 */
export async function capturePasswordCredential(userId: string): Promise<PasswordCredentialSnapshot> {
  const rows = await identityDb()<{ hash: string; algorithm: string; version: number }[]>`
    SELECT up.hash, up.algorithm, up.version
    FROM user_passwords up
    JOIN user_auth_identities uai ON uai.id = up.user_auth_identity_id
    WHERE uai.user_id = ${userId} AND uai.provider = 'PASSWORD'
  `;
  const credential = rows[0];
  if (!credential) throw new Error(`No PASSWORD credential found for user ${userId}`);

  const historyRows = await identityDb()<{ id: string }[]>`
    SELECT COALESCE(MAX(id), 0)::text AS id FROM password_history WHERE user_id = ${userId}
  `;
  return { ...credential, historyHighWater: historyRows[0]?.id ?? '0' };
}

/** Writes `snapshot` back onto `userId`'s PASSWORD credential and deletes the history rows added since capture — a full state restore. */
export async function restorePasswordCredential(userId: string, snapshot: PasswordCredentialSnapshot): Promise<void> {
  await identityDb()`
    UPDATE user_passwords up
    SET hash = ${snapshot.hash}, algorithm = ${snapshot.algorithm}::password_algorithm, version = ${snapshot.version}
    FROM user_auth_identities uai
    WHERE up.user_auth_identity_id = uai.id AND uai.user_id = ${userId} AND uai.provider = 'PASSWORD'
  `;
  await identityDb()`DELETE FROM password_history WHERE user_id = ${userId} AND id > ${snapshot.historyHighWater}`;
}

export const SESSION_COOKIE = '__Host-sid';

export async function flowStepOf(response: APIResponse): Promise<FlowStepBody> {
  return (await response.json()) as FlowStepBody;
}

/** The `__Host-sid` a completed flow set, failing the test when it set none. */
export function expectSessionCookie(response: APIResponse): string {
  const secret = findSetCookie(response, SESSION_COOKIE)?.value;
  expect(secret, 'a completed flow sets __Host-sid').toBeTruthy();
  return secret ?? '';
}

export function expectNoSessionCookie(response: APIResponse): void {
  expect(findSetCookie(response, SESSION_COOKIE), 'no session cookie may be issued').toBeUndefined();
}

/** The verification challenges identity issued for one auth flow, oldest first. */
export async function flowChallenges(flowId: string): Promise<{ type: string; target: string }[]> {
  return identityDb()<{ type: string; target: string }[]>`SELECT type, target FROM verification_challenges WHERE flow_id = ${flowId} ORDER BY created_at`;
}
