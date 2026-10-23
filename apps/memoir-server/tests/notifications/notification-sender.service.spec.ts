import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { setConfig } from '@shadow-library/common/testing';

import { type NotificationOutboxRepository } from '@modules/notifications/notification-outbox.repository';
import { NotificationSenderService } from '@modules/notifications/notification-sender.service';
import { type PulseSendOutcome, type PulseTransport } from '@modules/notifications/pulse-transport';
import { type SchedulerService } from '@modules/scheduler';
import { type NotificationOutbox } from '@server/database';

const MAX_ATTEMPTS = 3;

function harness(attempts: number, outcome: PulseSendOutcome = 'sent') {
  const calls: string[] = [];
  let claimed = false;
  const row = { id: 1n, accountId: 7n, templateKey: 'memoir-weekly-digest', variables: {}, attempts } as NotificationOutbox.Row;
  const outbox = {
    claimNext: async () => (claimed ? null : ((claimed = true), row)),
    accountRecipient: async () => ({ email: 'reader@example.test', deletionState: 'none' }),
    markSent: async () => void calls.push('sent'),
    markRetry: async () => void calls.push('retry'),
    markFailed: async (_id: bigint, reason: string) => void calls.push(`failed:${reason}`),
  } as unknown as NotificationOutboxRepository;
  const transport = { send: async () => (calls.push('send'), outcome) } as unknown as PulseTransport;
  return { sender: new NotificationSenderService({} as SchedulerService, outbox, transport), calls };
}

describe('NotificationSenderService', () => {
  let restoreConfig: () => void;
  beforeAll(() => (restoreConfig = setConfig({ 'notifications.sender-batch-size': 10, 'notifications.sender-max-attempts': MAX_ATTEMPTS })));
  afterAll(() => restoreConfig());

  it('should fail a row whose earlier claims all lapsed mid-send without sending it again', async () => {
    const { sender, calls } = harness(MAX_ATTEMPTS + 1);

    await sender.drain();

    expect(calls).toEqual([`failed:claim lease lapsed after ${MAX_ATTEMPTS} attempts`]);
  });

  it('should still send a row on its final permitted attempt', async () => {
    const { sender, calls } = harness(MAX_ATTEMPTS);

    await sender.drain();

    expect(calls).toEqual(['send', 'sent']);
  });

  it('should fail a row whose final permitted attempt is refused', async () => {
    const { sender, calls } = harness(MAX_ATTEMPTS, 'rejected');

    await sender.drain();

    expect(calls).toEqual(['send', `failed:rejected after ${MAX_ATTEMPTS} attempts`]);
  });
});
