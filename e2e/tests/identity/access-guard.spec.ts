/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  botApi,
  createOrganisationBot,
  deleteOrganisationBotRecord,
  findApplicationIdByName,
  identityMutate,
  issueBotKey,
  type OrganisationBot,
  PLATFORM_APPLICATION_NAME,
  relyingPartyClient,
  replaceBotPermissions,
  stepUp,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The central access guard, one mode at a time: a session route, an `elevated` route, a `permission` route, an
 * `orgRole` route, the `bot` mode and a `service` route. Each case is a real route that declares exactly the mode
 * under test, and every refusal group ends by showing the same route answering the caller it was built for.
 */

/** `POST /api/v1/me/mfa/totp/enroll` — the `elevated` route the step-up cases are judged on. */
const ELEVATED_ROUTE = '/api/v1/me/mfa/totp/enroll';

/** Bots created here outlive their organisation's cascade: the OAuth client behind one is `ON DELETE restrict`. */
const bots: OrganisationBot[] = [];

test.afterEach(async () => {
  for (const bot of bots.splice(0)) await deleteOrganisationBotRecord(bot);
});

test.describe('identity route guard modes', () => {
  test('should refuse a session route without a cookie and an elevated route without a step-up', async ({ identity }) => {
    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.get('/api/v1/me');
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'AUTH_005');

    const user = await identity.createUser({ label: 'guard-elevated' });
    const { ctx } = await identity.signIn(user);
    const unelevated = await identityMutate(ctx, 'post', ELEVATED_ROUTE);
    expect(unelevated.status(), 'an AAL1 session may not enrol a factor').toBe(403);
    await expectErrorCode(unelevated, 'AUTH_006');

    const proof = await stepUp(ctx, { password: user.password });
    expect(proof.status(), await proof.text()).toBe(200);
    const elevated = await identityMutate(ctx, 'post', ELEVATED_ROUTE);
    expect(elevated.status(), 'a self-service step-up opens the same route').toBe(200);
  });

  test('should keep an app-scoped step-up out of identity’s own elevated routes', async ({ identity }) => {
    const user = await identity.createUser({ label: 'guard-intent' });
    const { ctx } = await identity.signIn(user);
    const application = await identity.createOAuthApp('guard-intent', { withPublicUrl: true });

    const claimed = await stepUp(ctx, { password: user.password, clientId: relyingPartyClient(application).clientId });
    expect(claimed.status(), await claimed.text()).toBe(200);

    const refused = await identityMutate(ctx, 'post', ELEVATED_ROUTE);
    expect(refused.status(), 'an elevation claimed for an application is not an elevation here').toBe(403);
    await expectErrorCode(refused, 'AUTH_006');

    const selfService = await stepUp(ctx, { password: user.password });
    expect(selfService.status(), await selfService.text()).toBe(200);
    expect((await identityMutate(ctx, 'post', ELEVATED_ROUTE)).status(), 'a console step-up does open it').toBe(200);
  });

  test('should admit a permission route only to a holder of the permission', async ({ identity }) => {
    const user = await identity.createUser({ label: 'guard-permission' });
    const { ctx } = await identity.signIn(user, { aal: 'AAL2' });

    const refused = await ctx.get('/api/v1/admin/users');
    expect(refused.status()).toBe(403);
    await expectErrorCode(refused, 'ADM_001');

    const admin = await identity.admin();
    expect((await admin.ctx.get('/api/v1/admin/users?limit=1')).status(), 'the platform admin holds it').toBe(200);
  });

  test('should resolve an organisation-role route from the organisation named in the path', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'guard-org' });
    const outsider = await identity.createUser({ label: 'guard-outsider' });
    const { ctx } = await identity.signIn(outsider, { aal: 'AAL2' });

    const refused = await ctx.get(`/api/v1/organisations/${team.organisationId}/invitations`);
    expect(refused.status(), 'a non-member is not in the organisation the path names').toBe(403);
    await expectErrorCode(refused, 'ORG_001');

    const owner = await team.ownerCtx.get(`/api/v1/organisations/${team.organisationId}/invitations`);
    expect(owner.status(), 'the OWNER outranks ADMIN and passes').toBe(200);
  });

  test('should admit a bot key only on a route that declares the permission it was granted', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'guard-bot' });
    const bot = await createOrganisationBot(team.ownerCtx, team.organisationId, { label: 'guard' });
    bots.push(bot);
    await replaceBotPermissions(team.ownerCtx, bot, [{ applicationId: await findApplicationIdByName(PLATFORM_APPLICATION_NAME), resource: 'members', level: 'read' }]);
    const { key } = await issueBotKey(team.ownerCtx, bot);

    const outsider = await identity.createUser({ label: 'guard-bot-outsider' });
    const { session } = await identity.signIn(outsider);
    const ctx = await botApi(key, identity.clientIp);

    const refusals: [string, () => Promise<{ status: () => number; json: () => Promise<unknown> }>][] = [
      ['an elevated route', () => ctx.post(`/api/v1/organisations/${team.organisationId}/bots`, { data: { handle: 'e2e-nope', displayName: 'nope' } })],
      ['a permission route', () => ctx.get('/api/v1/admin/users')],
      ['a service route', () => ctx.post('/api/v1/authz/check', { data: { principalType: 'USER', principalId: '1', organisationId: team.organisationId, action: 'x' } })],
      ['a plain organisation-role route', () => ctx.delete(`/api/v1/organisations/${team.organisationId}/members/${outsider.userId}`)],
      ['a bot route for a permission it was never granted', () => ctx.get(`/api/v1/organisations/${team.organisationId}/domains`)],
    ];
    for (const [label, call] of refusals) {
      const response = await call();
      expect(response.status(), label).toBe(403);
      expect((await response.json()) as { code?: string }, label).toMatchObject({ code: 'ORG_007' });
    }

    expect((await ctx.get(`/api/v1/organisations/${team.organisationId}/members`)).status(), 'the granted route answers the bot key alone').toBe(200);

    // The same call carrying a non-member's cookie still passes, which it could not if the guard attached that session.
    const withCookie = await botApi(key, identity.clientIp, { session });
    const members = await withCookie.get(`/api/v1/organisations/${team.organisationId}/members`);
    expect(members.status(), 'the bot is admitted on its own key').toBe(200);
    expect(((await members.json()) as { members: { userId: string }[] }).members.map(member => member.userId)).toEqual([team.owner.userId]);

    await addOrganisationMember(team.organisationId, outsider.userId);
    const stranger = await identity.contextFor(session);
    expect((await stranger.get(`/api/v1/organisations/${team.organisationId}/members`)).status(), 'and a member still reads it with a session').toBe(200);
  });

  test('should refuse a service route presented with no bearer token', async ({ identity }) => {
    const anonymous = await identity.anonymous();
    const refused = await anonymous.post('/api/v1/authz/check', { data: { principalType: 'USER', principalId: '1', organisationId: '1', action: 'x' } });
    expect(refused.status()).toBe(401);
    await expectErrorCode(refused, 'SEC_003');
  });
});
