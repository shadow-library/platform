import { describe, expect, it, mock } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import type { JobAdmission, NotificationJobRunner } from '@modules/notification/notification-job.runner';
import { ChannelNotificationStatus, NotificationService } from '@modules/notification/notification.service';
import type { ResolvedTemplate, TemplateResolverService } from '@modules/template';

const resolved = {
  template: { id: 1n, priority: 'HIGH', variableSchema: { variables: {} } },
  publishedVersion: { id: 2n },
  enabledChannels: ['EMAIL'],
} as unknown as ResolvedTemplate;

function createService(admission: JobAdmission) {
  const inserted: Record<string, unknown>[] = [];
  const postgres = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push(values);
          return [{ ...values, id: 'job-1', nextAttemptAt: new Date(admission.nextAttemptAt.getTime() - 5.5 * 60 * 60 * 1000) }];
        },
      }),
    }),
  };
  const start = mock<NotificationJobRunner['start']>(() => undefined);
  const runner = { admit: () => admission, start } as unknown as NotificationJobRunner;
  const templateResolver = { findContent: async () => ({ locale: 'en-ZZ' }) } as unknown as TemplateResolverService;
  const service = new NotificationService(new FakeDatabaseService({ postgres }), templateResolver, runner);
  return { service, inserted, start };
}

describe('NotificationService', () => {
  it('should insert each job already claimed by the runner and hand it over with the admission it wrote', async () => {
    const lease = new Date(Date.now() + 60_000);
    const admission: JobAdmission = { status: 'PROCESSING', nextAttemptAt: lease };
    const { service, inserted, start } = createService(admission);

    const result = await service.sendResolved(resolved, { templateKey: 'welcome', recipients: { email: 'reader@example.com' } });

    expect(result.channelResults).toEqual([{ jobId: 'job-1', channel: 'EMAIL', status: ChannelNotificationStatus.QUEUED, locale: 'en-ZZ' }]);
    expect(inserted[0]).toMatchObject({ status: 'PROCESSING', nextAttemptAt: lease, priority: 'HIGH' });
    expect(start.mock.calls[0]?.[0]).toMatchObject({ id: 'job-1', status: 'PROCESSING' });
    expect(start.mock.calls[0]?.[1]).toBe(admission);
  });
});
