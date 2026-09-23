/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  CLUSTER_HOST_CANDIDATES,
  fastForwardWebhookDelivery,
  findAuditEvents,
  getWebhook,
  GUARD_REFUSAL_ERROR,
  type HostReceiver,
  listWebhookDeliveries,
  listWebhooks,
  patchWebhook,
  PRIVATE_RESOLVING_TARGET,
  readWebhookDeliveries,
  redeliverWebhookDelivery,
  registerWebhook,
  removeWebhook,
  rotateWebhookSecret,
  setWebhookDeliveryAttempts,
  sleep,
  startHostReceiver,
  waitUntil,
  type WebhookDeliveryRow,
  type WebhookItem,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectRefused } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Admin webhooks with the SSRF guard left strict, which is how the deployment runs: identity refuses every private or
 * plain-http target at registration and re-resolves the hostname again right before delivery. No delivery in this spec is
 * ever meant to arrive — a webhook that really reaches a receiver needs a public https endpoint (or
 * `WEBHOOKS_ALLOW_INSECURE_TARGETS` in an environment of its own), so the signed-payload, redirect and dual-secret
 * bullets stay out of scope. The receiver started below exists to be refused: it is a real HTTP server on this host, and
 * the assertions show identity will not take its address and never contacts it.
 *
 * Subscriptions are global rows, so a subscription here matches events another copy of this spec writes too. Every
 * assertion therefore names the audit event it is about and never counts the delivery list.
 */

const RETRY_LADDER_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 5;

let receiver: HostReceiver;

async function auditEventId(action: string, webhookId: string): Promise<string> {
  const rows = await findAuditEvents(action, webhookId);
  const newest = rows.at(-1);
  expect(newest, `${action} was audited against webhook ${webhookId}`).toBeDefined();
  return (newest as { id: string }).id;
}

/** The subscription's delivery rows for one audit event — at most one, since a subscription is enqueued once per event. */
async function deliveriesOfEvent(webhookId: string, eventId: string): Promise<WebhookDeliveryRow[]> {
  return (await readWebhookDeliveries(webhookId)).filter(row => row.eventId === eventId);
}

function awaitDelivery(webhookId: string, eventId: string, accept: (row: WebhookDeliveryRow) => boolean, message: string): Promise<WebhookDeliveryRow> {
  return waitUntil(async () => (await deliveriesOfEvent(webhookId, eventId)).find(accept), { message, timeoutMs: 60_000 });
}

/** Renames the subscription, which is an event it subscribes to, and answers with the audit event id that names it. */
async function triggerMatchingEvent(admin: APIRequestContext, webhook: WebhookItem): Promise<string> {
  const before = (await findAuditEvents('webhook.updated', webhook.id)).length;
  const response = await patchWebhook(admin, webhook.id, { name: `${webhook.name}-${before + 1}` });
  expect(response.status(), await response.text()).toBe(200);
  return auditEventId('webhook.updated', webhook.id);
}

test.beforeAll(async () => {
  receiver = await startHostReceiver();
});

test.afterAll(async () => {
  await receiver?.close();
});

test.describe('identity webhook administration', () => {
  test('should show a subscription secret exactly once and let only an elevated admin manage it', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const user = await identity.createUser({ label: 'whk-outsider' });
    const { ctx: outsider } = await identity.signIn(user, { aal: 'AAL2' });
    const subscription = await identity.createWebhook({ label: 'secret' });

    expect(subscription.secret).toMatch(/^whsec_[A-Za-z0-9_-]{20,}$/);

    const detail = await getWebhook(admin, subscription.id);
    expect(detail.status()).toBe(200);
    const detailBody = await detail.text();
    expect(detailBody, 'the detail view never shows the signing secret again').not.toContain(subscription.secret);
    expect(detailBody).not.toContain('whsec_');
    expect(await detail.json()).toMatchObject({ id: subscription.id, name: subscription.name, targetUrl: subscription.targetUrl, isActive: true });

    const listed = await listWebhooks(admin);
    expect(listed.status()).toBe(200);
    const listBody = await listed.text();
    expect(listBody).not.toContain('whsec_');
    expect(((await listed.json()) as { items: WebhookItem[] }).items.find(item => item.id === subscription.id)).toBeDefined();

    await expectRefused(await listWebhooks(outsider), 403, 'ADM_001', 'an ordinary user may not list subscriptions');
    await expectRefused(
      await registerWebhook(outsider, { name: 'e2e-usurped', targetUrl: PRIVATE_RESOLVING_TARGET, eventTypes: ['webhook.updated'] }),
      403,
      'ADM_001',
      'an ordinary user may not register one',
    );
    expect((await listWebhooks(admin)).status(), 'the admin route still answers the admin after the refusals').toBe(200);

    const disabled = await patchWebhook(admin, subscription.id, { isActive: false });
    expect(disabled.status(), await disabled.text()).toBe(200);
    expect(await disabled.json()).toMatchObject({ isActive: false });

    const rotated = await rotateWebhookSecret(admin, subscription.id);
    expect(rotated.status(), await rotated.text()).toBe(200);
    const { secret } = (await rotated.json()) as { secret: string };
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{20,}$/);
    expect(secret, 'rotation mints a new secret').not.toBe(subscription.secret);

    const removed = await removeWebhook(admin, subscription.id);
    expect(removed.status(), await removed.text()).toBe(200);
    expect(await removed.json()).toEqual({ success: true });
    await expectRefused(await getWebhook(admin, subscription.id), 404, 'WHK_001', 'a deleted subscription is gone');
  });

  test('should refuse every private or non-https target, and refuse a private-resolving hostname at delivery', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const hostTargets = CLUSTER_HOST_CANDIDATES.flatMap(host => [receiver.urlFor(host, '/e2e-webhook'), receiver.urlFor(host, '/e2e-webhook').replace('http://', 'https://')]);
    const refused = [
      'http://webhooks.example.com/hook',
      'https://localhost/hook',
      'https://10.0.0.8/hook',
      'https://192.168.1.5/hook',
      'https://100.100.0.1/hook',
      'https://[::1]/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://user:pass@webhooks.example.com/hook',
      ...hostTargets,
    ];

    for (const targetUrl of refused) {
      const response = await registerWebhook(admin, { name: `e2e-refused-${Date.now()}`, targetUrl, eventTypes: ['e2e.never.refused'] });
      await expectRefused(response, 400, 'WHK_002', `${targetUrl} must be refused`);
    }

    for (const targetUrl of ['https://8.8.8.8/hook', 'https://[2600::1]/hook']) {
      const accepted = await identity.createWebhook({ label: 'public', targetUrl });
      expect(accepted.targetUrl, `${targetUrl} is a public address and is accepted`).toBe(targetUrl);
    }

    const subscription = await identity.createWebhook({ label: 'rebind', targetUrl: PRIVATE_RESOLVING_TARGET, eventTypes: ['webhook.updated'] });
    const eventId = await triggerMatchingEvent(admin, subscription);
    const failed = await awaitDelivery(subscription.id, eventId, row => row.status === 'FAILED' || row.status === 'DEAD', 'the dispatch to a private-resolving host never failed');
    expect(failed.status, 'a hostname resolving to a private address is refused at delivery, not dead-lettered at once').toBe('FAILED');
    expect(failed.lastError).toBe(GUARD_REFUSAL_ERROR);

    expect(receiver.received(), 'the receiver on this host is never contacted — identity refuses its address').toEqual([]);
  });
});

test.describe('identity webhook delivery', () => {
  test('should enqueue a matching event once and nothing for an unmatched event or a disabled subscription', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const subscription = await identity.createWebhook({ label: 'filter', eventTypes: ['webhook.updated'] });

    expect((await rotateWebhookSecret(admin, subscription.id)).status()).toBe(200);
    const unmatched = await auditEventId('webhook.secret_rotated', subscription.id);

    const matched = await triggerMatchingEvent(admin, subscription);
    await awaitDelivery(subscription.id, matched, () => true, 'the matching event was never enqueued');
    expect(await deliveriesOfEvent(subscription.id, matched), 'a subscription is enqueued once per event').toHaveLength(1);
    expect(await deliveriesOfEvent(subscription.id, unmatched), 'an event outside the filter is never enqueued').toEqual([]);

    const disabling = await patchWebhook(admin, subscription.id, { isActive: false });
    expect(disabling.status(), await disabling.text()).toBe(200);
    const whileDisabled = await auditEventId('webhook.updated', subscription.id);
    expect(whileDisabled, 'deactivating is itself a subscribed event').not.toBe(matched);
    expect(await deliveriesOfEvent(subscription.id, whileDisabled), 'a disabled subscription is enqueued for nothing').toEqual([]);

    expect((await patchWebhook(admin, subscription.id, { isActive: true })).status()).toBe(200);
    const reEnabled = await triggerMatchingEvent(admin, subscription);
    await awaitDelivery(subscription.id, reEnabled, () => true, 'enqueueing did not resume once the subscription was re-enabled');
  });

  test('should retry a refused delivery on a widening backoff, dead-letter it and requeue it on redeliver', async ({ identity }) => {
    test.setTimeout(RETRY_LADDER_TIMEOUT_MS);
    const admin = (await identity.admin()).ctx;
    const subscription = await identity.createWebhook({ label: 'ladder', targetUrl: PRIVATE_RESOLVING_TARGET, eventTypes: ['webhook.updated'] });
    const eventId = await triggerMatchingEvent(admin, subscription);

    const attempted = await awaitDelivery(subscription.id, eventId, row => row.attemptCount === 1, 'the first attempt never ran');
    expect(attempted.status).toBe('FAILED');
    expect(attempted.lastError).toBe(GUARD_REFUSAL_ERROR);
    expect(attempted.dueInMs, 'a failed delivery is rescheduled into the future').toBeGreaterThan(0);

    await setWebhookDeliveryAttempts(attempted.id, MAX_ATTEMPTS - 1);
    const dead = await awaitDelivery(subscription.id, eventId, row => row.status === 'DEAD', `the delivery never dead-lettered on attempt ${MAX_ATTEMPTS}`);
    expect(dead.attemptCount).toBe(MAX_ATTEMPTS);
    const listed = await listWebhookDeliveries(admin, subscription.id, 'DEAD');
    expect(listed.find(item => item.eventId === eventId)).toMatchObject({ id: dead.id, status: 'DEAD', attemptCount: MAX_ATTEMPTS, lastError: GUARD_REFUSAL_ERROR });

    await fastForwardWebhookDelivery(dead.id);
    await sleep(12_000);
    expect((await deliveriesOfEvent(subscription.id, eventId))[0], 'a dead letter is never attempted again, however overdue it is').toMatchObject({
      status: 'DEAD',
      attemptCount: MAX_ATTEMPTS,
    });

    const requeued = await redeliverWebhookDelivery(admin, subscription.id, dead.id);
    expect(requeued.status(), await requeued.text()).toBe(200);
    const retried = await awaitDelivery(subscription.id, eventId, row => row.status !== 'DEAD' && row.attemptCount === 1, 'the redelivered attempt never ran');
    expect(retried.lastError, 'the requeued delivery is attempted from the start of the ladder and refused by the same guard').toBe(GUARD_REFUSAL_ERROR);
  });
});
