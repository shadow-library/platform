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
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationAccessService, ApplicationService, OrganisationApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface OrganisationItem {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('app-session-organisation').init();
const REDIRECT_URI = 'https://app.example.com/callback';
const REPORTS = 'api://reports';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

const basic = (clientId: string, secret: string) => `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;

/**
 * The organisation an application session acts in is where its capability is evaluated, so it has to be
 * one the user actually reaches the application through — pinning every session to the personal
 * workspace made a role granted in a team organisation unreachable from the browser.
 */
describe('App session organisations', () => {
  let client: { clientId: string; secret?: string };
  let applicationId: number;
  let userId: bigint;
  let personalOrganisationId: bigint;
  let teamOrganisationId: bigint;
  let sessionSecret: string;

  const registerApp = async () => {
    const clientService = env.getService(OAuthClientService);
    applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const manage = await clientService.ensureScope(applicationId, 'shadow-identity', 'app-session:manage');
    const reports = await clientService.ensureResource(applicationId, REPORTS);
    const read = await clientService.createScope(reports.id, 'reports:read');
    return clientService.register({
      applicationId,
      name: 'Reports App',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'client_credentials'],
      redirectUris: [REDIRECT_URI],
      scopeIds: [manage, read],
    });
  };

  const serviceToken = async () => {
    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .headers({ authorization: basic(client.clientId, client.secret ?? ''), 'content-type': 'application/x-www-form-urlencoded' })
      .body(new URLSearchParams({ grant_type: 'client_credentials', scope: 'app-session:manage' }).toString());
    return (response.json() as { access_token: string }).access_token;
  };

  const openSession = async () => {
    const { verifier, challenge } = pkce();
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid reports:read',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: REPORTS,
    });
    const redirect = await env
      .getRouter()
      .mockRequest()
      .get(`/oauth2/authorize?${params.toString()}`)
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
    const code = new URL(redirect.headers.location ?? '').searchParams.get('code') ?? '';

    const bearer = await serviceToken();
    const opened = await env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ code, codeVerifier: verifier, redirectUri: REDIRECT_URI });
    return (opened.json() as { sessionHandle: string }).sessionHandle;
  };

  const mint = async (handle: string) => {
    const bearer = await serviceToken();
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions/token')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ sessionHandle: handle, resource: REPORTS });
  };

  const listOrganisations = async (handle: string) => {
    const bearer = await serviceToken();
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions/organisations')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ sessionHandle: handle });
  };

  const switchOrganisation = async (handle: string, organisationId: bigint) => {
    const bearer = await serviceToken();
    return env
      .getRouter()
      .mockRequest()
      .post('/api/v1/app-sessions/organisation')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ sessionHandle: handle, organisationId: organisationId.toString() });
  };

  const organisationOf = (response: { json: () => unknown }) => {
    const { accessToken } = response.json() as { accessToken: string };
    return env.getService(KeyService).verify(accessToken)?.org;
  };

  /** Moves the application behind a platform release so only the team organisation still reaches it. */
  const restrictToTeam = async () => {
    await env.getService(ApplicationService).updateApplication('shadow-identity', { visibility: 'RESTRICTED' });
    await env.getService(OrganisationApplicationService).release({ actorId: userId.toString() }, applicationId, teamOrganisationId);
    await env.getService(ApplicationAccessService).invalidateGlobal();
  };

  beforeEach(async () => {
    /** Redis outlives the per-test DB reset, which replays serial ids; a stale grant set would answer for a reused application id. */
    await env.getRedisClient().flushdb();
    client = await registerApp();

    const user = await env.getService(UserService).createUserWithPassword({ email: 'switch@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    userId = user.id;
    personalOrganisationId = user.personalOrganisationId as bigint;

    const team = await env.getService(OrganisationService).createTeam(userId, { name: 'Switching Team' });
    teamOrganisationId = team.id;

    sessionSecret = (await env.getService(SessionService).create({ userId })).secret;
  });

  it('should open a session in the organisation that grants the application', async () => {
    const handle = await openSession();

    /** A PUBLIC application is granted by the personal workspace, so this stays exactly where it always was. */
    expect(organisationOf(await mint(handle))).toBe(personalOrganisationId.toString());
  });

  it('should list every granting organisation and flag the active one', async () => {
    const handle = await openSession();

    const response = await listOrganisations(handle);
    expect(response.statusCode).toBe(200);
    const { organisations } = response.json() as { organisations: OrganisationItem[] };
    expect(organisations.map(organisation => organisation.id).sort()).toEqual([personalOrganisationId.toString(), teamOrganisationId.toString()].sort());
    expect(organisations.find(organisation => organisation.active)?.id).toBe(personalOrganisationId.toString());
  });

  it('should switch into another granting organisation and mint tokens against it', async () => {
    const handle = await openSession();

    const switched = await switchOrganisation(handle, teamOrganisationId);
    expect(switched.statusCode).toBe(200);
    const { sessionHandle: rotated } = switched.json() as { sessionHandle: string };

    expect(organisationOf(await mint(rotated))).toBe(teamOrganisationId.toString());
  });

  /**
   * Rotation is the invalidation mechanism, not hygiene: applications cache minted tokens against the
   * handle they hold, and one replica cannot reach another's cache. Retiring the handle is what stops
   * the previous organisation's authority outliving the switch.
   */
  it('should retire the previous handle when the organisation changes', async () => {
    const handle = await openSession();

    const { sessionHandle: rotated } = (await switchOrganisation(handle, teamOrganisationId)).json() as { sessionHandle: string };
    expect(rotated).not.toBe(handle);

    expect((await mint(handle)).statusCode).toBe(401);
    expect((await mint(rotated)).statusCode).toBe(200);
  });

  it('should refuse a switch into an organisation the user does not reach the application through', async () => {
    const handle = await openSession();
    const outsider = await env.getService(OrganisationService).createTeam(userId, { name: 'Unreachable Team' });
    await restrictToTeam();

    const refused = await switchOrganisation(handle, outsider.id);
    expect(refused.statusCode).toBe(403);
  });

  /**
   * A session whose organisation stops granting the application is re-pointed rather than ended: access
   * itself still holds through another organisation, so revoking would be gratuitous. This is also what
   * converges sessions opened before the organisation was resolved from reachability at all.
   */
  it('should realign a session whose organisation no longer grants the application', async () => {
    const handle = await openSession();
    expect(organisationOf(await mint(handle))).toBe(personalOrganisationId.toString());

    await restrictToTeam();

    const realigned = await mint(handle);
    expect(realigned.statusCode).toBe(200);
    expect(organisationOf(realigned)).toBe(teamOrganisationId.toString());
  });

  it('should end the session when no organisation grants the application any more', async () => {
    const handle = await openSession();
    await env.getService(ApplicationService).updateApplication('shadow-identity', { visibility: 'RESTRICTED' });
    await env.getService(ApplicationAccessService).invalidateGlobal();

    expect((await mint(handle)).statusCode).toBe(401);
  });
});
