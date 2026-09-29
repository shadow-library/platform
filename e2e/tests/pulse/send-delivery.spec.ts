/**
 * Importing npm packages
 */
import { randomInt } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  clusterTokensAvailable,
  deletePulseNotificationsTo,
  deleteRegistrationAttempt,
  fetchLatestOtp,
  mutate,
  pulseDb,
  type PulseStaff,
  registerInit,
  requireProductUrl,
  stepUpThroughApp,
  uniqueEmail,
} from '../../lib';
import { expect, type PulseHarness, test } from './fixtures';
import { createPublishedTemplate, createTemplate, memoirSendToken, uniqueKey } from './helpers';

/**
 * Defining types
 */

interface SendBody {
  status?: string;
  code?: string;
  fields?: { field: string; msg: string }[];
  channelResults?: { channel: string; status: string; jobId?: string; error?: { code: string } }[];
}

/**
 * Declaring the constants
 *
 * `POST /api/v1/notifications` is `@RequireScope('notifications:send')`, a scope declared `principalType: 'SERVICE'`
 * (`apps/identity-server/src/modules/bootstrap/ecosystem-seed.constants.ts:109-111`), so no session — the bootstrap admin's
 * included — can hold it. Two service clients do: identity's own outbound client, whose self-signed token e2e cannot
 * forge, and memoir's, which authenticates by its bound `memoir/memoir-server` workload identity. The producer path is
 * proven by a real identity action; the contract of the endpoint itself is driven as memoir.
 *
 * The console's manual send is its own route, `POST /api/v1/notifications/console`: a `pulse:notifications:send` permission on a
 * stepped-up session, refusing identity's and other security templates and limiting each actor to 20 sends in ten minutes, counted
 * per pulse replica (`console-send-limiter.service.ts`). Its callers are fresh staff accounts, so no test spends the seeded admin's budget.
 */

const TEMPLATES_READ = 'pulse:templates:read';
const NOTIFICATIONS_SEND = 'pulse:notifications:send';
const SENDABLE_TEMPLATE = 'sign-up';
const SENDABLE_PAYLOAD = '{ "name": "Ada" }';
const IDENTITY_TEMPLATE = 'organisation-invitation';
const IDENTITY_PAYLOAD = { organisationName: 'Acme Corp', role: 'ADMIN', token: 'inv-4f9d8a7b2c31' };
const CONSOLE_SEND_LIMIT = 20;
const CONSOLE_SEND_WINDOW_SECONDS = 600;

/** True when `templateKey` has a published version with at least one enabled channel — the send precondition. */
async function hasPublishedTemplate(templateKey: string): Promise<boolean> {
  const rows = await pulseDb()<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM templates t
    JOIN template_versions v ON v.template_id = t.id AND v.status = 'PUBLISHED'
    JOIN template_channel_settings s ON s.template_id = t.id AND s.is_enabled = true
    WHERE t.template_key = ${templateKey} AND t.is_active = true
  `;
  return (rows[0]?.count ?? 0) > 0;
}

async function countJobsTo(recipient: string): Promise<number> {
  const [row] = await pulseDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM notification_jobs WHERE recipient = ${recipient}`;
  return row?.count ?? 0;
}

function uniquePhone(): string {
  return `+1555${randomInt(1_000_000, 10_000_000)}`;
}

async function expectRefusal(response: APIResponse, status: number, code: string, message?: string): Promise<void> {
  const body = await response.text();
  expect(response.status(), message ?? body).toBe(status);
  expect((JSON.parse(body) as { code?: string }).code, body).toBe(code);
}

function consoleSend(ctx: APIRequestContext, data: Record<string, unknown>): Promise<APIResponse> {
  return mutate(ctx, 'post', '/api/v1/notifications/console', { data });
}

/** A staff account holding the console send, stepped up through pulse's own step-up route. */
async function elevatedSender(pulse: PulseHarness, label: string): Promise<PulseStaff> {
  const sender = await pulse.staff({ label, permissions: [TEMPLATES_READ, NOTIFICATIONS_SEND] });
  await stepUpThroughApp(sender, await pulse.identityCaller(sender), '/send');
  return sender;
}

async function sendAs(guest: APIRequestContext, token: string, data: Record<string, unknown>): Promise<{ response: APIResponse; body: SendBody }> {
  const response = await guest.post('/api/v1/notifications', { headers: { authorization: `Bearer ${token}` }, data });
  return { response, body: (await response.json()) as SendBody };
}

test.describe('send + delivery', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  /**
   * The end-to-end interconnect proof: registering a never-before-used email makes identity enqueue an OTP and post it to
   * pulse with its own service credential; pulse must route it (the catch-all `e2e-dev` rule), render it (the code, not the
   * raw `{{ code }}`) and deliver it through the `DEV` provider. The baseline seed runs after every pulse migration, so a
   * missing `auth.register.otp` is a broken deployment, not a reason to skip.
   */
  test('should deliver a real registration OTP end-to-end through identity -> pulse -> DEV provider', async ({ pulse }) => {
    expect(await hasPublishedTemplate('auth.register.otp'), 'auth.register.otp has no published version — the baseline seed did not run on this deployment').toBe(true);
    const email = uniqueEmail('send-delivery');

    try {
      const initResponse = await registerInit(await pulse.identityAnonymous(), email);
      expect(initResponse.status(), await initResponse.text()).toBe(200);

      const code = await pollForOtp(email, 'auth.register.otp');
      expect(code, `expected identity to enqueue an OTP for ${email}`).toBeTruthy();

      const message = await pollForDeliveredMessage(email, code as string);
      expect(message.renderedBody).toContain(code);
    } finally {
      await deleteRegistrationAttempt(email);
    }
  });

  test('should 401 IAM_001 for a well-formed send with no credential at all', async ({ pulse }) => {
    const response = await (
      await pulse.guest()
    ).post('/api/v1/notifications', {
      data: { templateKey: 'auth.register.otp', recipients: { email: 'e2e.pulse.probe@shadow-apps.test' } },
    });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_001');
  });
});

test.describe('send + delivery — service caller', () => {
  test.beforeAll(async () => {
    test.skip(!(await clusterTokensAvailable()), 'kubectl cannot mint service-account tokens against k3d-shadow-apps-dev');
  });

  test('should refuse a malformed or unroutable send without queuing a job, then accept and deliver the well-formed one', async ({ pulse }) => {
    const guest = await pulse.guest();
    const token = await memoirSendToken(await pulse.identityAnonymous());
    const email = uniqueEmail('send-contract');
    const device = uniqueKey('send-device');

    try {
      const emptyRecipients = await sendAs(guest, token, { templateKey: 'auth.password.changed', recipients: {} });
      expect(emptyRecipients.response.status()).toBe(422);
      expect(emptyRecipients.body.code).toBe('VALIDATION_ERROR');
      expect(emptyRecipients.body.fields?.some(field => field.field.includes('recipients'))).toBe(true);

      const unknownTemplate = await sendAs(guest, token, { templateKey: `e2e-missing-${Date.now()}`, recipients: { email } });
      expect(unknownTemplate.response.status()).toBe(404);
      expect(unknownTemplate.body.code).toBe('TPL_001');

      const missingVariable = await sendAs(guest, token, { templateKey: 'auth.password.changed', recipients: { email } });
      expect(missingVariable.response.status()).toBe(400);
      expect(missingVariable.body.code).toBe('NTF_004');

      const noUsableRecipient = await sendAs(guest, token, { templateKey: 'auth.register.otp', recipients: { push: device }, payload: { code: '482913' } });
      expect(noUsableRecipient.response.status()).toBe(201);
      expect(noUsableRecipient.body.status).toBe('FAILED');
      expect(noUsableRecipient.body.channelResults?.map(result => [result.channel, result.status, result.error?.code]).sort()).toEqual([
        ['EMAIL', 'FAILED', 'NTF_002'],
        ['SMS', 'FAILED', 'NTF_001'],
      ]);
      expect(await countJobsTo(email), 'no refused send may queue a job').toBe(0);
      expect(await countJobsTo(device), 'no refused send may queue a job').toBe(0);

      const accepted = await sendAs(guest, token, { templateKey: 'auth.password.changed', recipients: { email }, payload: { ipAddress: '203.0.113.7' } });
      expect(accepted.response.status()).toBe(201);
      expect(accepted.body.status).toBe('ACCEPTED');
      expect(accepted.body.channelResults).toEqual([expect.objectContaining({ channel: 'EMAIL', status: 'QUEUED', jobId: expect.any(String) })]);

      const message = await pollForDeliveredMessage(email, '203.0.113.7');
      expect(message.renderedBody).toContain('203.0.113.7');
    } finally {
      await deletePulseNotificationsTo([email, device]);
    }
  });

  test('should fail a channel whose template has no published version or no content for it, and still send the channel that has both', async ({ pulse }) => {
    const admin = await pulse.admin();
    const guest = await pulse.guest();
    const token = await memoirSendToken(await pulse.identityAnonymous());
    const email = uniqueEmail('send-channels');
    const phone = `+1555${String(Date.now()).slice(-7)}`;

    const unpublished = await createTemplate(admin, { templateKey: uniqueKey('send-unpublished') });
    pulse.trackTemplate(unpublished.id);
    await mutate(admin, 'put', `/api/v1/templates/${unpublished.id}/channels/EMAIL`, { data: { isEnabled: true } });
    const emailOnly = await createPublishedTemplate(admin, 'send-email-only');
    pulse.trackTemplate(emailOnly.id);
    await mutate(admin, 'put', `/api/v1/templates/${emailOnly.id}/channels/SMS`, { data: { isEnabled: true } });

    const noVersion = await sendAs(guest, token, { templateKey: unpublished.templateKey, recipients: { email } });
    expect(noVersion.response.status()).toBe(201);
    expect(noVersion.body).toMatchObject({ status: 'FAILED', channelResults: [{ channel: 'EMAIL', status: 'FAILED', error: { code: 'TPL_VER_003' } }] });
    expect(await countJobsTo(email), 'an unpublished template queues nothing').toBe(0);

    const partly = await sendAs(guest, token, { templateKey: emailOnly.templateKey, recipients: { email, phone } });
    expect(partly.response.status()).toBe(201);
    expect(partly.body.status).toBe('PARTIAL_ACCEPTED');
    expect(partly.body.channelResults?.map(result => [result.channel, result.status, result.error?.code]).sort()).toEqual([
      ['EMAIL', 'QUEUED', undefined],
      ['SMS', 'FAILED', 'TPL_CNT_003'],
    ]);
    expect(await countJobsTo(phone), 'the content-less channel queues nothing').toBe(0);
    expect(await countJobsTo(email)).toBe(1);
  });
});

test.describe('send + delivery — console', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should walk an unelevated sender through step-up from /send, restore the form and deliver the send', async ({ pulse, browser }) => {
    const pulseUrl = requireProductUrl('pulse');
    const sender = await pulse.staff({ label: 'console-ui', permissions: [TEMPLATES_READ, NOTIFICATIONS_SEND] });
    const email = uniqueEmail('console-send');
    const phone = uniquePhone();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      await pulse.signInBrowser(context, sender);
      const page = await context.newPage();
      await page.goto(`${pulseUrl}/send`);
      await page.getByRole('combobox', { name: 'Template key' }).fill(SENDABLE_TEMPLATE);
      await page.getByRole('option', { name: SENDABLE_TEMPLATE, exact: true }).click();
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Phone').fill(phone);
      await page.getByLabel('Payload').fill(SENDABLE_PAYLOAD);
      await page.getByRole('main').getByRole('button', { name: 'Send notification' }).click();

      await expect(page.getByRole('heading', { name: 'Confirm it’s you' }), 'the unelevated send is walked into identity’s step-up prompt').toBeVisible({ timeout: 15_000 });
      await page.getByLabel('Password', { exact: true }).fill(sender.user.password);
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      await expect(page).toHaveURL(`${pulseUrl}/send`, { timeout: 15_000 });
      await expect(page.getByRole('combobox', { name: 'Template key' }), 'the form survives the round trip').toHaveValue(SENDABLE_TEMPLATE);
      await expect(page.getByLabel('Email')).toHaveValue(email);
      await expect(page.getByLabel('Phone')).toHaveValue(phone);
      await expect(page.getByLabel('Payload')).toHaveValue(SENDABLE_PAYLOAD);
      expect(await page.evaluate(() => sessionStorage.getItem('pulse.send-draft')), 'and the stashed draft is dropped once restored').toBeNull();

      await page.getByRole('main').getByRole('button', { name: 'Send notification' }).click();
      await expect(page.getByText('Overall status: Accepted')).toBeVisible({ timeout: 15_000 });
      expect((await pollForDeliveredMessage(email, 'Ada')).renderedBody).toContain('Welcome to Shadow, Ada');
    } finally {
      await context.close();
      await deletePulseNotificationsTo([email, phone]);
    }
  });

  test('should refuse an identity template with 403 NTF_005 and the console refusal copy, queue nothing, and still send a sendable one', async ({ pulse, browser }) => {
    const pulseUrl = requireProductUrl('pulse');
    const sender = await elevatedSender(pulse, 'console-ntf005');
    const email = uniqueEmail('console-identity');
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      await expectRefusal(await consoleSend(sender.ctx, { templateKey: IDENTITY_TEMPLATE, recipients: { email }, payload: IDENTITY_PAYLOAD }), 403, 'NTF_005');

      await pulse.signInBrowser(context, sender);
      const page = await context.newPage();
      await page.goto(`${pulseUrl}/send`);
      await page.getByRole('combobox', { name: 'Template key' }).fill(IDENTITY_TEMPLATE);
      await page.getByRole('option', { name: IDENTITY_TEMPLATE, exact: true }).click();
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Payload').fill(JSON.stringify(IDENTITY_PAYLOAD));
      await page.getByRole('main').getByRole('button', { name: 'Send notification' }).click();
      const refusal = page.getByRole('alert').filter({ hasText: 'Cannot send' });
      await expect(refusal).toContainText('cannot be sent from the console. Only the flows that own them send them.');
      await expect(page).toHaveURL(`${pulseUrl}/send`);
      expect(await countJobsTo(email), 'a refused console send queues nothing').toBe(0);

      const accepted = await consoleSend(sender.ctx, { templateKey: SENDABLE_TEMPLATE, recipients: { email }, payload: { name: 'Ada' } });
      expect(accepted.status(), await accepted.text()).toBe(201);
      expect(((await accepted.json()) as SendBody).channelResults).toContainEqual(expect.objectContaining({ channel: 'EMAIL', status: 'QUEUED', jobId: expect.any(String) }));
    } finally {
      await context.close();
      await deletePulseNotificationsTo([email]);
    }
  });

  test('should ask an unelevated admin to step up with IAM_003 and refuse an elevated viewer with IAM_002, while an elevated sender still sends', async ({ pulse }) => {
    const email = uniqueEmail('console-refusals');
    const send = { templateKey: SENDABLE_TEMPLATE, recipients: { email }, payload: { name: 'Ada' } };

    try {
      await expectRefusal(await consoleSend(await pulse.admin(), send), 403, 'IAM_003');

      const viewer = await pulse.staff({ label: 'console-viewer', permissions: [TEMPLATES_READ] });
      await stepUpThroughApp(viewer, await pulse.identityCaller(viewer), '/send');
      await expectRefusal(await consoleSend(viewer.ctx, send), 403, 'IAM_002');
      expect(await countJobsTo(email), 'no refused caller queues anything').toBe(0);

      const sender = await elevatedSender(pulse, 'console-legit');
      const accepted = await consoleSend(sender.ctx, send);
      expect(accepted.status(), await accepted.text()).toBe(201);
      expect(await countJobsTo(email)).toBeGreaterThan(0);
    } finally {
      await deletePulseNotificationsTo([email]);
    }
  });

  test('should refuse a service token on the console route with IAM_002 while it still sends on the producer route', async ({ pulse }) => {
    test.skip(!(await clusterTokensAvailable()), 'kubectl cannot mint service-account tokens against k3d-shadow-apps-dev');
    const guest = await pulse.guest();
    const token = await memoirSendToken(await pulse.identityAnonymous());
    const email = uniqueEmail('console-service');
    const send = { templateKey: SENDABLE_TEMPLATE, recipients: { email }, payload: { name: 'Ada' } };

    try {
      await expectRefusal(await guest.post('/api/v1/notifications/console', { headers: { authorization: `Bearer ${token}` }, data: send }), 403, 'IAM_002');
      expect(await countJobsTo(email), 'the refused console send queues nothing').toBe(0);

      const produced = await sendAs(guest, token, send);
      expect(produced.response.status()).toBe(201);
      expect(produced.body.channelResults).toContainEqual(expect.objectContaining({ channel: 'EMAIL', status: 'QUEUED' }));
    } finally {
      await deletePulseNotificationsTo([email]);
    }
  });

  test('should refuse the 21st console send in ten minutes with 429 NTF_006 and Retry-After, for that actor alone', async ({ pulse }) => {
    const limited = await elevatedSender(pulse, 'console-limit');
    const email = uniqueEmail('console-limit');

    try {
      for (let attempt = 1; attempt <= CONSOLE_SEND_LIMIT; attempt++) {
        await expectRefusal(await consoleSend(limited.ctx, { templateKey: IDENTITY_TEMPLATE, recipients: { email }, payload: IDENTITY_PAYLOAD }), 403, 'NTF_005');
      }

      const over = await consoleSend(limited.ctx, { templateKey: SENDABLE_TEMPLATE, recipients: { email }, payload: { name: 'Ada' } });
      await expectRefusal(over, 429, 'NTF_006', 'every admitted attempt counts, refused templates included');
      const retryAfter = Number(over.headers()['retry-after']);
      expect(retryAfter, 'Retry-After names when the oldest send leaves the window').toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(CONSOLE_SEND_WINDOW_SECONDS);
      expect(await countJobsTo(email), 'nothing was queued').toBe(0);

      const other = await elevatedSender(pulse, 'console-limit-other');
      const accepted = await consoleSend(other.ctx, { templateKey: SENDABLE_TEMPLATE, recipients: { email }, payload: { name: 'Ada' } });
      expect(accepted.status(), 'another sender keeps its own budget').toBe(201);
    } finally {
      await deletePulseNotificationsTo([email]);
    }
  });
});

/** Polls identity's outbox for the OTP `fetchLatestOtp` returns, giving the worker a few seconds to catch up. */
async function pollForOtp(email: string, templateKey: string, timeoutMs = 20_000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const code = await fetchLatestOtp(email, templateKey);
    if (code) return code;
    if (Date.now() >= deadline) return undefined;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

/** Polls pulse for the delivered `notification_messages` row for `email`, once its job reaches `SENT`. */
async function pollForDeliveredMessage(email: string, expected: string, timeoutMs = 60_000): Promise<{ renderedSubject: string | null; renderedBody: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await pulseDb()<{ renderedSubject: string | null; renderedBody: string; status: string }[]>`
      SELECT m.rendered_subject AS "renderedSubject", m.rendered_body AS "renderedBody", j.status
      FROM notification_jobs j
      JOIN notification_messages m ON m.notification_job_id = j.id
      WHERE j.recipient = ${email} AND j.status = 'SENT'
      ORDER BY j.id DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (row) return row;
    if (Date.now() >= deadline) throw new Error(`No SENT notification_messages row for ${email} (expecting ${expected}) after ${timeoutMs}ms`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}
