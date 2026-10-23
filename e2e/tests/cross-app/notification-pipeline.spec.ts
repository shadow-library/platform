import { expect, test } from '@playwright/test';

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
 * The identity -> pulse chain: a password change writes an `auth.password.changed` row to `notification_outbox` in its transaction, identity's worker M2M-authenticates to
 * pulse (scope `notifications:send`, audience `api://pulse`), and pulse routes it through the seeded catch-all rule to the DEV endpoint, which writes a `notification_messages`
 * row.
 * The user is a factory throwaway because a password change terminates the user's other sessions, so rotating a seeded persona would sign out every parallel spec.
 * Delivery is bounded by the worker's 5 000 ms tick, so the test raises its own timeout past the 30s default.
 */
const PASSWORD_CHANGED_TEMPLATE = 'auth.password.changed';

const ROTATED_PASSWORD = 'E2eRotated#Passw0rd1';

const OUTBOX_SENT_TIMEOUT_MS = 150_000;

const PULSE_MESSAGE_TIMEOUT_MS = 60_000;

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

    // `notification_outbox.recipients` is a double-encoded jsonb string, so the email is read via `(recipients #>> '{}')::jsonb ->> 'email'`.
    const [outboxRow] = await identity<OutboxRow[]>`
      SELECT id::text AS id, status::text AS status, last_error
      FROM notification_outbox
      WHERE (recipients #>> '{}')::jsonb->>'email' = ${email} AND template_key = ${PASSWORD_CHANGED_TEMPLATE}
      ORDER BY id DESC LIMIT 1
    `;
    if (!outboxRow) throw new Error('a new auth.password.changed outbox row must exist after the change');

    // FAILED/DEAD is an app/infra bug, surfaced with the row's own last_error.
    await waitUntil(
      async () => {
        const [row] = await identity<OutboxRow[]>`SELECT id::text AS id, status::text AS status, last_error FROM notification_outbox WHERE id = ${outboxRow.id}`;
        if (!row) return undefined;
        expect(['PENDING', 'SENDING', 'SENT'], `outbox row ${row.id} went terminal-bad: status=${row.status} last_error=${row.last_error ?? 'null'}`).toContain(row.status);
        return row.status === 'SENT' ? row : undefined;
      },
      { timeoutMs: OUTBOX_SENT_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS, message: `outbox row ${outboxRow.id} never reached SENT — capture identity-worker logs` },
    );

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
