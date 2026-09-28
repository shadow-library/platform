import { describe, expect, it, mock } from 'bun:test';

import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { BotPermissionService } from '@server/modules/identity/bot/bot-permission.service';
import { type Bot } from '@server/modules/infrastructure/datastore';

const BOT = { id: 5n, organisationId: 7n, clientId: 'bot_0123456789abcdefghijkl', status: 'ACTIVE' } as Bot;
const ACTOR = { userId: 11n, ip: '198.51.100.7' };

const role = (roleId: number) => ({ roleId, roleName: `Role${roleId}`, applicationId: 3, application: 'pulse', resource: 'messages', level: 'read' as const });

interface Scenario {
  assignedBefore: ReturnType<typeof role>[];
  desired: ReturnType<typeof role>[];
  inserted: number[];
  deleted: number[];
}

/**
 * The replacement's pre-write read and its writes as a concurrent writer leaves them: the read can still show the state before the other
 * writer committed while the insert (ON CONFLICT DO NOTHING) and delete only return the rows this transaction actually changed.
 */
function serviceFor(scenario: Scenario) {
  const tx = {
    query: {
      bots: { findFirst: () => Promise.resolve(BOT) },
      organisations: { findFirst: () => Promise.resolve({ status: 'ACTIVE' }) },
    },
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve(scenario.inserted.map(roleId => ({ roleId }))) }) }),
    }),
    delete: () => ({ where: () => ({ returning: () => Promise.resolve(scenario.deleted.map(roleId => ({ roleId }))) }) }),
  };
  const postgres = { transaction: <T>(work: (executor: typeof tx) => Promise<T>) => work(tx) };
  const record = mock(() => Promise.resolve());
  const invalidatePrincipal = mock(() => Promise.resolve());
  const service = new BotPermissionService(
    new FakeDatabaseService({ postgres }),
    {} as never,
    { listOrganisationApplicationIds: () => Promise.resolve(new Set([3])) } as never,
    { invalidatePrincipal } as never,
    { record } as never,
  );
  const internals = service as unknown as { resolveDesiredRoles: () => Promise<unknown>; assignedRoles: () => Promise<unknown> };
  internals.resolveDesiredRoles = () => Promise.resolve(scenario.desired);
  internals.assignedRoles = () => Promise.resolve(scenario.assignedBefore.map(assigned => ({ ...assigned, grantedBy: `bot:${ACTOR.userId}` })));
  return { service, record, invalidatePrincipal };
}

describe('BotPermissionService', () => {
  describe('replaceGrants', () => {
    it('should not audit a grant a concurrent identical replacement already made', async () => {
      const { service, record, invalidatePrincipal } = serviceFor({ assignedBefore: [], desired: [role(1)], inserted: [], deleted: [] });

      const diff = await service.replaceGrants(ACTOR, BOT.organisationId, BOT.id, [{ applicationId: 3, resource: 'messages', level: 'read' }]);

      expect(diff).toEqual({ added: [], removed: [] });
      expect(record).not.toHaveBeenCalled();
      expect(invalidatePrincipal).not.toHaveBeenCalled();
    });

    it('should not audit a revocation a concurrent replacement already made', async () => {
      const { service, record } = serviceFor({ assignedBefore: [role(2)], desired: [], inserted: [], deleted: [] });

      const diff = await service.replaceGrants(ACTOR, BOT.organisationId, BOT.id, []);

      expect(diff).toEqual({ added: [], removed: [] });
      expect(record).not.toHaveBeenCalled();
    });

    it('should audit exactly the grants and revocations this replacement wrote', async () => {
      const { service, record } = serviceFor({ assignedBefore: [role(2), role(4)], desired: [role(1), role(3)], inserted: [3], deleted: [2] });

      const diff = await service.replaceGrants(ACTOR, BOT.organisationId, BOT.id, [{ applicationId: 3, resource: 'messages', level: 'read' }]);

      expect(diff).toEqual({ added: [role(3)], removed: [role(2)] });
      expect(record).toHaveBeenCalledTimes(1);
    });
  });
});
