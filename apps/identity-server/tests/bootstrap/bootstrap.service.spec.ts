import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { PLATFORM_ORG_NAME } from '@server/modules/admin';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService, ServiceAccessService } from '@server/modules/authz';
import { BootstrapService, EcosystemSeedService } from '@server/modules/bootstrap';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('bootstrap').init();
const ADMIN_EMAIL = 'admin@shadow-apps.com';

describe('BootstrapService', () => {
  it('should provision the platform application with the IAM admin role', () => {
    const application = env.getService(ApplicationService).getApplication('shadow-identity');
    expect(application).not.toBeNull();
    expect(application?.roles.map(role => role.roleName)).toContain('IAMAdmin');
  });

  it('should provision an active, verified bootstrap administrator', async () => {
    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    expect(admin).not.toBeNull();
    expect(admin?.status).toBe('ACTIVE');

    const emails = await env.getPostgresClient().select().from(schema.userEmails);
    const adminEmail = emails.find(email => email.emailId === ADMIN_EMAIL);
    expect(adminEmail?.verifiedAt).not.toBeNull();
  });

  it('should not seed the old hardcoded super-admin credentials', async () => {
    const superAdmin = await env.getService(UserService).getUser('super-admin@shadow-apps.com');
    expect(superAdmin).toBeNull();
  });

  it('should provision the platform organisation with the admin as owner', async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    expect(organisation).not.toBeNull();

    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    expect(admin).not.toBeNull();
    const membership = organisation && admin ? await env.getService(OrganisationService).getMembership(admin.id, organisation.id) : null;
    expect(membership?.role).toBe('OWNER');
  });

  it('should be idempotent when run again', async () => {
    const bootstrap = new BootstrapService(
      env.getService(ApplicationService),
      env.getService(ApplicationRoleService),
      env.getService(UserService),
      env.getService(OAuthClientService),
      env.getService(PolicyDecisionService),
      env.getService(OrganisationService),
      env.getService(EcosystemSeedService),
    );
    await bootstrap.onModuleInit();

    const admins = (await env.getPostgresClient().select().from(schema.userEmails)).filter(email => email.emailId === ADMIN_EMAIL);
    expect(admins).toHaveLength(1);

    const applications = (await env.getPostgresClient().select().from(schema.applications)).filter(app => app.name === 'shadow-identity');
    expect(applications).toHaveLength(1);

    const organisations = (await env.getPostgresClient().select().from(schema.organisations)).filter(org => org.name === PLATFORM_ORG_NAME);
    expect(organisations).toHaveLength(1);

    const pulseApps = (await env.getPostgresClient().select().from(schema.applications)).filter(app => app.name === 'pulse');
    expect(pulseApps).toHaveLength(1);

    const clients = await env.getPostgresClient().select().from(schema.oauthClients);
    expect(clients.map(client => client.id).sort()).toEqual(['identity-server', 'novel-forge', 'pulse', 'web-novel']);
  });

  it('should seed the ecosystem applications, their clients and the notification access rule', async () => {
    const applications = await env.getPostgresClient().select().from(schema.applications);
    expect(applications.map(app => app.name).sort()).toEqual(['novel-forge', 'pulse', 'shadow-identity', 'web-novel']);

    const pulse = env.getService(ApplicationService).getApplication('pulse');
    expect(pulse?.roles.map(role => role.roleName).sort()).toEqual(['PulseAdmin', 'PulseOperator', 'PulseViewer']);

    const pulsePermissions = pulse ? (await env.getService(PolicyDecisionService).listPermissionsForApplication(pulse.id)).map(permission => permission.name) : [];
    expect(pulsePermissions).toEqual(expect.arrayContaining(['pulse:templates:read', 'pulse:templates:write', 'pulse:templates:publish', 'pulse:layouts:write']));

    const clients = await env.getPostgresClient().select().from(schema.oauthClients);
    expect(clients.map(client => client.id).sort()).toEqual(['identity-server', 'novel-forge', 'pulse', 'web-novel']);

    const pulseClient = clients.find(client => client.id === 'pulse');
    expect(pulseClient?.grantTypes).toEqual(expect.arrayContaining(['authorization_code', 'client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange']));
    expect(await env.getService(OAuthClientService).getGrantedScopeNames('pulse')).toEqual(expect.arrayContaining(['authz:check', 'authz:roles:sync', 'app-session:manage']));

    const grantedScopes = await env.getService(OAuthClientService).getGrantedScopeNames('identity-server');
    expect(grantedScopes).toContain('notifications:send');

    const accessRules = await env.getPostgresClient().select().from(schema.serviceRouteAccess);
    const notificationRule = accessRules.find(rule => rule.callerClientId === 'identity-server' && rule.pathPattern === '/api/v1/notifications');
    expect(notificationRule?.method).toBe('POST');
  });

  it('should provision novel-forge and web-novel exactly like pulse (client, grants, token-exchange)', async () => {
    const clientService = env.getService(OAuthClientService);
    for (const app of ['novel-forge', 'web-novel']) {
      const client = await clientService.getClient(app);
      expect(client?.kind).toBe('WEB_CONFIDENTIAL');
      expect(client?.isFirstParty).toBe(true);
      expect(client?.grantTypes).toEqual(expect.arrayContaining(['authorization_code', 'client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange']));
      const scopes = await clientService.getGrantedScopeNames(app);
      expect(scopes).toEqual(expect.arrayContaining(['authz:check', 'app-session:manage']));
      expect(scopes).not.toContain('authz:roles:sync');
    }
  });

  it('should grant novel-forge the cross-application web-novel:publish scope as its delegation ceiling', async () => {
    const description = await env.getService(OAuthClientService).describeApplication('novel-forge');
    const webNovelGrant = description?.grants.find(grant => grant.audience === 'api://web-novel');
    expect(webNovelGrant?.scopes).toContain('web-novel:publish');
  });

  it('should seed pulse as an INTERNAL application', async () => {
    const applications = await env.getPostgresClient().select().from(schema.applications);
    expect(applications.find(application => application.name === 'pulse')?.visibility).toBe('INTERNAL');

    expect(applications.find(application => application.name === 'web-novel')?.visibility).toBe('PUBLIC');
  });

  it('should grant the bootstrap administrator PulseAdmin in the platform organisation', async () => {
    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    const platform = await env.getService(OrganisationService).ensureTeamOrganisation(PLATFORM_ORG_NAME);
    const pulse = env.getService(ApplicationService).getApplicationOrThrow('pulse');
    const adminRole = pulse.roles.find(role => role.roleName === 'PulseAdmin');

    const assignments = await env.getPostgresClient().select().from(schema.roleAssignments);
    const granted = assignments.find(assignment => assignment.principalType === 'USER' && assignment.principalId === admin?.id.toString() && assignment.roleId === adminRole?.id);
    expect(granted?.organisationId).toBe(platform.id);

    expect(pulse.roles.every(role => !role.isDefault)).toBe(true);
  });

  it('should bind each app client to its in-cluster workload subject and drop the legacy publisher client', async () => {
    const clients = await env.getPostgresClient().select().from(schema.oauthClients);
    const subjectOf = (id: string) => clients.find(client => client.id === id)?.workloadSubjects ?? [];
    expect(subjectOf('pulse')).toEqual(['system:serviceaccount:pulse:pulse-server']);
    expect(subjectOf('novel-forge')).toEqual(['system:serviceaccount:novel-forge:novel-forge-server']);
    expect(subjectOf('web-novel')).toEqual(['system:serviceaccount:web-novel:web-novel-server']);

    expect(clients.find(client => client.id === 'novel-forge-service')).toBeUndefined();
  });

  it('should allow novel-forge to reach web-novel internal routes via a service-access rule', async () => {
    const webNovel = env.getService(ApplicationService).getApplicationOrThrow('web-novel');
    const rules = await env.getService(ServiceAccessService).listForApplication(webNovel.id);
    const internalRule = rules.find(rule => rule.callerClientId === 'novel-forge' && rule.pathPattern === '/internal/*');
    expect(internalRule?.method).toBe('*');
  });

  it('should derive each app relying party redirect URI from the issuer host', async () => {
    const redirects = (await env.getService(OAuthClientService).getClientDetail('pulse'))?.redirectUris ?? [];
    expect(redirects).toContain('https://pulse.shadow-apps.com/api/auth/callback');
  });

  it('should register first-party API resources and the service-only publish scope', async () => {
    const resources = await env.getPostgresClient().select().from(schema.apiResources);
    expect(resources.map(resource => resource.identifier).sort()).toEqual(['api://novel-forge', 'api://pulse', 'api://web-novel', 'shadow-identity']);

    const publishScope = (await env.getPostgresClient().select().from(schema.scopes)).find(scope => scope.name === 'web-novel:publish');
    expect(publishScope?.principalType).toBe('SERVICE');
  });

  it('should leave an already-seeded application untouched when the seed runs again', async () => {
    const db = env.getPostgresClient();
    const pulse = env.getService(ApplicationService).getApplicationOrThrow('pulse');
    const edited = 'edited by a platform administrator';
    await db.update(schema.applications).set({ description: edited }).where(eq(schema.applications.id, pulse.id));

    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    expect(admin).not.toBeNull();
    expect(organisation).not.toBeNull();
    await env.getService(EcosystemSeedService).seed({ adminUserId: admin!.id, platformOrganisationId: organisation!.id });

    const reloaded = (await db.select().from(schema.applications)).find(application => application.id === pulse.id);
    expect(reloaded?.description).toBe(edited);

    const roles = (await db.select().from(schema.applicationRoles)).filter(role => role.applicationId === pulse.id);
    expect(roles.map(role => role.roleName).sort()).toEqual(['PulseAdmin', 'PulseOperator', 'PulseViewer']);
  });
});
