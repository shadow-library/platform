import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { Application, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

interface RegisteredApp {
  clientId: string;
  secret: string;
  applicationId: number;
  audience: string;
}

const env = new TestEnvironment('app-access-enforcement').init();
const REDIRECT_URI = 'https://gate.example.com/callback';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

const basic = (clientId: string, secret: string) => `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const FORM = 'application/x-www-form-urlencoded';

describe('Application access enforcement (T-902)', () => {
  let db: PrimaryDatabase;
  let userId: bigint;
  let organisationId: bigint;
  let sessionSecret: string;
  let seq = 0;

  const uniq = () => `${Date.now()}-${seq++}`;

  const createApp = async (visibility: Application.Visibility): Promise<{ id: number; name: string; audience: string }> => {
    const name = `gate-${uniq()}`;
    const application = await env.getService(ApplicationService).createApplication({ name, subDomain: name, visibility });
    const audience = `api://${name}`;
    await env.getService(OAuthClientService).ensureResource(application.id, audience);
    return { id: application.id, name, audience };
  };

  const registerClient = async (
    applicationId: number,
    options: { firstParty?: boolean; refresh?: boolean; appSession?: boolean } = {},
  ): Promise<RegisteredApp & { audience: string }> => {
    const clientService = env.getService(OAuthClientService);
    const audience = (await clientService.listResources()).find(resource => resource.applicationId === applicationId)?.identifier ?? '';
    const scopeIds: string[] = [];
    if (options.appSession) {
      const platformId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      scopeIds.push(await clientService.ensureScope(platformId, 'shadow-identity', 'app-session:manage'));
    }
    const grantTypes = ['authorization_code', 'client_credentials', ...(options.refresh ? ['refresh_token'] : [])];
    const registered = await clientService.register({
      applicationId,
      name: `client-${uniq()}`,
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: options.firstParty ?? true,
      grantTypes,
      redirectUris: [REDIRECT_URI],
      scopeIds,
    });
    return { clientId: registered.clientId, secret: registered.secret ?? '', applicationId, audience };
  };

  const assign = async (applicationId: number): Promise<void> => {
    await db.insert(schema.organisationApplications).values({ organisationId, applicationId, source: 'ORG_ASSIGNMENT' });
    await env.getService(ApplicationAccessService).invalidateOrganisation(organisationId.toString());
  };

  const unassign = async (applicationId: number): Promise<void> => {
    await db
      .delete(schema.organisationApplications)
      .where(and(eq(schema.organisationApplications.organisationId, organisationId), eq(schema.organisationApplications.applicationId, applicationId)));
    await env.getService(ApplicationAccessService).invalidateOrganisation(organisationId.toString());
  };

  const authorize = (client: { clientId: string }, options: { cookie?: boolean; resource?: string; state?: string } = {}) => {
    const { challenge } = pkce();
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (options.resource) params.set('resource', options.resource);
    if (options.state) params.set('state', options.state);
    const chain = env.getRouter().mockRequest().get(`/oauth2/authorize?${params.toString()}`);
    return (options.cookie ?? true) ? chain.cookies({ [SESSION_COOKIE_NAME]: sessionSecret }) : chain;
  };

  beforeEach(async () => {
    db = env.getPostgresClient();
    await env.getRedisClient().flushdb();
    const [user] = await db.insert(schema.users).values({ status: 'ACTIVE' }).returning({ id: schema.users.id });
    userId = user!.id;
    const [org] = await db
      .insert(schema.organisations)
      .values({ name: `Team ${uniq()}`, slug: `team-${uniq()}`, type: 'TEAM', status: 'ACTIVE', appAccessMode: 'ASSIGNED_ONLY' })
      .returning({ id: schema.organisations.id });
    organisationId = org!.id;
    await db.insert(schema.organisationMembers).values({ organisationId, userId, role: 'MEMBER', status: 'ACTIVE' });
    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  describe('authorize', () => {
    it('should issue a code to a granted user unchanged', async () => {
      const app = await createApp('PUBLIC');
      const client = await registerClient(app.id);
      await assign(app.id);

      const response = await authorize(client, { state: 'xyz' });
      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location ?? '');
      expect(location.searchParams.get('code')).toBeTruthy();
      expect(location.searchParams.get('state')).toBe('xyz');
    });

    it('should send a denied first-party user to the hosted error page and audit the denial', async () => {
      const app = await createApp('PUBLIC');
      const client = await registerClient(app.id, { firstParty: true });

      const response = await authorize(client);
      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location ?? '');
      expect(location.pathname).toBe('/error');
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('application')).toBe(app.name);
      expect(location.searchParams.get('client_id')).toBe(client.clientId);

      const audit = await db.query.auditEvents.findFirst({ where: eq(schema.auditEvents.action, 'oauth.authorize.denied') });
      expect(audit?.outcome).toBe('DENIED');
      expect(audit?.targetId).toBe(client.clientId);
    });

    it('should send a denied third-party user back to its redirect_uri with access_denied', async () => {
      const app = await createApp('RESTRICTED');
      const client = await registerClient(app.id, { firstParty: false });

      const response = await authorize(client, { state: 'state-9' });
      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location ?? '');
      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('state')).toBe('state-9');
    });

    it('should answer an INTERNAL app as an unknown client (invalid_client) to a non-platform user', async () => {
      const app = await createApp('INTERNAL');
      const client = await registerClient(app.id);

      const response = await authorize(client);
      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location ?? '');
      expect(location.pathname).toBe('/invalid-request');
      expect(location.searchParams.get('error')).toBe('invalid_client');
      expect(location.searchParams.get('application')).toBeNull();
    });
  });

  describe('app-session mint', () => {
    const serviceToken = async (client: RegisteredApp) => {
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(client.clientId, client.secret), 'content-type': FORM })
        .body(form({ grant_type: 'client_credentials', scope: 'app-session:manage' }));
      return (response.json() as { access_token: string }).access_token;
    };

    const openSession = async (client: RegisteredApp): Promise<string> => {
      const { verifier, challenge } = pkce();
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: client.audience,
      });
      const redirect = await env
        .getRouter()
        .mockRequest()
        .get(`/oauth2/authorize?${params.toString()}`)
        .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
      const code = new URL(redirect.headers.location ?? '').searchParams.get('code') ?? '';
      const bearer = await serviceToken(client);
      const opened = await env
        .getRouter()
        .mockRequest()
        .post('/api/v1/app-sessions')
        .headers({ authorization: `Bearer ${bearer}` })
        .body({ code, codeVerifier: verifier, redirectUri: REDIRECT_URI });
      return (opened.json() as { sessionHandle: string }).sessionHandle;
    };

    const mint = async (client: RegisteredApp, handle: string) => {
      const bearer = await serviceToken(client);
      return env
        .getRouter()
        .mockRequest()
        .post('/api/v1/app-sessions/token')
        .headers({ authorization: `Bearer ${bearer}` })
        .body({ sessionHandle: handle, resource: client.audience });
    };

    it('should revoke the app session and answer AUTH_005 once access is unassigned, then work again after re-assignment', async () => {
      const app = await createApp('PUBLIC');
      const client = await registerClient(app.id, { appSession: true });
      await assign(app.id);

      const handle = await openSession(client);
      expect((await mint(client, handle)).statusCode).toBe(200);

      await unassign(app.id);
      const denied = await mint(client, handle);
      expect(denied.statusCode).toBe(401);
      expect(denied.json()).toMatchObject({ code: 'AUTH_005' });

      await assign(app.id);
      expect((await mint(client, handle)).statusCode).toBe(401);

      const fresh = await openSession(client);
      expect((await mint(client, fresh)).statusCode).toBe(200);
    });
  });

  describe('refresh_token grant', () => {
    const codeFlow = async (client: RegisteredApp): Promise<string> => {
      const { verifier, challenge } = pkce();
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      const redirect = await env
        .getRouter()
        .mockRequest()
        .get(`/oauth2/authorize?${params.toString()}`)
        .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
      const code = new URL(redirect.headers.location ?? '').searchParams.get('code') ?? '';
      const token = await env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(client.clientId, client.secret), 'content-type': FORM })
        .body(form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
      return (token.json() as { refresh_token: string }).refresh_token;
    };

    const refresh = (client: RegisteredApp, refreshToken: string) =>
      env
        .getRouter()
        .mockRequest()
        .post('/oauth2/token')
        .headers({ authorization: basic(client.clientId, client.secret), 'content-type': FORM })
        .body(form({ grant_type: 'refresh_token', refresh_token: refreshToken }));

    it('should refuse the refresh with invalid_grant and revoke the family once access is unassigned', async () => {
      const app = await createApp('PUBLIC');
      const client = await registerClient(app.id, { refresh: true });
      await assign(app.id);

      const refreshToken = await codeFlow(client);

      await unassign(app.id);
      const denied = await refresh(client, refreshToken);
      expect(denied.statusCode).toBe(400);
      expect(denied.json()).toMatchObject({ code: 'invalid_grant' });

      await assign(app.id);
      expect((await refresh(client, refreshToken)).statusCode).toBe(400);
    });
  });
});
