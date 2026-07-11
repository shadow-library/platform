/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { schema } from '@server/modules/infrastructure/datastore';
import { NotificationClient, NotificationService, SendNotification } from '@server/modules/infrastructure/notification';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('notification').init();

let sentCalls: SendNotification[] = [];
let sendBehaviour: (notification: SendNotification) => Promise<void> = async () => undefined;
NotificationClient.prototype.send = async function mockedSend(notification: SendNotification): Promise<void> {
  sentCalls.push(notification);
  await sendBehaviour(notification);
};

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = env.getService(NotificationService);
    sentCalls = [];
    sendBehaviour = async () => undefined;
  });

  const outboxRow = async () => (await env.getPostgresClient().select().from(schema.notificationOutbox))[0];

  it('should enqueue a pending notification without sending it', async () => {
    await service.enqueue({ templateKey: 'email.verification', recipients: { email: 'jane@example.com' }, payload: { code: '123456' } });

    const row = await outboxRow();
    expect(row?.status).toBe('PENDING');
    expect(row?.templateKey).toBe('email.verification');
    expect(sentCalls).toHaveLength(0);
  });

  it('should dispatch pending notifications and mark them sent', async () => {
    await service.enqueue({ templateKey: 'email.otp', recipients: { email: 'jane@example.com' } });

    const sent = await service.dispatchPending();

    expect(sent).toBe(1);
    expect(sentCalls).toHaveLength(1);
    expect((await outboxRow())?.status).toBe('SENT');
  });

  it('should mark a failed delivery for retry with backoff', async () => {
    await service.enqueue({ templateKey: 'email.otp', recipients: { email: 'jane@example.com' } });
    sendBehaviour = async () => {
      throw new Error('pulse-server unavailable');
    };

    const sent = await service.dispatchPending();

    expect(sent).toBe(0);
    const row = await outboxRow();
    expect(row?.status).toBe('FAILED');
    expect(row?.attemptCount).toBe(1);
    expect(row?.lastError).toContain('pulse-server unavailable');
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should dead-letter after exhausting retries', async () => {
    await env
      .getPostgresClient()
      .insert(schema.notificationOutbox)
      .values({ templateKey: 'email.otp', recipients: { email: 'jane@example.com' }, attemptCount: 4 });
    sendBehaviour = async () => {
      throw new Error('still down');
    };

    await service.dispatchPending();

    expect((await outboxRow())?.status).toBe('DEAD');
  });

  it('should not claim the same notification twice under concurrent dispatch', async () => {
    await service.enqueue({ templateKey: 'email.otp', recipients: { email: 'jane@example.com' } });

    await Promise.all([service.dispatchPending(), service.dispatchPending()]);

    expect(sentCalls).toHaveLength(1);
  });
});
