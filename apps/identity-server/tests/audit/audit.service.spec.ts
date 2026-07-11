/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AuditService } from '@server/modules/infrastructure/audit';
import { schema } from '@server/modules/infrastructure/datastore';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('audit').init();

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = env.getService(AuditService);
  });

  it('should record an event and chain it to the previous one', async () => {
    const first = await service.record({ action: 'user.created', outcome: 'SUCCESS', actorType: 'SYSTEM', targetId: 'usr_1' });
    const second = await service.record({ action: 'user.suspended', outcome: 'SUCCESS', actorType: 'ADMIN', targetId: 'usr_1' });

    expect(first.prevHash).toBeNull();
    expect(second.prevHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it('should redact sensitive keys from the detail payload', async () => {
    const event = await service.record({ action: 'user.login', outcome: 'SUCCESS', actorType: 'USER', detail: { password: 'hunter2', ip: '10.0.0.1' } });
    expect(event.detail).toEqual({ password: '[REDACTED]', ip: '10.0.0.1' });
  });

  it('should verify an intact chain', async () => {
    await service.record({ action: 'a', outcome: 'SUCCESS', actorType: 'SYSTEM' });
    await service.record({ action: 'b', outcome: 'FAILURE', actorType: 'SYSTEM' });
    await service.record({ action: 'c', outcome: 'DENIED', actorType: 'SYSTEM' });

    expect(await service.verifyChain()).toEqual({ valid: true });
  });

  it('should detect tampering with a recorded event', async () => {
    await service.record({ action: 'a', outcome: 'SUCCESS', actorType: 'SYSTEM' });
    const target = await service.record({ action: 'b', outcome: 'SUCCESS', actorType: 'SYSTEM' });
    await service.record({ action: 'c', outcome: 'SUCCESS', actorType: 'SYSTEM' });

    await env.getPostgresClient().update(schema.auditEvents).set({ outcome: 'DENIED' }).where(eq(schema.auditEvents.id, target.id));

    const result = await service.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(target.id);
  });

  it('should keep organisation chains independent', async () => {
    const orgId = Bun.randomUUIDv7();
    await service.record({ action: 'global.a', outcome: 'SUCCESS', actorType: 'SYSTEM' });
    const scoped = await service.record({ action: 'org.a', outcome: 'SUCCESS', actorType: 'SYSTEM', organisationId: orgId });

    expect(scoped.prevHash).toBeNull();
    expect(await service.verifyChain(orgId)).toEqual({ valid: true });
    expect(await service.verifyChain()).toEqual({ valid: true });
  });

  it('should serialise concurrent writes into a single unbroken chain', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, index) => service.record({ action: `event.${index}`, outcome: 'SUCCESS', actorType: 'SYSTEM' })));

    const rows = await env.getPostgresClient().select().from(schema.auditEvents);
    expect(rows).toHaveLength(10);
    expect(await service.verifyChain()).toEqual({ valid: true });
  });
});
