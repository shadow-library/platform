import { describe, expect, it } from 'bun:test';
import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { type ContextService } from '@shadow-library/fastify';

import { ADMIN_PERMISSION } from '@server/constants';

import { AdminAccessService } from '@modules/actor';
import { AccessController } from '@modules/auth/access.controller';

const MEMBER: AuthPrincipal = { kind: 'user', sub: '1001', org: '7001', scopes: [], claims: {} };

interface Checked {
  input: unknown;
  options: unknown;
}

function adminAccess(principal: AuthPrincipal, decide: () => Promise<boolean>): { service: AdminAccessService; checks: Checked[] } {
  const checks: Checked[] = [];
  const context = { getAuthPrincipal: () => principal } as unknown as ContextService;
  const authClient = { check: (input: unknown, options: unknown) => (checks.push({ input, options }), decide()) } as unknown as AuthClient;
  return { service: new AdminAccessService(context, authClient), checks };
}

describe('AdminAccessService', () => {
  it('should ask the PDP for novel-forge:admin in the organisation the caller acts in, at the high-risk TTL', async () => {
    const { service, checks } = adminAccess(MEMBER, async () => true);

    expect(await service.isAdmin()).toBe(true);
    expect(checks).toEqual([{ input: { action: ADMIN_PERMISSION, organisationId: '7001', principal: MEMBER }, options: { highRisk: true } }]);
  });

  it('should answer no for a caller acting in no organisation without asking the PDP', async () => {
    const { service, checks } = adminAccess({ ...MEMBER, org: undefined }, async () => true);

    expect(await service.isAdmin()).toBe(false);
    expect(await service.canSeeModels()).toBe(false);
    expect(checks).toHaveLength(0);
  });

  it('should show model identity only to an admin', async () => {
    expect(await adminAccess(MEMBER, async () => true).service.canSeeModels()).toBe(true);
    expect(await adminAccess(MEMBER, async () => false).service.canSeeModels()).toBe(false);
  });

  it('should hide model identity when the PDP cannot answer, while the strict check still fails', async () => {
    const { service } = adminAccess(MEMBER, () => Promise.reject(new Error('throttled')));

    expect(await service.canSeeModels()).toBe(false);
    await expect(service.isAdmin()).rejects.toThrow('throttled');
  });
});

describe('AccessController', () => {
  it('should report admin from the same check that gates model identity', async () => {
    expect(await new AccessController(adminAccess(MEMBER, async () => true).service).getAccess()).toEqual({ admin: true });
    expect(await new AccessController(adminAccess(MEMBER, async () => false).service).getAccess()).toEqual({ admin: false });
  });
});
