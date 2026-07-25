/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { KeyService } from '@server/modules/auth/keys';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('app-session').init();
const REDIRECT_URI = 'https://app.example.com/callback';
const REPORTS = 'api://reports';
const BILLING = 'api://billing';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

const basic = (clientId: string, secret: string) => `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;

describe('First-party app sessions', () => {
  let client: { clientId: string; secret?: string };
  let rival: { clientId: string; secret?: string };
  let userId: bigint;
  let sessionSecret: string;
  let sessionId: bigint;

  /** Registers a first-party client entitled to manage app sessions and to reach both test APIs. */
  const registerApp = async (name: string) => {
    const clientService = env.getService(OAuthClientService);
    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const manage = await clientService.ensureScope(applicationId, 'shadow-identity', 'app-session:manage');
    const reports = await clientService.ensureResource(applicationId, REPORTS);
    const billing = await clientService.ensureResource(applicationId, BILLING);
    const read = await clientService.createScope(reports.id, 'reports:read');
    const exportScope = await clientService.createScope(reports.id, 'reports:export', undefined, true);
    const billingRead = await clientService.createScope(billing.id, 'billing:read');
    return clientService.register({
      applicationId,
      name,
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'client_credentials'],
      redirectUris: [REDIRECT_URI],
      scopeIds: [manage, read, exportScope, billingRead],
    });
  };

  /** The application's own machine credential — required alongside the handle for every call. */
  const serviceToken = async (app: { clientId: string; secret?: string }) => {
    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(app.clientId, app.secret ?? ''), 'content-type': 'application/x-www-form-urlencoded' })
      .body(new URLSearchParams({ grant_type: 'client_credentials', scope: 'app-session:manage' }).toString());
    return (response.json() as { access_token: string }).access_token;
  };

  const authorizationCode = async (resource: string, scope: string, app = client) => {
    const { verifier, challenge } = pkce();
    const params = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource,
    });
    const redirect = await env
      .getRouter()
      .mockRequest()
      .get(`/oauth2/authorize?${params.toString()}`)
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
    return { code: new URL(redirect.headers.location ?? '').searchParams.get('code') ?? '', verifier };
  };

  /** The service token is resolved before the chain is built: `mockRequest` cannot be interleaved. */
  const openSession = async (app = client, resource = REPORTS, scope = 'openid reports:read reports:export') => {
    const { code, verifier } = await authorizationCode(resource, scope, app);
    const bearer = await serviceToken(app);
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ code, codeVerifier: verifier, redirectUri: REDIRECT_URI });
  };

  const mint = async (handle: string, body: Record<string, unknown> = {}, app = client) => {
    const bearer = await serviceToken(app);
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions/token')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ sessionHandle: handle, resource: REPORTS, ...body });
  };

  const claimElevation = async (handle: string, resource = REPORTS, app = client) => {
    const bearer = await serviceToken(app);
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions/elevation')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ sessionHandle: handle, resource });
  };

  beforeEach(async () => {
    client = await registerApp('Reports App');
    rival = await registerApp('Rival App');
    const user = await env.getService(UserService).createUserWithPassword({ email: 'app@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    const created = await env.getService(SessionService).create({ userId });
    sessionSecret = created.secret;
    sessionId = created.session.id;
  });

  it('should open a session from an authorization code and mint a verifiable token', async () => {
    const opened = await openSession();
    expect(opened.statusCode).toBe(201);
    const { sessionHandle, userId: subject } = opened.json() as { sessionHandle: string; userId: string };
    expect(subject).toBe(userId.toString());

    const token = await mint(sessionHandle);
    expect(token.statusCode).toBe(200);
    const body = token.json() as { accessToken: string; aal: string; scope: string };
    expect(body.aal).toBe('AAL1');

    const claims = env.getService(KeyService).verify(body.accessToken);
    expect(claims?.sub).toBe(userId.toString());
    expect(claims?.aud).toBe(REPORTS);
    expect(claims?.sid).toBe(sessionId.toString());
  });

  it('should refuse a handle presented by a different client', async () => {
    const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
    const stolen = await mint(sessionHandle, {}, rival);
    expect(stolen.statusCode).toBe(401);
  });

  it('should stop minting once the central session is revoked', async () => {
    const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
    expect((await mint(sessionHandle)).statusCode).toBe(200);

    await env.getService(SessionService).revoke(sessionId, 'TERMINATED');
    expect((await mint(sessionHandle)).statusCode).toBe(401);
  });

  describe('step-up isolation', () => {
    /** A ceremony always declares what it is for (D-19, T-801); an intentless window is claimable by nobody. */
    const elevateCentralSession = (app = client, resource = REPORTS) => env.getService(SessionService).elevate(sessionId, { clientId: app.clientId, resource });

    it('should withhold a sensitive scope from an ordinary token and require a grant to elevate', async () => {
      const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };

      const ordinary = await mint(sessionHandle);
      expect((ordinary.json() as { scope: string }).scope).not.toContain('reports:export');

      const withoutGrant = await mint(sessionHandle, { elevated: true });
      expect(withoutGrant.statusCode).toBe(403);
    });

    it('should mint an elevated token carrying the sensitive scope once a grant is claimed', async () => {
      const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
      await elevateCentralSession();
      expect((await claimElevation(sessionHandle)).statusCode).toBe(200);

      const elevated = await mint(sessionHandle, { elevated: true });
      expect(elevated.statusCode).toBe(200);
      const body = elevated.json() as { accessToken: string; aal: string; scope: string };
      expect(body.aal).toBe('AAL2');
      expect(body.scope).toContain('reports:export');
      expect(env.getService(KeyService).verify(body.accessToken)?.aal).toBe('AAL2');
    });

    it('should not let one application ride another application’s step-up', async () => {
      const mine = (await openSession()).json() as { sessionHandle: string };
      const theirs = (await openSession(rival)).json() as { sessionHandle: string };

      await elevateCentralSession();
      expect((await claimElevation(mine.sessionHandle)).statusCode).toBe(200);

      /** The proof was spent by the first application, so the second must send the user through its own step-up. */
      expect((await claimElevation(theirs.sessionHandle, REPORTS, rival)).statusCode).toBe(403);
      expect((await mint(theirs.sessionHandle, { elevated: true }, rival)).statusCode).toBe(403);
    });

    it('should confine a step-up to the audience it was claimed for', async () => {
      const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
      await elevateCentralSession();
      await claimElevation(sessionHandle, REPORTS);

      expect((await mint(sessionHandle, { elevated: true, resource: REPORTS })).statusCode).toBe(200);
      expect((await mint(sessionHandle, { elevated: true, resource: BILLING })).statusCode).toBe(403);
    });

    it('should mint for the application’s own audience without any scope grant on it', async () => {
      const clientService = env.getService(OAuthClientService);
      const application = await env.getService(ApplicationService).createApplication({ name: 'gazette', subDomain: 'gazette' });
      await clientService.ensureResource(application.id, 'api://gazette');
      const platformId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      const manage = await clientService.ensureScope(platformId, 'shadow-identity', 'app-session:manage');
      const app = await clientService.register({
        applicationId: application.id,
        name: 'Gazette',
        kind: 'WEB_CONFIDENTIAL',
        isFirstParty: true,
        grantTypes: ['authorization_code', 'client_credentials'],
        redirectUris: [REDIRECT_URI],
        scopeIds: [manage],
      });

      const { sessionHandle } = (await openSession(app, 'api://gazette', 'openid')).json() as { sessionHandle: string };
      const minted = await mint(sessionHandle, { resource: 'api://gazette' }, app);
      expect(minted.statusCode).toBe(200);
      expect((minted.json() as { audience: string }).audience).toBe('api://gazette');
    });

    it('should leave no elevation standing on the parent session', async () => {
      const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
      await elevateCentralSession();
      await claimElevation(sessionHandle);

      const sessionService = env.getService(SessionService);
      const parent = await sessionService.validateById(sessionId);
      expect(parent).not.toBeNull();
      expect(sessionService.isElevated(parent!)).toBe(false);
      /** The achieved assurance is a fact about the login and survives; only the right to act on it is spent. */
      expect(parent!.aal).toBe('AAL2');
    });

    it('should refuse to claim a step-up the user never performed', async () => {
      const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
      expect((await claimElevation(sessionHandle)).statusCode).toBe(403);
    });

    /**
     * Spending the window is not enough on its own: before T-801 a live window was claimable
     * first-come-first-served, so whichever application asked first won a proof the user performed
     * for someone else.
     */
    describe('intent binding', () => {
      it('should refuse a claim from a client the step-up was not performed for', async () => {
        const theirs = (await openSession(rival)).json() as { sessionHandle: string };
        await elevateCentralSession(client);

        expect((await claimElevation(theirs.sessionHandle, REPORTS, rival)).statusCode).toBe(403);
        /** The window was not spent by the refused claim, so its rightful owner can still take it. */
        const mine = (await openSession()).json() as { sessionHandle: string };
        expect((await claimElevation(mine.sessionHandle)).statusCode).toBe(200);
      });

      it('should refuse a claim for an audience the step-up was not performed for', async () => {
        const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
        await elevateCentralSession(client, REPORTS);

        expect((await claimElevation(sessionHandle, BILLING)).statusCode).toBe(403);
        expect((await claimElevation(sessionHandle, REPORTS)).statusCode).toBe(200);
      });

      /** The identity console steps up for itself; no application may spend that proof. */
      it('should make a console step-up unclaimable by every application', async () => {
        const mine = (await openSession()).json() as { sessionHandle: string };
        const theirs = (await openSession(rival)).json() as { sessionHandle: string };
        await env.getService(SessionService).elevate(sessionId);

        expect((await claimElevation(mine.sessionHandle)).statusCode).toBe(403);
        expect((await claimElevation(theirs.sessionHandle, REPORTS, rival)).statusCode).toBe(403);
      });

      it('should clear the intent when the window is spent, so a replayed claim finds nothing', async () => {
        const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
        await elevateCentralSession();

        expect((await claimElevation(sessionHandle)).statusCode).toBe(200);
        expect((await claimElevation(sessionHandle)).statusCode).toBe(403);
        const parent = await env.getService(SessionService).validateById(sessionId);
        expect(parent?.elevationIntent).toBeNull();
      });

      it('should record the intent a step-up ceremony declares and refuse an unknown client', async () => {
        const sessionService = env.getService(SessionService);
        const intent = await env.getService(OAuthClientService).resolveElevationIntent(client.clientId, REPORTS);
        await sessionService.elevate(sessionId, intent ?? undefined);
        expect((await sessionService.validateById(sessionId))?.elevationIntent).toEqual({ clientId: client.clientId, resource: REPORTS });

        /** A misconfigured step-up URL fails the ceremony rather than opening a window nothing can claim. */
        expect(env.getService(OAuthClientService).resolveElevationIntent('no-such-client', REPORTS)).rejects.toThrow();
      });

      it('should default a claimless intent to the platform audience on both sides', async () => {
        const { sessionHandle } = (await openSession()).json() as { sessionHandle: string };
        const intent = await env.getService(OAuthClientService).resolveElevationIntent(client.clientId);
        await env.getService(SessionService).elevate(sessionId, intent ?? undefined);

        /** Neither side named a resource, so both resolve to `shadow-identity` and the claim matches. */
        const bearer = await serviceToken(client);
        const claim = await env
          .getRouter()
          .mockRequest()
          .post('/api/v1/app-sessions/elevation')
          .headers({ authorization: `Bearer ${bearer}` })
          .body({ sessionHandle });
        expect(claim.statusCode).toBe(200);
      });
    });
  });
});
