/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ADMIN_EMAIL, findPlatformOrganisationId, identityDb, PLATFORM_AUDIENCE, readCatalogRoles, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';

/**
 * Defining types
 */

interface ApplicationRow {
  id: number;
  name: string;
  subDomain: string | null;
  visibility: string;
  isActive: boolean;
  publicUrls: string[];
}

interface ClientRow {
  id: string;
  applicationName: string;
  kind: string;
  isFirstParty: boolean;
  grantTypes: string[];
  workloadSubjects: string[] | null;
  secrets: number;
}

/**
 * Declaring the constants
 *
 * The ecosystem the identity bootstrap leaves behind on a deployed environment: the platform application and
 * organisation, the bootstrap administrator, and the five seeded applications with their clients, resources, scope
 * grants, service-access rules and derived redirect URIs. Everything here is read-only — the deployment is shared with
 * every other spec — so each query excludes the `e2e-` applications and clients the suite creates and the
 * organisation-owned applications it registers, leaving exactly the seeded state. Re-running the bootstrap is not
 * covered: it needs an identity-server restart, which this suite never performs.
 */

const SEEDED_APPLICATIONS = ['memoir', 'novel-forge', 'pulse', 'shadow-identity', 'web-novel'];

const IDENTITY_SERVICE_CLIENT = 'identity-server';

const ECOSYSTEM_CLIENTS = ['memoir', 'novel-forge', 'pulse', 'web-novel'];

const ECOSYSTEM_GRANT_TYPES = ['authorization_code', 'client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'];

/** `<name>.<root>` for every deployed application, taken from the identity host the suite targets. */
const DEPLOYMENT_ROOT = new URL(requireProductUrl('identity')).hostname.split('.').slice(1).join('.');

const OAUTH_CALLBACK_PATH = '/api/auth/callback';

async function seededApplications(): Promise<ApplicationRow[]> {
  return identityDb()<ApplicationRow[]>`
    SELECT id, name, sub_domain AS "subDomain", visibility::text, is_active AS "isActive", public_urls AS "publicUrls"
    FROM applications WHERE owner_organisation_id IS NULL AND name NOT LIKE 'e2e-%' ORDER BY name
  `;
}

async function seededClients(): Promise<ClientRow[]> {
  return identityDb()<ClientRow[]>`
    SELECT c.id, a.name AS "applicationName", c.kind::text, c.is_first_party AS "isFirstParty", c.grant_types AS "grantTypes",
           c.workload_subjects AS "workloadSubjects", (SELECT count(*)::int FROM oauth_client_secrets s WHERE s.client_id = c.id) AS secrets
    FROM oauth_clients c JOIN applications a ON a.id = c.application_id
    WHERE c.organisation_id IS NULL AND c.id NOT LIKE 'e2e-%' ORDER BY c.id
  `;
}

/** Every seeded client's scope grants as `<resource>::<scope>`, keyed by client. */
async function seededScopeGrants(): Promise<Record<string, string[]>> {
  const rows = await identityDb()<{ clientId: string; scopeRef: string }[]>`
    SELECT g.client_id AS "clientId", r.identifier || '::' || s.name AS "scopeRef"
    FROM oauth_client_scope_grants g
    JOIN oauth_clients c ON c.id = g.client_id
    JOIN scopes s ON s.id = g.scope_id
    JOIN api_resources r ON r.id = s.api_resource_id
    WHERE c.organisation_id IS NULL AND c.id NOT LIKE 'e2e-%'
    ORDER BY g.client_id, "scopeRef"
  `;
  return rows.reduce<Record<string, string[]>>((grants, row) => ({ ...grants, [row.clientId]: [...(grants[row.clientId] ?? []), row.scopeRef] }), {});
}

test.describe('identity bootstrap — platform and administrator', () => {
  test('should hold the platform application, its organisation and the bootstrap administrator, and no legacy super administrator', async () => {
    const [platform] = await identityDb()<{ id: number; visibility: string }[]>`SELECT id, visibility::text FROM applications WHERE name = ${PLATFORM_AUDIENCE}`;
    expect(platform, 'the platform application exists').toBeDefined();
    expect((await readCatalogRoles(platform?.id ?? 0)).map(role => role.roleName)).toContain('IAMAdmin');

    const platformOrganisationId = await findPlatformOrganisationId();
    const [administrator] = await identityDb()<{ userId: string; status: string; verified: boolean; role: string }[]>`
      SELECT u.id::text AS "userId", u.status::text, ue.verified_at IS NOT NULL AS verified, m.role::text
      FROM users u
      JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary
      JOIN organisation_members m ON m.user_id = u.id AND m.organisation_id = ${platformOrganisationId}
      WHERE lower(ue.email_id) = ${ADMIN_EMAIL.toLowerCase()}
    `;
    expect(administrator, `${ADMIN_EMAIL} owns the platform organisation`).toMatchObject({ status: 'ACTIVE', verified: true, role: 'OWNER' });

    const legacy = await identityDb()<{ userId: string }[]>`SELECT user_id::text AS "userId" FROM user_emails WHERE lower(email_id) = 'super-admin@shadow-apps.com'`;
    expect(legacy, 'the hardcoded super administrator is gone').toEqual([]);

    const roles = await identityDb()<{ roleName: string }[]>`
      SELECT ar.role_name AS "roleName" FROM role_assignments ra JOIN application_roles ar ON ar.id = ra.role_id
      WHERE ra.principal_type = 'USER' AND ra.principal_id = ${administrator?.userId ?? ''} AND ra.organisation_id = ${platformOrganisationId}
    `;
    expect(roles.map(role => role.roleName).sort()).toEqual(expect.arrayContaining(['IAMAdmin', 'NovelForgeAdmin', 'NovelForgeCurator', 'PulseAdmin']));
  });
});

test.describe('identity bootstrap — ecosystem seed', () => {
  test('should seed exactly the five ecosystem applications, with pulse internal and web-novel public', async () => {
    const applications = await seededApplications();
    expect(applications.map(application => application.name)).toEqual(SEEDED_APPLICATIONS);
    expect(
      applications.every(application => application.isActive),
      'every seeded application is active',
    ).toBe(true);

    const visibility = Object.fromEntries(applications.map(application => [application.name, application.visibility]));
    expect(visibility).toMatchObject({ pulse: 'INTERNAL', 'web-novel': 'PUBLIC' });
  });

  test('should seed pulse with its three roles and the template and layout permissions', async () => {
    const [pulse] = (await seededApplications()).filter(application => application.name === 'pulse');
    const roles = await readCatalogRoles(pulse?.id ?? 0);
    expect(roles.map(role => role.roleName)).toEqual(['PulseAdmin', 'PulseOperator', 'PulseViewer']);
    expect(
      roles.every(role => !role.isDefault),
      'no pulse role is a default role',
    ).toBe(true);

    const permissions = await identityDb()<{ name: string }[]>`SELECT name FROM permissions WHERE application_id = ${pulse?.id ?? 0} ORDER BY name`;
    expect(permissions.map(permission => permission.name)).toEqual(
      expect.arrayContaining(['pulse:layouts:write', 'pulse:templates:publish', 'pulse:templates:read', 'pulse:templates:write']),
    );
  });

  test('should seed every ecosystem client first-party and confidential, bound to its own in-cluster service account', async () => {
    const clients = await seededClients();
    expect(clients.map(client => client.id)).toEqual([IDENTITY_SERVICE_CLIENT, ...ECOSYSTEM_CLIENTS]);
    expect(
      clients.map(client => client.id),
      'the legacy novel-forge service client is gone',
    ).not.toContain('novel-forge-service');

    for (const client of clients.filter(item => item.id !== IDENTITY_SERVICE_CLIENT)) {
      expect(client, client.id).toMatchObject({ applicationName: client.id, kind: 'WEB_CONFIDENTIAL', isFirstParty: true });
      expect([...client.grantTypes].sort(), client.id).toEqual([...ECOSYSTEM_GRANT_TYPES].sort());
      expect(client.workloadSubjects, `${client.id} authenticates as its own workload`).toEqual([`system:serviceaccount:${client.id}:${client.id}-server`]);
    }

    const identityServer = clients.find(client => client.id === IDENTITY_SERVICE_CLIENT);
    expect(identityServer, 'identity mints its own outbound tokens as a service client').toMatchObject({
      applicationName: PLATFORM_AUDIENCE,
      kind: 'SERVICE',
      isFirstParty: true,
      grantTypes: ['client_credentials'],
      secrets: 1,
    });
  });

  test('should grant every seeded client exactly the scopes its application needs', async () => {
    expect(await seededScopeGrants()).toEqual({
      [IDENTITY_SERVICE_CLIENT]: ['api://novel-forge::novel-forge:bots:manage', 'api://pulse::notifications:send'],
      memoir: ['api://pulse::notifications:send', 'shadow-identity::app-session:manage', 'shadow-identity::authz:check', 'shadow-identity::users:resolve'],
      'novel-forge': [
        'api://web-novel::web-novel:publish',
        'shadow-identity::app-session:manage',
        'shadow-identity::authz:check',
        'shadow-identity::authz:roles:sync',
        'shadow-identity::users:resolve',
      ],
      pulse: ['shadow-identity::app-session:manage', 'shadow-identity::authz:check', 'shadow-identity::authz:roles:sync'],
      'web-novel': ['shadow-identity::app-session:manage', 'shadow-identity::authz:check', 'shadow-identity::users:resolve'],
    });
  });

  test('should declare exactly the platform and per-application API resources, with the service-only and sensitive scopes the seed names', async () => {
    const resources = await identityDb()<{ identifier: string }[]>`SELECT identifier FROM api_resources WHERE identifier NOT LIKE 'api://e2e-%' ORDER BY identifier`;
    expect(resources.map(resource => resource.identifier)).toEqual(['api://memoir', 'api://novel-forge', 'api://pulse', 'api://web-novel', PLATFORM_AUDIENCE]);

    const scopes = await identityDb()<{ identifier: string; name: string; principalType: string; isSensitive: boolean }[]>`
      SELECT r.identifier, s.name, s.principal_type::text AS "principalType", s.is_sensitive AS "isSensitive"
      FROM scopes s JOIN api_resources r ON r.id = s.api_resource_id
      WHERE r.identifier IN ('api://memoir', 'api://web-novel') ORDER BY r.identifier, s.name
    `;
    expect(scopes).toEqual([
      { identifier: 'api://memoir', name: 'memoir:account', principalType: 'USER', isSensitive: false },
      { identifier: 'api://memoir', name: 'memoir:destructive', principalType: 'USER', isSensitive: true },
      { identifier: 'api://memoir', name: 'memoir:sync', principalType: 'USER', isSensitive: false },
      { identifier: 'api://web-novel', name: 'web-novel:publish', principalType: 'SERVICE', isSensitive: false },
    ]);
  });

  test('should open exactly the seeded service-access routes between the ecosystem applications', async () => {
    const rules = await identityDb()<{ application: string; callerClientId: string; method: string; pathPattern: string }[]>`
      SELECT a.name AS application, sra.caller_client_id AS "callerClientId", sra.method, sra.path_pattern AS "pathPattern"
      FROM service_route_access sra JOIN applications a ON a.id = sra.application_id
      WHERE a.name NOT LIKE 'e2e-%' ORDER BY a.name, sra.caller_client_id
    `;
    expect(rules).toEqual([
      { application: 'novel-forge', callerClientId: IDENTITY_SERVICE_CLIENT, method: '*', pathPattern: '/internal/bots/*' },
      { application: 'pulse', callerClientId: IDENTITY_SERVICE_CLIENT, method: 'POST', pathPattern: '/api/v1/notifications' },
      { application: 'pulse', callerClientId: 'memoir', method: 'POST', pathPattern: '/api/v1/notifications' },
      { application: 'web-novel', callerClientId: 'novel-forge', method: '*', pathPattern: '/internal/*' },
    ]);
  });

  test('should derive every seeded redirect URI and public URL from the deployed host, dropping the hyphen from the subdomain', async () => {
    const hosts: Record<string, string> = { memoir: 'memoir', 'novel-forge': 'novelforge', pulse: 'pulse', 'web-novel': 'webnovel' };
    const applications = Object.fromEntries((await seededApplications()).map(application => [application.name, application]));

    for (const [name, subDomain] of Object.entries(hosts)) {
      const origin = `https://${subDomain}.${DEPLOYMENT_ROOT}`;
      expect(applications[name], name).toMatchObject({ subDomain, publicUrls: expect.arrayContaining([origin]) });

      const uris = (await identityDb()<{ uri: string }[]>`SELECT uri FROM oauth_client_redirect_uris WHERE client_id = ${name} ORDER BY uri`).map(row => row.uri);
      expect(uris, name).toContain(`${origin}${OAUTH_CALLBACK_PATH}`);
      if (name !== subDomain) expect(uris, `${name} keeps no hyphenated host`).not.toContain(`https://${name}.${DEPLOYMENT_ROOT}${OAUTH_CALLBACK_PATH}`);
    }
  });
});
