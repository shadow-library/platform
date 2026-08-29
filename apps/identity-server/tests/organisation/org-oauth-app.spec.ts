import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { REGEX } from '@server/constants';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface RegisterBody {
  displayName: string;
  kind: 'WEB_CONFIDENTIAL' | 'SPA_PUBLIC' | 'NATIVE_PUBLIC';
  redirectUris: string[];
  homePageUrl?: string;
  logoUrl?: string;
  offlineAccess?: boolean;
}

interface RegisteredJson {
  applicationId: number;
  clientId: string;
  clientSecret?: string;
}

interface DetailJson {
  applicationId: number;
  clientId: string;
  displayName?: string;
  isActive: boolean;
  kind: string;
  redirectUris: string[];
  scopes: string[];
  homePageUrl?: string;
  logoUrl?: string;
}

interface CatalogJson {
  scopes: { scopeId: string; name: string; resourceIdentifier: string; applicationDisplayName?: string }[];
}

interface ScopeFixture {
  usable: string;
  usableBoth: string;
  sensitive: string;
  serviceOnly: string;
  inactiveResource: string;
  orgOwned: string;
}

const env = new TestEnvironment('org-oauth-app').init();

describe('Organisation OAuth applications', () => {
  let db: PrimaryDatabase;
  let adminId: bigint;
  let memberId: bigint;
  let outsiderId: bigint;
  let foreignId: bigint;
  let adminSecret: string;
  let adminAal1Secret: string;
  let memberSecret: string;
  let outsiderSecret: string;
  let foreignSecret: string;
  let orgId: string;
  let foreignOrgId: string;
  let seq = 0;

  const uniq = (prefix: string): string => `${prefix}-${Date.now()}-${seq++}`;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL2') => (await env.getService(SessionService).create({ userId, aal })).secret;

  const basePath = (organisationId: string = orgId): string => `/api/v1/organisations/${organisationId}/oauth-apps`;

  const registerRequest = (body: Partial<RegisterBody> = {}, secret = adminSecret, organisationId = orgId) =>
    request('post', basePath(organisationId), secret, {
      displayName: 'Acme Widgets',
      kind: 'WEB_CONFIDENTIAL',
      redirectUris: ['https://widgets.example.com/callback'],
      ...body,
    });

  const register = async (body: Partial<RegisterBody> = {}, secret = adminSecret, organisationId = orgId): Promise<RegisteredJson> => {
    const response = await registerRequest(body, secret, organisationId);
    expect(response.statusCode).toBe(201);
    return response.json() as RegisteredJson;
  };

  const codeOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const applicationRow = (applicationId: number) => db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) });

  const clientRow = (clientId: string) => db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, clientId) });

  const createUser = async (email: string): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;

  const seedScopes = async (): Promise<ScopeFixture> => {
    const platformName = uniq('platform');
    const platform = await env.getService(ApplicationService).createApplication({ name: platformName, subDomain: platformName, displayName: 'Platform App', visibility: 'PUBLIC' });
    const ownedName = uniq('owned');
    const [owned] = await db
      .insert(schema.applications)
      .values({ name: ownedName, subDomain: ownedName, displayName: 'Org Owned', visibility: 'RESTRICTED', ownerOrganisationId: BigInt(orgId) })
      .returning();

    const resource = async (applicationId: number, suffix: string, isActive = true) => {
      const [row] = await db
        .insert(schema.apiResources)
        .values({ applicationId, identifier: `api://${uniq(suffix)}`, displayName: suffix, isActive })
        .returning();
      return row!.id;
    };
    const scope = async (apiResourceId: string, name: string, extra: { isSensitive?: boolean; principalType?: 'USER' | 'SERVICE' | 'BOTH' } = {}) => {
      const [row] = await db
        .insert(schema.scopes)
        .values({ apiResourceId, name, description: name, ...extra })
        .returning();
      return row!.id;
    };

    const active = await resource(platform.id, 'active');
    const inactive = await resource(platform.id, 'inactive', false);
    const ownedResource = await resource(owned!.id, 'org');

    return {
      usable: await scope(active, 'things.read', { principalType: 'USER' }),
      usableBoth: await scope(active, 'things.both', { principalType: 'BOTH' }),
      sensitive: await scope(active, 'things.admin', { isSensitive: true, principalType: 'USER' }),
      serviceOnly: await scope(active, 'things.machine', { principalType: 'SERVICE' }),
      inactiveResource: await scope(inactive, 'things.retired', { principalType: 'USER' }),
      orgOwned: await scope(ownedResource, 'things.private', { principalType: 'USER' }),
    };
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();

    const organisations = env.getService(OrganisationService);
    const ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com');
    memberId = await createUser('member@example.com');
    outsiderId = await createUser('outsider@example.com');
    foreignId = await createUser('foreign@example.com');

    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id.toString();
    foreignOrgId = (await organisations.createTeam(foreignId, { name: 'Globex' })).id.toString();
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), memberId, 'MEMBER');

    adminSecret = await session(adminId);
    adminAal1Secret = await session(adminId, 'AAL1');
    memberSecret = await session(memberId);
    outsiderSecret = await session(outsiderId);
    foreignSecret = await session(foreignId);
  });

  describe('access control', () => {
    it('should let an org admin register, list, read, update, rotate, and delete', async () => {
      const app = await register();

      const listed = await request('get', basePath(), adminSecret);
      expect(listed.statusCode).toBe(200);
      expect((listed.json() as { apps: { applicationId: number }[] }).apps.map(entry => entry.applicationId)).toContain(app.applicationId);

      const detail = await request('get', `${basePath()}/${app.applicationId}`, adminSecret);
      expect(detail.statusCode).toBe(200);
      expect((detail.json() as DetailJson).clientId).toBe(app.clientId);

      const updated = await request('patch', `${basePath()}/${app.applicationId}`, adminSecret, { displayName: 'Acme Renamed' });
      expect(updated.statusCode).toBe(200);

      const rotated = await request('post', `${basePath()}/${app.applicationId}/rotate-secret`, adminSecret);
      expect(rotated.statusCode).toBe(200);

      const deleted = await request('delete', `${basePath()}/${app.applicationId}`, adminSecret);
      expect(deleted.statusCode).toBe(200);
      expect((await request('get', basePath(), adminSecret).then(response => response.json() as { apps: unknown[] })).apps).toHaveLength(0);
    });

    it('should reject a plain org member with ORG_007', async () => {
      const listed = await request('get', basePath(), memberSecret);
      expect(listed.statusCode).toBe(403);
      expect(codeOf(listed)).toBe('ORG_007');

      const registered = await registerRequest({}, memberSecret);
      expect(registered.statusCode).toBe(403);
      expect(codeOf(registered)).toBe('ORG_007');
    });

    it('should reject a user who is not a member at all', async () => {
      const listed = await request('get', basePath(), outsiderSecret);
      expect(listed.statusCode).toBe(403);
      expect(codeOf(listed)).toBe('ORG_001');

      const registered = await registerRequest({}, outsiderSecret);
      expect(registered.statusCode).toBe(403);
      expect(codeOf(registered)).toBe('ORG_001');
    });

    it('should answer a different organisation with APP_001 rather than confirming the application exists', async () => {
      const app = await register();
      const foreignPath = `${basePath(foreignOrgId)}/${app.applicationId}`;

      const read = await request('get', foreignPath, foreignSecret);
      expect(read.statusCode).toBe(404);
      expect(codeOf(read)).toBe('APP_001');

      const updated = await request('patch', foreignPath, foreignSecret, { displayName: 'Stolen' });
      expect(updated.statusCode).toBe(404);
      expect(codeOf(updated)).toBe('APP_001');

      const rotated = await request('post', `${foreignPath}/rotate-secret`, foreignSecret);
      expect(rotated.statusCode).toBe(404);
      expect(codeOf(rotated)).toBe('APP_001');

      const deleted = await request('delete', foreignPath, foreignSecret);
      expect(deleted.statusCode).toBe(404);
      expect(codeOf(deleted)).toBe('APP_001');

      expect(await applicationRow(app.applicationId)).toBeDefined();
    });

    it('should demand a stepped-up session for every mutation', async () => {
      const app = await register();
      const scopes = await seedScopes();
      const mutations: [Method, string, Record<string, unknown>?][] = [
        ['post', basePath(), { displayName: 'Second', kind: 'WEB_CONFIDENTIAL', redirectUris: ['https://second.example.com/cb'] }],
        ['patch', `${basePath()}/${app.applicationId}`, { displayName: 'Renamed' }],
        ['post', `${basePath()}/${app.applicationId}/rotate-secret`, undefined],
        ['post', `${basePath()}/${app.applicationId}/scopes`, { scopeId: scopes.usable }],
        ['delete', `${basePath()}/${app.applicationId}/scopes/${scopes.usable}`, undefined],
        ['delete', `${basePath()}/${app.applicationId}`, undefined],
      ];

      for (const [method, path, body] of mutations) {
        const response = await request(method, path, adminAal1Secret, body);
        expect(response.statusCode).toBe(403);
        expect(codeOf(response)).toBe('AUTH_006');
      }
    });

    it('should keep reads available to a non-elevated admin', async () => {
      const listed = await request('get', basePath(), adminAal1Secret);
      expect(listed.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/organisations/:organisationId/oauth-apps', () => {
    it('should reject a personal workspace with ORG_003', async () => {
      const personal = await env.getService(OrganisationService).createPersonalWorkspace(adminId, 'Admin Workspace');
      const response = await registerRequest({}, adminSecret, personal.id.toString());
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('ORG_003');
    });

    it('should reject a non-active organisation with ORG_002', async () => {
      await db
        .update(schema.organisations)
        .set({ status: 'SUSPENDED' })
        .where(eq(schema.organisations.id, BigInt(orgId)));

      const response = await registerRequest();
      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('ORG_002');
    });

    it('should reject the eleventh application with APP_011', async () => {
      for (let index = 0; index < 10; index++) {
        const name = uniq('quota');
        await db.insert(schema.applications).values({ name, subDomain: name, visibility: 'RESTRICTED', ownerOrganisationId: BigInt(orgId) });
      }

      const response = await registerRequest();
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('APP_011');
    });

    it('should create the application as RESTRICTED and owned by the organisation', async () => {
      const app = await register();
      const application = await applicationRow(app.applicationId);
      expect(application?.visibility).toBe('RESTRICTED');
      expect(application?.ownerOrganisationId).toBe(BigInt(orgId));
    });

    it('should register a third-party client limited to the authorization code grant', async () => {
      const app = await register();
      const client = await clientRow(app.clientId);
      expect(client?.isFirstParty).toBe(false);
      expect(client?.grantTypes).toEqual(['authorization_code']);
      expect(client?.grantTypes).not.toContain('client_credentials');
      expect(client?.organisationId).toBe(BigInt(orgId));
    });

    it('should add the refresh token grant only when offline access is requested', async () => {
      const app = await register({ displayName: 'Offline App', offlineAccess: true });
      const client = await clientRow(app.clientId);
      expect(client?.grantTypes).toEqual(['authorization_code', 'refresh_token']);
      expect(client?.grantTypes).not.toContain('client_credentials');
    });

    it('should derive the application name from the organisation id and the display name slug', async () => {
      const app = await register({ displayName: 'Acme Widgets' });
      expect(app.clientId).toBe(`org-${orgId}-acme-widgets`);
      expect(app.clientId).toMatch(REGEX.CLIENT_ID);
      expect((await applicationRow(app.applicationId))?.name).toBe(app.clientId);
    });

    it('should fall back to a default slug when the display name slugifies to empty', async () => {
      const app = await register({ displayName: '***' });
      expect(app.clientId).toBe(`org-${orgId}-app`);
      expect(app.clientId).toMatch(REGEX.CLIENT_ID);
    });

    it('should append a discriminator when the derived name collides', async () => {
      const taken = `org-${orgId}-acme-widgets`;
      await db.insert(schema.applications).values({ name: taken, subDomain: taken, visibility: 'RESTRICTED', ownerOrganisationId: BigInt(orgId) });

      const app = await register({ displayName: 'Acme Widgets' });
      expect(app.clientId).toBe(`${taken}-2`);
      expect(app.clientId).toMatch(REGEX.CLIENT_ID);
    });

    it('should audit the registration against the organisation', async () => {
      const app = await register();
      const [event] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'org.oauth_app.registered'));
      expect(event?.organisationId).toBe(orgId);
      expect(event?.targetId).toBe(String(app.applicationId));
      expect(event?.actorId).toBe(adminId.toString());
      expect(event?.outcome).toBe('SUCCESS');
    });
  });

  describe('redirect uri hardening', () => {
    const rejected = async (kind: RegisterBody['kind'], uri: string): Promise<void> => {
      const response = await registerRequest({ displayName: uniq('Reject'), kind, redirectUris: [uri] });
      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('APP_012');
    };

    it('should reject a plain http redirect uri on a confidential client', async () => {
      await rejected('WEB_CONFIDENTIAL', 'http://widgets.example.com/callback');
      await rejected('WEB_CONFIDENTIAL', 'http://localhost:3000/callback');
    });

    it('should reject a wildcard redirect uri', async () => {
      await rejected('WEB_CONFIDENTIAL', 'https://*.example.com/callback');
    });

    it('should reject a redirect uri carrying userinfo', async () => {
      await rejected('WEB_CONFIDENTIAL', 'https://user:pass@widgets.example.com/callback');
    });

    it('should reject a redirect uri with a fragment', async () => {
      await rejected('WEB_CONFIDENTIAL', 'https://widgets.example.com/callback#token');
    });

    it('should reject a javascript redirect uri', async () => {
      await rejected('NATIVE_PUBLIC', 'javascript:alert(1)');
      await rejected('WEB_CONFIDENTIAL', 'javascript:alert(1)');
    });

    it('should reject an unparsable redirect uri', async () => {
      await rejected('WEB_CONFIDENTIAL', 'not-a-uri');
    });

    it('should reject more than ten redirect uris and an empty list at the schema boundary', async () => {
      const uris = Array.from({ length: 11 }, (_, index) => `https://widgets.example.com/cb-${index}`);
      const tooMany = await registerRequest({ displayName: uniq('Many'), redirectUris: uris });
      expect(tooMany.statusCode).toBe(422);

      const none = await registerRequest({ displayName: uniq('None'), redirectUris: [] });
      expect(none.statusCode).toBe(422);

      const updated = await registerRequest().then(response => (response.json() as RegisteredJson).applicationId);
      expect((await request('patch', `${basePath()}/${updated}`, adminSecret, { redirectUris: uris })).statusCode).toBe(422);
      expect((await request('patch', `${basePath()}/${updated}`, adminSecret, { redirectUris: [] })).statusCode).toBe(422);
    });

    it('should accept https redirect uris for every kind', async () => {
      for (const kind of ['WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC'] as const) {
        const app = await register({ displayName: uniq(`Https ${kind}`), kind, redirectUris: [`https://widgets.example.com/${kind.toLowerCase()}`] });
        expect(app.clientId).toMatch(REGEX.CLIENT_ID);
      }
    });

    it('should accept loopback http redirect uris for public kinds', async () => {
      const app = await register({
        displayName: uniq('Loopback'),
        kind: 'SPA_PUBLIC',
        redirectUris: ['http://localhost:3000/callback', 'http://127.0.0.1:3000/callback', 'http://[::1]:3000/callback'],
      });
      const detail = await request('get', `${basePath()}/${app.applicationId}`, adminSecret);
      expect((detail.json() as DetailJson).redirectUris).toHaveLength(3);
    });

    it('should accept a custom scheme only for a native public client', async () => {
      const native = await register({ displayName: uniq('Native'), kind: 'NATIVE_PUBLIC', redirectUris: ['com.acme.widgets://oauth/callback'] });
      expect(native.clientId).toMatch(REGEX.CLIENT_ID);

      await rejected('SPA_PUBLIC', 'com.acme.widgets://oauth/callback');
      await rejected('WEB_CONFIDENTIAL', 'com.acme.widgets://oauth/callback');
    });
  });

  describe('home page and logo urls', () => {
    const registerWith = (field: 'homePageUrl' | 'logoUrl', value: string) => registerRequest({ displayName: uniq('Urls'), [field]: value });

    it('should reject a javascript, data, or http home page url on register', async () => {
      for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://widgets.example.com']) {
        const response = await registerWith('homePageUrl', value);
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_012');
      }
    });

    it('should reject a javascript, data, or http logo url on register', async () => {
      for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'http://widgets.example.com/logo.png']) {
        const response = await registerWith('logoUrl', value);
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_012');
      }
    });

    it('should accept https home page and logo urls on register', async () => {
      const app = await register({ homePageUrl: 'https://widgets.example.com', logoUrl: 'https://widgets.example.com/logo.png' });
      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.homePageUrl).toBe('https://widgets.example.com');
      expect(detail.logoUrl).toBe('https://widgets.example.com/logo.png');
    });

    it('should reject a javascript, data, or http home page url on update', async () => {
      const app = await register();
      for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://widgets.example.com']) {
        const response = await request('patch', `${basePath()}/${app.applicationId}`, adminSecret, { homePageUrl: value });
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_012');
      }
      expect((await applicationRow(app.applicationId))?.homePageUrl).toBeNull();
    });

    it('should reject a javascript, data, or http logo url on update', async () => {
      const app = await register();
      for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'http://widgets.example.com/logo.png']) {
        const response = await request('patch', `${basePath()}/${app.applicationId}`, adminSecret, { logoUrl: value });
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_012');
      }
      expect((await applicationRow(app.applicationId))?.logoUrl).toBeNull();
    });

    it('should accept https home page and logo urls on update', async () => {
      const app = await register();
      const response = await request('patch', `${basePath()}/${app.applicationId}`, adminSecret, {
        homePageUrl: 'https://renamed.example.com',
        logoUrl: 'https://renamed.example.com/logo.png',
      });
      expect(response.statusCode).toBe(200);

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.homePageUrl).toBe('https://renamed.example.com');
      expect(detail.logoUrl).toBe('https://renamed.example.com/logo.png');
    });

    it('should reject an invalid redirect uri on update and leave the stored set untouched', async () => {
      const app = await register();
      const response = await request('patch', `${basePath()}/${app.applicationId}`, adminSecret, { redirectUris: ['http://widgets.example.com/callback'] });
      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('APP_012');

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.redirectUris).toEqual(['https://widgets.example.com/callback']);
    });
  });

  describe('GET /api/v1/organisations/:organisationId/oauth-apps/scope-catalog', () => {
    it('should list only non-sensitive user scopes from active platform resources', async () => {
      const scopes = await seedScopes();
      const response = await request('get', `${basePath()}/scope-catalog`, adminSecret);
      expect(response.statusCode).toBe(200);

      const listed = (response.json() as CatalogJson).scopes;
      const ids = listed.map(entry => entry.scopeId);
      expect(ids).toContain(scopes.usable);
      expect(ids).toContain(scopes.usableBoth);
      expect(listed.find(entry => entry.scopeId === scopes.usable)?.applicationDisplayName).toBe('Platform App');
    });

    it('should omit sensitive, service-only, inactive-resource, and organisation-owned scopes', async () => {
      const scopes = await seedScopes();
      const listed = ((await request('get', `${basePath()}/scope-catalog`, adminSecret)).json() as CatalogJson).scopes.map(entry => entry.scopeId);
      expect(listed).not.toContain(scopes.sensitive);
      expect(listed).not.toContain(scopes.serviceOnly);
      expect(listed).not.toContain(scopes.inactiveResource);
      expect(listed).not.toContain(scopes.orgOwned);
    });
  });

  describe('application scopes', () => {
    it('should grant a catalog scope and surface it on the detail', async () => {
      const scopes = await seedScopes();
      const app = await register();

      const granted = await request('post', `${basePath()}/${app.applicationId}/scopes`, adminSecret, { scopeId: scopes.usable });
      expect(granted.statusCode).toBe(200);

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.scopes).toContain('things.read');
    });

    it('should revoke a granted scope', async () => {
      const scopes = await seedScopes();
      const app = await register();
      await request('post', `${basePath()}/${app.applicationId}/scopes`, adminSecret, { scopeId: scopes.usable });

      const revoked = await request('delete', `${basePath()}/${app.applicationId}/scopes/${scopes.usable}`, adminSecret);
      expect(revoked.statusCode).toBe(200);

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.scopes).not.toContain('things.read');
    });

    it('should reject a scope that exists but falls outside the catalog with APP_010', async () => {
      const scopes = await seedScopes();
      const app = await register();

      for (const scopeId of [scopes.sensitive, scopes.serviceOnly, scopes.inactiveResource, scopes.orgOwned]) {
        const response = await request('post', `${basePath()}/${app.applicationId}/scopes`, adminSecret, { scopeId });
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_010');
      }

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as DetailJson;
      expect(detail.scopes).toHaveLength(0);
    });
  });

  describe('client secrets', () => {
    it('should return the client secret once on register and never in the list or the detail', async () => {
      const app = await register();
      expect(app.clientSecret).toBeString();

      const listed = (await request('get', basePath(), adminSecret)).json() as { apps: Record<string, unknown>[] };
      expect(JSON.stringify(listed)).not.toContain(app.clientSecret!);
      expect(listed.apps.every(entry => entry.clientSecret === undefined && entry.secret === undefined)).toBe(true);

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as Record<string, unknown>;
      expect(JSON.stringify(detail)).not.toContain(app.clientSecret!);
      expect(detail.clientSecret).toBeUndefined();
      expect(detail.secret).toBeUndefined();
    });

    it('should not issue a client secret for a public client', async () => {
      const app = await register({ displayName: uniq('Public'), kind: 'SPA_PUBLIC' });
      expect(app.clientSecret).toBeUndefined();
      expect((await clientRow(app.clientId))?.tokenEndpointAuthMethod).toBe('none');
    });

    it('should rotate the secret of a confidential client without exposing it afterwards', async () => {
      const app = await register();
      const response = await request('post', `${basePath()}/${app.applicationId}/rotate-secret`, adminSecret);
      expect(response.statusCode).toBe(200);

      const rotated = response.json() as { secret: string; previousSecretsExpireAt: string };
      expect(rotated.secret).toBeString();
      expect(rotated.secret).not.toBe(app.clientSecret);
      expect(Date.parse(rotated.previousSecretsExpireAt)).toBeGreaterThan(Date.now());

      const detail = (await request('get', `${basePath()}/${app.applicationId}`, adminSecret)).json() as Record<string, unknown>;
      expect(JSON.stringify(detail)).not.toContain(rotated.secret);
      const listed = (await request('get', basePath(), adminSecret)).json();
      expect(JSON.stringify(listed)).not.toContain(rotated.secret);
    });

    it('should reject rotation on a public client with APP_013', async () => {
      for (const kind of ['SPA_PUBLIC', 'NATIVE_PUBLIC'] as const) {
        const app = await register({ displayName: uniq(kind), kind, redirectUris: ['https://widgets.example.com/callback'] });
        const response = await request('post', `${basePath()}/${app.applicationId}/rotate-secret`, adminSecret);
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('APP_013');
      }
    });
  });

  describe('DELETE /api/v1/organisations/:organisationId/oauth-apps/:applicationId', () => {
    it('should remove both the oauth client and the application row', async () => {
      const app = await register();
      expect(await clientRow(app.clientId)).toBeDefined();

      const response = await request('delete', `${basePath()}/${app.applicationId}`, adminSecret);
      expect(response.statusCode).toBe(200);

      expect(await clientRow(app.clientId)).toBeUndefined();
      expect(await applicationRow(app.applicationId)).toBeUndefined();
    });

    it('should free the derived name for reuse after a delete', async () => {
      const first = await register();
      await request('delete', `${basePath()}/${first.applicationId}`, adminSecret);

      const second = await register();
      expect(second.clientId).toBe(first.clientId);
      expect(second.applicationId).not.toBe(first.applicationId);
    });
  });
});
