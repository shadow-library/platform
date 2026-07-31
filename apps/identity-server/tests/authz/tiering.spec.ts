/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { CatalogSyncService, PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface Manifest {
  permissions: { name: string }[];
  roles: { name: string; permissions: string[]; default?: boolean }[];
}

/**
 * Declaring the constants
 *
 * Customer tiering (T-904): default roles give every signed-in user a baseline with no assignment
 * row, and `ORGANISATION`-principal grants extend a tier to every live member of an organisation.
 * A dedicated application keeps these roles off the seeded platform catalog.
 */
const env = new TestEnvironment('authz-tiering').init();

/** basic is the customer baseline (a default role); premium is the vendor-sold tier (an org-wide grant). */
const tierManifest = (basicDefault: boolean): Manifest => ({
  permissions: [{ name: 'tier:basic' }, { name: 'tier:premium' }],
  roles: [
    { name: 'customer', permissions: ['tier:basic'], default: basicDefault },
    { name: 'premium', permissions: ['tier:premium'] },
  ],
});

describe('Customer tiering', () => {
  let pdp: PolicyDecisionService;
  let sync: CatalogSyncService;
  let apps: ApplicationService;
  let users: UserService;
  let organisations: OrganisationService;
  let applicationId: number;
  let clientId: string;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;
  const roleId = (name: string): number => apps.getApplicationByIdOrThrow(applicationId).roles.find(role => role.roleName === name)?.id ?? 0;

  const createUser = async (): Promise<{ id: bigint; personalOrganisationId: bigint }> => {
    const user = await users.createUserWithPassword({ email: `tier-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    return { id: user.id, personalOrganisationId: user.personalOrganisationId as bigint };
  };

  beforeEach(async () => {
    pdp = env.getService(PolicyDecisionService);
    sync = env.getService(CatalogSyncService);
    apps = env.getService(ApplicationService);
    users = env.getService(UserService);
    organisations = env.getService(OrganisationService);

    const application = await apps.createApplication({ name: `tier-app-${uniq()}`, subDomain: `t${uniq()}` });
    applicationId = application.id;
    const client = await env.getService(OAuthClientService).register({ applicationId, name: `tier-svc-${uniq()}`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
    clientId = client.clientId;
  });

  describe('default roles', () => {
    it('should give a fresh user exactly the default role permissions with zero assignment rows', async () => {
      await sync.sync(clientId, tierManifest(true));
      const user = await createUser();
      const principal = { type: 'USER' as const, id: user.id.toString() };
      const org = user.personalOrganisationId.toString();

      expect((await pdp.check({ principal, organisationId: org, action: 'tier:basic' })).decision).toBe('PERMIT');
      expect((await pdp.check({ principal, organisationId: org, action: 'tier:premium' })).decision).toBe('DENY');
      expect(await pdp.listAssignments({ principal })).toHaveLength(0);
    });

    it('should never grant default roles to a SERVICE_ACCOUNT principal', async () => {
      await sync.sync(clientId, tierManifest(true));
      const decision = await pdp.check({ principal: { type: 'SERVICE_ACCOUNT', id: `svc-${uniq()}` }, organisationId: '1', action: 'tier:basic' });
      expect(decision.decision).toBe('DENY');
    });

    it('should scope a default role to its application under checkForApplication', async () => {
      await sync.sync(clientId, tierManifest(true));
      const other = await apps.createApplication({ name: `other-${uniq()}`, subDomain: `o${uniq()}` });
      const user = await createUser();
      const request = { principal: { type: 'USER' as const, id: user.id.toString() }, organisationId: user.personalOrganisationId.toString(), action: 'tier:basic' };

      expect((await pdp.checkForApplication(request, applicationId)).decision).toBe('PERMIT');
      expect((await pdp.checkForApplication(request, other.id)).decision).toBe('DENY');
    });

    it('should flip is_default on and off, and a re-push without default clears it', async () => {
      const db = env.getPostgresClient();
      const customer = () =>
        db.query.applicationRoles.findFirst({ where: and(eq(schema.applicationRoles.applicationId, applicationId), eq(schema.applicationRoles.roleName, 'customer')) });

      await sync.sync(clientId, tierManifest(true));
      expect((await customer())?.isDefault).toBe(true);

      /** A re-push that omits `default` is the source of truth — the flag is cleared, not left set. */
      await sync.sync(clientId, tierManifest(false));
      expect((await customer())?.isDefault).toBe(false);

      await sync.sync(clientId, tierManifest(true));
      expect((await customer())?.isDefault).toBe(true);
    });
  });

  describe('org-wide grants', () => {
    let orgId: string;
    let member: { id: bigint; personalOrganisationId: bigint };
    let memberRequest: { principal: { type: 'USER'; id: string }; organisationId: string; action: string };

    beforeEach(async () => {
      await sync.sync(clientId, tierManifest(true));
      const organisation = await organisations.ensureTeamOrganisation(`Tier Team ${uniq()}`);
      orgId = organisation.id.toString();
      member = await createUser();
      await organisations.ensureMember(organisation.id, member.id, 'MEMBER');
      memberRequest = { principal: { type: 'USER', id: member.id.toString() }, organisationId: orgId, action: 'tier:premium' };
    });

    const grantPremium = () => pdp.assignRole({ type: 'ORGANISATION', id: orgId }, roleId('premium'), orgId);

    it('should permit an org-wide grant for an active member', async () => {
      await grantPremium();
      expect((await pdp.check(memberRequest)).decision).toBe('PERMIT');
    });

    it('should deny an org-wide grant to a non-member', async () => {
      await grantPremium();
      const outsider = await createUser();
      expect((await pdp.check({ ...memberRequest, principal: { type: 'USER', id: outsider.id.toString() } })).decision).toBe('DENY');
    });

    it('should drop org-wide permissions the moment a membership ends (regression for the membership join)', async () => {
      await grantPremium();
      expect((await pdp.check(memberRequest)).decision).toBe('PERMIT');

      const db = env.getPostgresClient();
      await db.delete(schema.organisationMembers).where(and(eq(schema.organisationMembers.organisationId, BigInt(orgId)), eq(schema.organisationMembers.userId, member.id)));
      expect((await pdp.check(memberRequest)).decision).toBe('DENY');
    });

    it('should deny an org-wide grant when the organisation is suspended', async () => {
      await grantPremium();
      const db = env.getPostgresClient();
      await db
        .update(schema.organisations)
        .set({ status: 'SUSPENDED' })
        .where(eq(schema.organisations.id, BigInt(orgId)));
      expect((await pdp.check(memberRequest)).decision).toBe('DENY');
    });

    it('should scope an org-wide grant to its application under checkForApplication', async () => {
      await grantPremium();
      const other = await apps.createApplication({ name: `other-${uniq()}`, subDomain: `o${uniq()}` });
      expect((await pdp.checkForApplication(memberRequest, applicationId)).decision).toBe('PERMIT');
      expect((await pdp.checkForApplication(memberRequest, other.id)).decision).toBe('DENY');
    });

    it('should change the returned authzVersion when an org-wide grant is added and revoked', async () => {
      const before = (await pdp.check(memberRequest)).authzVersion;
      await grantPremium();
      const afterGrant = (await pdp.check(memberRequest)).authzVersion;
      expect(afterGrant).toBeGreaterThan(before);

      await pdp.revokeRole({ type: 'ORGANISATION', id: orgId }, roleId('premium'), orgId);
      const afterRevoke = (await pdp.check(memberRequest)).authzVersion;
      expect(afterRevoke).toBeGreaterThan(afterGrant);
      expect((await pdp.check(memberRequest)).decision).toBe('DENY');
    });

    it('should remove ORGANISATION-principal rows when the organisation is cleared', async () => {
      await grantPremium();
      expect(await pdp.listAssignments({ organisationId: orgId })).not.toHaveLength(0);

      await pdp.revokeAllForOrganisation(orgId);
      expect(await pdp.listAssignments({ organisationId: orgId })).toHaveLength(0);
      expect((await pdp.check(memberRequest)).decision).toBe('DENY');
    });
  });
});
