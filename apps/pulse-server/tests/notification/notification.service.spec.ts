import { describe, expect, it } from 'bun:test';
import type { DatabaseService } from '@shadow-library/modules';

import type { SenderEndpointService, SenderRoutingRuleService } from '@modules/configuration';
import type { NotificationProviderService } from '@modules/notification/notification-provider.service';
import { NotificationService } from '@modules/notification/notification.service';
import type { NotificationOpResult } from '@modules/notification/providers';
import type { TemplateResolverService } from '@modules/template';

function createService(): NotificationService {
  return new NotificationService(
    { getPostgresClient: () => ({}) } as unknown as DatabaseService,
    {} as NotificationProviderService,
    {} as TemplateResolverService,
    {} as SenderRoutingRuleService,
    {} as SenderEndpointService,
  );
}

describe('NotificationService provider outcomes', () => {
  it('should permanently fail a non-retriable provider error immediately', () => {
    const result: NotificationOpResult = { success: false, retriable: false, error: new Error('Invalid sender') };
    expect(createService()['getJobStatus'](result, 1)).toBe('PERMANENTLY_FAILED');
  });

  it('should retry a transient provider error until the maximum attempt', () => {
    const result: NotificationOpResult = { success: false, retriable: true, error: new Error('Rate limited') };
    const service = createService();

    expect(service['getJobStatus'](result, 1)).toBe('FAILED');
    expect(service['getJobStatus'](result, 5)).toBe('PERMANENTLY_FAILED');
  });
});
