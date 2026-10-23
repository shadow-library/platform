import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import type { SenderEndpointService, SenderRoutingRuleService } from '@modules/configuration';
import { NotificationJobExecutor } from '@modules/notification/notification-job.executor';
import type { NotificationProviderService } from '@modules/notification/notification-provider.service';
import type { NotificationOpResult } from '@modules/notification/providers';
import type { TemplateResolverService } from '@modules/template';
import type { Notification, Template } from '@server/database';

interface Write {
  values: Record<string, unknown>;
  sql: string;
  params: unknown[];
}

interface Fixture {
  messageType?: Template.MessageType;
  send?: () => Promise<NotificationOpResult>;
  stale?: boolean;
  leaseHeld?: boolean;
}

const lease = new Date(Date.now() + 60_000);
/** What a zone-less timestamp decodes to under a non-UTC process time zone: the stored instant shifted by the offset. */
const shiftedLease = new Date(lease.getTime() - 5.5 * 60 * 60 * 1000);

function claimedJob(overrides: Partial<Notification.Job> = {}): Notification.Job {
  return {
    id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    templateId: 1n,
    templateVersionId: 2n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    priority: 'MEDIUM',
    service: null,
    recipient: 'reader@example.com',
    payload: {},
    status: 'PROCESSING',
    attempt: 0,
    lastAttemptedAt: null,
    nextAttemptAt: shiftedLease,
    lastError: null,
    createdAt: new Date(Date.now() - 5.5 * 60 * 60 * 1000),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createExecutor(fixture: Fixture = {}) {
  const writes: Write[] = [];
  const postgres = {
    query: { templates: { findFirst: async () => ({ id: 1n, templateKey: 'welcome', messageType: fixture.messageType ?? 'TRANSACTIONAL' }) } },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => ({
          returning: async () => {
            writes.push({ values, ...new PgDialect().sqlToQuery(condition) });
            if (values['lastError'] === 'JOB_EXPIRED') return fixture.stale ? [{ id: 'job' }] : [];
            return fixture.leaseHeld === false ? [] : [{ id: 'job' }];
          },
        }),
      }),
    }),
  };
  const sendEmail = mock(fixture.send ?? (async (): Promise<NotificationOpResult> => ({ success: true })));
  const executor = new NotificationJobExecutor(
    new FakeDatabaseService({ postgres }),
    { sendEmail } as unknown as NotificationProviderService,
    { loadRenderBundle: async () => ({ subject: 'Hi', body: 'Hi', layout: null, partials: {} }) } as unknown as TemplateResolverService,
    { resolveSenderRoutingRule: async () => ({ id: 3n, senderProfileId: 4n }) } as unknown as SenderRoutingRuleService,
    { getSenderEndpointsByChannel: async () => [{ id: 5n, provider: 'DEV', identifier: 'Shadow <no-reply@shadow.test>' }] } as unknown as SenderEndpointService,
  );
  const outcome = (): Write | undefined => writes.find(write => write.values['lastError'] !== 'JOB_EXPIRED');
  return { executor, writes, outcome, sendEmail };
}

describe('NotificationJobExecutor', () => {
  it('should permanently fail a non-retriable provider error immediately', () => {
    const result: NotificationOpResult = { success: false, retriable: false, error: new Error('Invalid sender') };
    expect(createExecutor().executor['getJobStatus'](result, 1)).toBe('PERMANENTLY_FAILED');
  });

  it('should retry a transient provider error until the maximum attempt', () => {
    const result: NotificationOpResult = { success: false, retriable: true, error: new Error('Rate limited') };
    const { executor } = createExecutor();

    expect(executor['getJobStatus'](result, 1)).toBe('FAILED');
    expect(executor['getJobStatus'](result, 5)).toBe('PERMANENTLY_FAILED');
  });

  it('should fence the outcome on the lease it was handed, never on the one read back from the row', async () => {
    const { executor, outcome, sendEmail } = createExecutor();

    await executor.execute(claimedJob(), lease);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(outcome()?.values).toMatchObject({ status: 'SENT', lastError: null, nextAttemptAt: null });
    expect(outcome()?.params).toContain('PROCESSING');
    expect(outcome()?.params).toContain(lease.toISOString());
    expect(outcome()?.params).not.toContain(shiftedLease.toISOString());
  });

  it('should schedule a retry when the provider fails transiently', async () => {
    const { executor, outcome } = createExecutor({ send: async () => ({ success: false, retriable: true, error: new Error('Rate limited') }) });

    await executor.execute(claimedJob(), lease);

    expect(outcome()?.values).toMatchObject({ status: 'FAILED', lastError: 'Error' });
    expect(outcome()?.values['nextAttemptAt']).toBeInstanceOf(Date);
  });

  it('should treat a provider that does not answer in time as a retriable failure', async () => {
    const { executor, outcome } = createExecutor({ send: () => new Promise<NotificationOpResult>(() => undefined) });
    Object.assign(executor, { providerTimeoutMs: 1 });

    await executor.execute(claimedJob(), lease);

    expect(outcome()?.values).toMatchObject({ status: 'FAILED', lastError: 'PROVIDER_TIMEOUT' });
  });

  it('should judge staleness in the database against its own clock, under the held lease', async () => {
    const { executor, writes } = createExecutor({ messageType: 'OTP' });

    await executor.execute(claimedJob(), lease);

    const expiry = writes[0];
    expect(expiry?.values).toEqual({ status: 'PERMANENTLY_FAILED', lastError: 'JOB_EXPIRED', nextAttemptAt: null });
    expect(expiry?.sql).toContain('"notification_jobs"."created_at" < now() - make_interval(secs => $');
    expect(expiry?.params).toContain(10 * 60);
    expect(expiry?.params).toContain(lease.toISOString());
  });

  it('should send a job whose decoded creation time looks old when the database says it is not stale', async () => {
    const { executor, sendEmail } = createExecutor({ messageType: 'OTP' });

    await executor.execute(claimedJob(), lease);

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('should expire a stale job without sending it', async () => {
    const { executor, outcome, sendEmail } = createExecutor({ messageType: 'OTP', stale: true });

    await executor.execute(claimedJob(), lease);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(outcome()).toBeUndefined();
  });

  it('should drop the outcome without a fallback write when the lease was lost', async () => {
    const { executor, writes } = createExecutor({ leaseHeld: false });

    await executor.execute(claimedJob(), lease);

    expect(writes).toHaveLength(2);
  });

  it('should refuse to execute a job it has not claimed', async () => {
    const { executor, sendEmail } = createExecutor();

    await expect(executor.execute(claimedJob({ status: 'PENDING', nextAttemptAt: null }), lease)).rejects.toThrow('Notification job executed without a claim');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
