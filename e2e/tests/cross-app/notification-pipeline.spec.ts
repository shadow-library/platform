/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  createIdentitySession,
  createIdentityUser,
  deleteIdentityUser,
  identityDb,
  identitySessionContext,
  type IdentityUser,
  pulseDb,
  requireProductUrl,
  waitUntil,
} from '../../lib';
import { scopedMutate } from './helpers';

/**
 * Defining types
 */

interface OutboxRow {
  readonly id: string;
  readonly status: string;
  readonly last_error: string | null;
}

interface PulseMessageRow {
  readonly job_status: string;
  readonly service: string | null;
  readonly rendered_body: string;
}

/**
 * Declaring the constants
 *
 * The full identity → pulse interconnect chain. A genuine identity action — a user rotating their own password —
 * writes an `auth.password.changed` row into identity's `notification_outbox` transactionally with the change.
 * Identity's worker then M2M-authenticates to pulse (self-signed service token, scope `notifications:send`,
 * audience `api://pulse`) and posts the notification; pulse routes it through the seeded catch-all rule to the DEV
 * endpoint, which "delivers" by writing a `notification_messages` row. This spec watches the whole chain: outbox
 * row appears → flips `SENT` → a rendered pulse message lands for the user's email.
 *
 * The user is a throwaway one from the DB factory, deleted afterwards: a password change terminates the user's
 * other sessions, so rotating a seeded persona's password would sign out every parallel spec sharing its session.
 * Delivery is bounded by the worker's 5 000 ms tick interval, so the polls run well past the 30s default and the
 * test raises its own timeout.
 */
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';

/** Meets identity's policy (≥12 chars, upper + lower + number) and differs from the factory user's password. */
const ROTATED_PASSWORD = 'E2eRotated#Passw0rd1';

/** Overall budget for the outbox row to reach SENT — comfortably beyond a single worker tick. */
const OUTBOX_SENT_TIMEOUT_MS = 150_000;

/** Extra budget for pulse to render + persist the delivered message after the outbox flips SENT. */
const PULSE_MESSAGE_TIMEOUT_MS = 60_000;

/** Delay between DB polls — the chain is worker-driven, so a tight loop would only add noise. */
const POLL_INTERVAL_MS = 3_000;

test.describe('identity → pulse notification pipeline', () => {
  let user: IdentityUser | undefined;

  test.afterEach(async () => {
    if (user) await deleteIdentityUser(user);
    user = undefined;
  });

  test('should deliver an identity password-change notification through the worker to pulse DEV', async () => {
    test.setTimeout(OUTBOX_SENT_TIMEOUT_MS + PULSE_MESSAGE_TIMEOUT_MS + 60_000);
    user = await createIdentityUser({ label: 'pipeline' });
    const { email } = user;
    const identity = identityDb();
    const pulse = pulseDb();

    // The triggering action: the user changes their own password via the identity self-service API (session auth,
    // CSRF double-submit). This enqueues exactly one `auth.password.changed` outbox row.
    const identityUrl = requireProductUrl('identity');
    const ctx = await identitySessionContext(await createIdentitySession(user.userId));
    try {
      const change = await scopedMutate(ctx, identityUrl, 'post', '/api/v1/me/password', {
        seedPath: '/api/v1/me',
        data: { currentPassword: user.password, newPassword: ROTATED_PASSWORD },
      });
      expect(change.status(), `password change should succeed (200); body: ${await change.text()}`).toBe(200);
    } finally {
      await ctx.dispose();
    }

    // 1) The outbox row appears transactionally — it must already exist immediately after the API returns.
    //    `notification_outbox.recipients` is a jsonb *string* (double-encoded — the object lives one `#>>'{}'` unwrap
    //    in), so the email is read via `(recipients #>> '{}')::jsonb ->> 'email'`, not a direct `->>`.
    const [outboxRow] = await identity<OutboxRow[]>`
      SELECT id::text AS id, status::text AS status, last_error
      FROM notification_outbox
      WHERE (recipients #>> '{}')::jsonb->>'email' = ${email} AND template_key = ${PASSWORD_CHANGED_TEMPLATE}
      ORDER BY id DESC LIMIT 1
    `;
    if (!outboxRow) throw new Error('a new auth.password.changed outbox row must exist after the change');

    // 2) Wait for the worker to dispatch it (SENT). FAILED/DEAD is an app/infra bug, surfaced with the row's own last_error.
    await waitUntil(
      async () => {
        const [row] = await identity<OutboxRow[]>`SELECT id::text AS id, status::text AS status, last_error FROM notification_outbox WHERE id = ${outboxRow.id}`;
        if (!row) return undefined;
        expect(['PENDING', 'SENDING', 'SENT'], `outbox row ${row.id} went terminal-bad: status=${row.status} last_error=${row.last_error ?? 'null'}`).toContain(row.status);
        return row.status === 'SENT' ? row : undefined;
      },
      { timeoutMs: OUTBOX_SENT_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS, message: `outbox row ${outboxRow.id} never reached SENT — capture identity-worker logs` },
    );

    // 3) Pulse's DEV provider renders + persists a message for the email — the far end of the chain.
    const message = await waitUntil(
      async () => {
        const [row] = await pulse<PulseMessageRow[]>`
          SELECT j.status::text AS job_status, j.service, m.rendered_body
          FROM notification_messages m JOIN notification_jobs j ON j.id = m.notification_job_id
          WHERE j.recipient = ${email}
          ORDER BY m.id DESC LIMIT 1
        `;
        return row;
      },
      { timeoutMs: PULSE_MESSAGE_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS, message: 'pulse never persisted a delivered message after the outbox flipped SENT' },
    );
    expect(message.rendered_body.length, 'the delivered pulse message should have a rendered body').toBeGreaterThan(0);
  });
});
