/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { schema } from '@server/modules/infrastructure/datastore';
import { WebhookDeliveryService, WebhookService, WebhookTargetGuard, isPrivateAddress } from '@server/modules/infrastructure/webhook';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

type Method = 'get' | 'post' | 'patch' | 'delete';

interface ReceivedRequest {
  headers: Record<string, string>;
  body: string;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('webhook').init();
const ADMIN_EMAIL = 'admin@shadow-apps.com';

const verifySignature = (secret: string, header: string, payload: string): boolean => {
  const parts = header.split(',');
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2) ?? '';
  const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3));
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return signatures.includes(expected);
};

describe('Webhooks', () => {
  let adminSecret: string;
  let received: ReceivedRequest[];
  let receiverStatus: number;
  let receiver: ReturnType<typeof Bun.serve>;
  let receiverUrl: string;

  const request = (method: Method, path: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const base = env.getRouter().mockRequest()[method](path);
    const chain = base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: adminSecret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const createSubscription = async (eventTypes: string[], targetUrl = receiverUrl): Promise<{ id: string; secret: string }> => {
    const response = await request('post', '/api/v1/admin/webhooks', { name: 'test-hook', targetUrl, eventTypes });
    expect(response.statusCode).toBe(201);
    const json = response.json() as { webhook: { id: string }; secret: string };
    return { id: json.webhook.id, secret: json.secret };
  };

  const emitAudit = (action: string) => env.getService(AuditService).record({ action, outcome: 'SUCCESS', actorType: 'SYSTEM' });

  const fastForwardRetries = () =>
    env
      .getPostgresClient()
      .update(schema.webhookDeliveries)
      .set({ nextAttemptAt: sql`now() - interval '1 second'` });

  beforeAll(() => {
    received = [];
    receiverStatus = 200;
    receiver = Bun.serve({
      port: 0,
      fetch: async httpRequest => {
        received.push({ headers: Object.fromEntries(httpRequest.headers.entries()), body: await httpRequest.text() });
        return new Response('{}', { status: receiverStatus });
      },
    });
    receiverUrl = `http://127.0.0.1:${receiver.port}/hooks`;
  });

  afterAll(() => {
    receiver.stop(true);
  });

  beforeEach(async () => {
    env.getService(WebhookTargetGuard).allowInsecureTargets = true;
    env.getService(WebhookService).invalidateCache();
    received = [];
    receiverStatus = 200;
    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    if (!admin) throw new Error('Bootstrap admin missing');
    adminSecret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;
  });

  it('should manage subscriptions with a once-shown secret behind the admin permission', async () => {
    const { id, secret } = await createSubscription(['org.*']);
    expect(secret).toStartWith('whsec_');

    const list = await request('get', '/api/v1/admin/webhooks');
    expect((list.json() as { items: { id: string }[] }).items.some(item => item.id === id)).toBe(true);

    const detail = await request('get', `/api/v1/admin/webhooks/${id}`);
    expect(JSON.stringify(detail.json())).not.toContain(secret.slice(6));

    const updated = await request('patch', `/api/v1/admin/webhooks/${id}`, { isActive: false });
    expect(updated.json()).toMatchObject({ isActive: false });

    const removed = await request('delete', `/api/v1/admin/webhooks/${id}`);
    expect(removed.statusCode).toBe(200);
  });

  it('should refuse webhook administration to ordinary users', async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: 'pleb@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    adminSecret = (await env.getService(SessionService).create({ userId: user.id, aal: 'AAL2' })).secret;
    const response = await request('post', '/api/v1/admin/webhooks', { name: 'nope', targetUrl: receiverUrl, eventTypes: ['*'] });
    expect(response.statusCode).toBe(403);
  });

  it('should reject non-public targets when the ssrf guard is strict', async () => {
    env.getService(WebhookTargetGuard).allowInsecureTargets = false;
    for (const targetUrl of [
      'http://example.com/hooks',
      'https://localhost/hooks',
      'https://10.0.0.8/hooks',
      'https://169.254.169.254/latest',
      'https://user:pass@example.com/x',
    ]) {
      const response = await request('post', '/api/v1/admin/webhooks', { name: 'bad', targetUrl, eventTypes: ['*'] });
      expect(response.statusCode).toBe(400);
    }
  });

  it('should block delivery when dns resolves to a private address', async () => {
    const guard = env.getService(WebhookTargetGuard);
    guard.allowInsecureTargets = false;
    guard.lookupAddresses = async () => [{ address: '10.1.2.3' }];
    await expect(guard.assertDeliverable('https://rebind.example.com/hooks')).rejects.toThrow();
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('100.100.1.1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2600::1')).toBe(false);
  });

  it('should fan out matching audit events and deliver signed payloads', async () => {
    const { secret } = await createSubscription(['org.*']);
    const event = await emitAudit('org.created');

    const sent = await env.getService(WebhookDeliveryService).dispatchPending();
    expect(sent).toBe(1);
    expect(received).toHaveLength(1);

    const delivery = received[0] as ReceivedRequest;
    expect(delivery.headers['x-shadow-webhook-event']).toBe('org.created');
    expect(delivery.headers['x-shadow-webhook-id']).toMatch(/^\d+$/);
    expect(verifySignature(secret, delivery.headers['x-shadow-webhook-signature'] ?? '', delivery.body)).toBe(true);

    const payload = JSON.parse(delivery.body) as Record<string, unknown>;
    expect(payload.id).toBe(event.id);
    expect(payload.type).toBe('org.created');
    expect(payload).not.toHaveProperty('detail');
    expect(payload).not.toHaveProperty('ipAddress');
  });

  it('should not enqueue events outside the subscription filter', async () => {
    const { id } = await createSubscription(['org.*']);
    await emitAudit('security.ip_blocked');
    const deliveries = await request('get', `/api/v1/admin/webhooks/${id}/deliveries`);
    expect((deliveries.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('should retry with backoff, dead-letter, and support redelivery', async () => {
    const { id } = await createSubscription(['security.*']);
    receiverStatus = 500;
    await emitAudit('security.ip_blocked');

    const deliveryService = env.getService(WebhookDeliveryService);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fastForwardRetries();
      await deliveryService.dispatchPending();
    }

    const dead = await request('get', `/api/v1/admin/webhooks/${id}/deliveries?status=DEAD`);
    const deadItems = (dead.json() as { items: { id: string; attemptCount: number }[] }).items;
    expect(deadItems).toHaveLength(1);
    expect(deadItems[0]?.attemptCount).toBe(5);

    receiverStatus = 200;
    received = [];
    const redeliver = await request('post', `/api/v1/admin/webhooks/${id}/deliveries/${deadItems[0]?.id}/redeliver`);
    expect(redeliver.statusCode).toBe(200);
    await fastForwardRetries();
    expect(await deliveryService.dispatchPending()).toBe(1);
    expect(received).toHaveLength(1);
  });

  it('should enqueue an event at most once per subscription', async () => {
    const { id } = await createSubscription(['org.*']);
    const event = await emitAudit('org.created');
    const webhookService = env.getService(WebhookService);
    await webhookService.fanOut({ ...event });

    const rows = await env.getPostgresClient().query.webhookDeliveries.findMany({ where: eq(schema.webhookDeliveries.subscriptionId, BigInt(id)) });
    expect(rows).toHaveLength(1);
  });

  it('should keep old signatures verifiable through the rotation overlap', async () => {
    const { id, secret: oldSecret } = await createSubscription(['org.*']);
    const rotated = await request('post', `/api/v1/admin/webhooks/${id}/rotate-secret`);
    const newSecret = (rotated.json() as { secret: string }).secret;
    expect(newSecret).not.toBe(oldSecret);

    await emitAudit('org.created');
    await env.getService(WebhookDeliveryService).dispatchPending();
    expect(received).toHaveLength(1);

    const delivery = received[0] as ReceivedRequest;
    const signatureHeader = delivery.headers['x-shadow-webhook-signature'] ?? '';
    expect(verifySignature(newSecret, signatureHeader, delivery.body)).toBe(true);
    expect(verifySignature(oldSecret, signatureHeader, delivery.body)).toBe(true);
  });

  it('should skip disabled subscriptions at fan-out time', async () => {
    const { id } = await createSubscription(['org.*']);
    await request('patch', `/api/v1/admin/webhooks/${id}`, { isActive: false });
    await emitAudit('org.created');
    const deliveries = await request('get', `/api/v1/admin/webhooks/${id}/deliveries`);
    expect((deliveries.json() as { items: unknown[] }).items).toHaveLength(0);
  });
});
