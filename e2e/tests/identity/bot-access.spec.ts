/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  BOT_ACCESS_TOKEN_TTL_SECONDS,
  BOT_API_BUCKET,
  BOT_KEY_EXCHANGE_BUCKET,
  BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE,
  botKeySecretHash,
  clearIpState,
  copyClientSecret,
  exchangeBotKey,
  fetchJwks,
  findApplicationIdByName,
  findAuditEvents,
  forgeBotKey,
  identityDb,
  identityMutate,
  issueBotKey,
  type OAuthApplication,
  type OAuthClientCredentials,
  type OrganisationBot,
  parseBotKeyParts,
  PLATFORM_APPLICATION_NAME,
  readBotKeyRecord,
  readRateLimit,
  redisDel,
  registerOAuthClient,
  replaceBotPermissions,
  setApiResourceActive,
  spendRateLimit,
  suspendOrganisationBot,
  uniqueClientIp,
  updateBotKeyRecord,
  updateOrganisation,
  verifyJwt,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, teamMember, test } from './fixtures';
import { expectRefused } from './helpers';

/**
 * Defining types
 */

interface TokenBody {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  issued_token_type?: string;
}

/** The exchanging service: a first-party application, the confidential client identity provisions with it, and a cookie-less caller. */
interface Exchanger {
  application: OAuthApplication;
  client: OAuthClientCredentials;
  ctx: APIRequestContext;
}

/** One call a bot bearer makes, named for the failure message and deferred so a matrix walks it one request at a time. */
interface BotRoute {
  label: string;
  send(ctx: APIRequestContext): Promise<APIResponse>;
}

/** Which of identity's own bot roles a bot is given; the write level of a resource carries its read level too. */
interface BotRoles {
  members?: 'read' | 'write';
  invitations?: boolean;
  domains?: boolean;
}

/**
 * Declaring the constants
 *
 * The two ways a bot key reaches identity: exchanged at `/oauth2/token` by a first-party service for a five-minute bot
 * access token, and sent straight to identity's own organisation routes as `Authorization: Bearer sl_bot_…`. Every bot
 * caller here is cookie-less — a session cookie puts identity's CSRF guard in front of the bot guard, so each refusal
 * would come back as a CSRF failure rather than the decision under test.
 *
 * Addresses matter twice: the allowlist is checked against the `client_ip` a first-party exchanger forwards (the
 * connection address when it forwards none), and the general per-address budget is charged to that same forwarded value.
 * Forwarded addresses are therefore minted per test and their counters dropped afterwards, as the harness does for the
 * test's own connection address.
 */

const RATE_WINDOW_SECONDS = 60;

const GENERAL_LIMIT = 100;

const HOUR_MS = 60 * 60 * 1000;

const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/** Starts with `sl_bot_`, so the guard reads it as a bot credential, and parses as nothing. */
const MALFORMED_KEY = 'sl_bot_not-a-key-at-all';

const orgPath = (organisationId: string): string => `/api/v1/organisations/${organisationId}`;

const uniqueInvitee = (label: string): string => `e2e.botr.${label}.${randomBytes(4).toString('hex')}@shadow-apps.test`;

async function tokenBody(response: APIResponse): Promise<TokenBody> {
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as TokenBody;
}

async function exchangingApp(identity: IdentityHarness, label: string): Promise<Exchanger> {
  const application = await identity.createOAuthApp(label);
  return { application, client: application.serviceClient, ctx: await identity.anonymous() };
}

async function grantBotRoles(team: IdentityTeam, bot: OrganisationBot, roles: BotRoles): Promise<void> {
  const applicationId = await findApplicationIdByName(PLATFORM_APPLICATION_NAME);
  await replaceBotPermissions(team.ownerCtx, bot, [
    ...(roles.members ? [{ applicationId, resource: 'members', level: roles.members }] : []),
    ...(roles.invitations ? [{ applicationId, resource: 'invitations', level: 'write' as const }] : []),
    ...(roles.domains ? [{ applicationId, resource: 'domains', level: 'read' as const }] : []),
  ]);
}

/** Every organisation route that declares no bot permission, plus the elevated ones no bot may reach. */
function closedRoutes(organisationId: string, userId: string): BotRoute[] {
  const path = orgPath(organisationId);
  return [
    { label: 'organisation detail', send: ctx => ctx.get(path) },
    { label: 'organisation rename', send: ctx => ctx.patch(path, { data: { name: 'E2E Reached' } }) },
    { label: 'organisation deletion', send: ctx => ctx.delete(path) },
    { label: 'member role change', send: ctx => ctx.patch(`${path}/members/${userId}`, { data: { role: 'ADMIN' } }) },
    { label: 'member removal', send: ctx => ctx.delete(`${path}/members/${userId}`) },
    { label: 'application listing', send: ctx => ctx.get(`${path}/applications`) },
    { label: 'bot listing', send: ctx => ctx.get(`${path}/bots`) },
    { label: 'bot creation', send: ctx => ctx.post(`${path}/bots`, { data: { handle: 'e2e-reached', displayName: 'E2E Reached' } }) },
    { label: 'domain registration', send: ctx => ctx.post(`${path}/domains`, { data: { domain: 'e2e-reached.example.test' } }) },
    { label: 'own organisations', send: ctx => ctx.get('/api/v1/me/organisations') },
  ];
}

/** Puts a bot back the way `suspendOrganisationBot` found it; `resume` needs an active organisation, which some cases have taken away. */
async function reactivateBot(bot: OrganisationBot): Promise<void> {
  await identityDb()`UPDATE bots SET status = 'ACTIVE', suspended_at = NULL, suspended_by = NULL WHERE id = ${bot.botId}`;
  await identityDb()`UPDATE oauth_clients SET is_active = true WHERE id = ${bot.clientId}`;
}

test.describe('identity bot key exchange — the token a key buys', () => {
  test('should exchange a bot key for a five-minute bot token naming the bot, its organisation and its budget', async ({ identity }) => {
    const { application, client, ctx } = await exchangingApp(identity, 'botx-token');
    const team = await identity.createTeam({ label: 'botx-token' });
    const bot = await identity.createBot(team, { label: 'botx-token' });
    const key = await issueBotKey(team.ownerCtx, bot);

    const body = await tokenBody(await exchangeBotKey(ctx, client, { subjectToken: key.key }));
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: BOT_ACCESS_TOKEN_TTL_SECONDS, scope: '', issued_token_type: ACCESS_TOKEN_TYPE });
    expect(body.refresh_token, 'a bot never holds a refresh token').toBeUndefined();

    const claims = verifyJwt(body.access_token ?? '', await fetchJwks(ctx));
    expect(claims).toMatchObject({
      sub: bot.clientId,
      client_id: bot.clientId,
      token_type: 'bot',
      aud: application.audience,
      org: team.organisationId,
      bot_id: bot.botId,
      bot_key_id: key.keyId,
      rl: 600,
    });
    expect(claims, 'a bot token carries no scope').not.toHaveProperty('scope');
    expect(claims, 'no delegation').not.toHaveProperty('act');
    expect(claims, 'and no session').not.toHaveProperty('sid');
    // A failure here means the server's own BOT_ACCESS_TOKEN_TTL_SECONDS moved, or the lifetime became policy-driven like every other grant's.
    expect(Number(claims.exp) - Number(claims.iat), 'the lifetime is the fixed bot constant').toBe(BOT_ACCESS_TOKEN_TTL_SECONDS);
  });

  test("should accept only the exchanging client's own audience and no scope at all", async ({ identity }) => {
    const { application, client, ctx } = await exchangingApp(identity, 'botx-target');
    const neighbour = await identity.createOAuthApp('botx-target-other');
    const team = await identity.createTeam({ label: 'botx-target' });
    const bot = await identity.createBot(team, { label: 'botx-target' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const exchange = (request: { resource?: string; scope?: string }): Promise<APIResponse> => exchangeBotKey(ctx, client, { subjectToken: key.key, ...request });

    expect((await tokenBody(await exchange({ resource: application.audience }))).access_token, 'the client may name its own audience').toBeTruthy();
    for (const [label, resource] of [
      ["another application's audience", neighbour.audience],
      ['an audience nothing declares', 'api://e2e-nowhere'],
      ['the platform audience', 'shadow-identity'],
    ] as const) {
      await expectRefused(await exchange({ resource }), 400, 'invalid_target', label);
    }

    for (const scope of ['openid', 'profile offline_access']) {
      await expectRefused(await exchange({ scope }), 400, 'invalid_scope', `scope ${JSON.stringify(scope)}`);
    }
    expect((await exchange({ scope: '' })).status(), 'an empty scope parameter asks for nothing, which is what a bot gets').toBe(200);
  });
});

test.describe('identity bot key exchange — refusals', () => {
  test('should refuse every unusable key with a 400 invalid_grant and never a 401', async ({ identity }) => {
    const { client, ctx } = await exchangingApp(identity, 'botx-refuse');
    const team = await identity.createTeam({ label: 'botx-refuse' });
    const bot = await identity.createBot(team, { label: 'botx-refuse' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const spare = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-spare' });
    const exchange = (subjectToken: string): Promise<APIResponse> => exchangeBotKey(ctx, client, { subjectToken });

    for (const [label, subjectToken] of [
      ['a checksum that does not match the body', `${key.key.slice(0, -1)}${key.key.endsWith('a') ? 'b' : 'a'}`],
      ['a credential that is not a key at all', MALFORMED_KEY],
      ['a key id nothing was ever issued under', forgeBotKey(key.key, 'keyId')],
      ['the right key id and the wrong secret', forgeBotKey(key.key, 'secret')],
    ] as const) {
      await expectRefused(await exchange(subjectToken), 400, 'invalid_grant', label);
    }

    await updateBotKeyRecord(spare.keyId, { revokedAt: new Date() });
    await expectRefused(await exchange(spare.key), 400, 'invalid_grant', 'a revoked key');
    await updateBotKeyRecord(spare.keyId, { revokedAt: null, expiresAt: new Date(Date.now() - HOUR_MS) });
    await expectRefused(await exchange(spare.key), 400, 'invalid_grant', 'an expired key');

    await suspendOrganisationBot(team.ownerCtx, bot);
    await expectRefused(await exchange(key.key), 400, 'invalid_grant', 'a suspended bot');
    await reactivateBot(bot);
    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectRefused(await exchange(key.key), 400, 'invalid_grant', 'a suspended organisation');

    // Naming no key is a malformed request rather than a rejected grant; it is still a 400 and still never a 401.
    await expectRefused(await exchangeBotKey(ctx, client, {}), 400, 'invalid_request', 'no subject token');

    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect((await exchange(key.key)).status(), 'the live key of an active bot in an active organisation still exchanges').toBe(200);
  });

  test("should keep invalid_client for the exchanging client's own authentication and refuse other callers unauthorized_client", async ({ identity }) => {
    const { application, client, ctx } = await exchangingApp(identity, 'botx-client');
    const team = await identity.createTeam({ label: 'botx-client' });
    const bot = await identity.createBot(team, { label: 'botx-client' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const thirdParty = await registerOAuthClient((await identity.admin()).ctx, application, { kind: 'WEB_CONFIDENTIAL', isFirstParty: false, suffix: 'third' });

    await expectRefused(await exchangeBotKey(ctx, thirdParty, { subjectToken: key.key, clientIp: '203.0.113.9' }), 400, 'unauthorized_client', 'a third-party exchanging client');
    expect((await readBotKeyRecord(key.keyId))?.lastUsedAt, 'a client that may not exchange never reaches the key').toBeNull();
    expect(await findAuditEvents('bot.key.used', key.keyId), 'nor is a use audited for it').toEqual([]);

    await setApiResourceActive(application.audience, false);
    const withoutAudience = await exchangeBotKey(ctx, client, { subjectToken: key.key });
    await setApiResourceActive(application.audience, true);
    await expectRefused(withoutAudience, 400, 'unauthorized_client', 'a first-party client exposing no resource audience');

    const wrongSecret = { clientId: client.clientId, secret: 'e2e-wrong-secret' };
    await expectRefused(await exchangeBotKey(ctx, wrongSecret, { subjectToken: key.key }), 401, 'invalid_client', 'a wrong client secret');
    await expectRefused(await exchangeBotKey(ctx, { clientId: 'e2e-no-such-client' }, { subjectToken: key.key }), 401, 'invalid_client', 'an unknown client');

    await copyClientSecret(client.clientId, bot.clientId);
    const asBotClient = { clientId: bot.clientId, secret: client.secret };
    await expectRefused(await exchangeBotKey(ctx, asBotClient, { subjectToken: key.key }), 401, 'invalid_client', 'the bot client exchanging, with a secret that would verify');
    await expectRefused(
      await ctx.post('/oauth2/token', { form: { grant_type: 'client_credentials', client_id: bot.clientId, client_secret: client.secret ?? '' } }),
      401,
      'invalid_client',
      'the bot client authenticating for itself',
    );

    expect((await exchangeBotKey(ctx, client, { subjectToken: key.key })).status(), 'the first-party client the key was meant for still exchanges it').toBe(200);
  });

  test('should refuse a bot token as a subject token and at the userinfo endpoint', async ({ identity }) => {
    const { application, client, ctx } = await exchangingApp(identity, 'botx-reuse');
    const team = await identity.createTeam({ label: 'botx-reuse' });
    const bot = await identity.createBot(team, { label: 'botx-reuse' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const botToken = (await tokenBody(await exchangeBotKey(ctx, client, { subjectToken: key.key }))).access_token ?? '';

    await expectRefused(
      await exchangeBotKey(ctx, client, { subjectToken: botToken, subjectTokenType: ACCESS_TOKEN_TYPE, resource: application.audience }),
      400,
      'invalid_grant',
      'a bot token delegated onwards',
    );
    await expectRefused(await ctx.get('/oauth2/userinfo', { headers: { authorization: `Bearer ${botToken}` } }), 401, 'invalid_client', 'a bot token at userinfo');

    expect((await exchangeBotKey(ctx, client, { subjectToken: key.key })).status(), 'the key it came from still buys a fresh one').toBe(200);
  });
});

test.describe('identity bot key exchange — the caller address and the budgets', () => {
  test('should check the allowlist against the address a first-party client forwards', async ({ identity }) => {
    const { client, ctx } = await exchangingApp(identity, 'botx-allow');
    const team = await identity.createTeam({ label: 'botx-allow' });
    const allowed = uniqueClientIp();
    const refused = uniqueClientIp();
    const fenced = await identity.createBot(team, { label: 'botx-allow', ipAllowlist: [`${allowed}/32`] });
    const open = await identity.createBot(team, { label: 'botx-open' });
    const fencedKey = await issueBotKey(team.ownerCtx, fenced);
    const openKey = await issueBotKey(team.ownerCtx, open);
    const exchange = (subjectToken: string, clientIp?: string): Promise<APIResponse> => exchangeBotKey(ctx, client, { subjectToken, clientIp });

    try {
      expect((await exchange(fencedKey.key, allowed)).status(), 'the forwarded address is inside the allowlist').toBe(200);
      expect((await exchange(fencedKey.key, `::ffff:${allowed}`)).status(), 'an IPv4-mapped IPv6 address normalises to the same one').toBe(200);
      await expectRefused(await exchange(fencedKey.key, refused), 400, 'invalid_grant', 'a forwarded address outside the allowlist');
      await expectRefused(await exchange(fencedKey.key, 'not-an-address'), 400, 'invalid_grant', 'a forwarded address that does not parse');
      await expectRefused(await exchange(fencedKey.key), 400, 'invalid_grant', "no forwarded address, so the exchanger's own connection address is checked");

      for (const [label, clientIp] of [
        ['a forwarded address', refused],
        ['an unparseable forwarded address', 'not-an-address'],
        ['no forwarded address at all', undefined],
      ] as const) {
        expect((await exchange(openKey.key, clientIp)).status(), `an empty allowlist accepts ${label}`).toBe(200);
      }
    } finally {
      await clearIpState(allowed);
      await clearIpState(refused);
    }
  });

  test('should stop a key at sixty exchanges a minute and charge the general budget to the forwarded caller', async ({ identity }) => {
    const { client, ctx } = await exchangingApp(identity, 'botx-budget');
    const team = await identity.createTeam({ label: 'botx-budget' });
    const bot = await identity.createBot(team, { label: 'botx-budget' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const spent = uniqueClientIp();
    const fresh = uniqueClientIp();
    const exchange = (clientIp: string): Promise<APIResponse> => exchangeBotKey(ctx, client, { subjectToken: key.key, clientIp });
    const retryAfter = (response: APIResponse): number => Number(response.headers()['retry-after']);

    try {
      // Pre-spending the window rather than sending sixty exchanges: `enforce` increments, so the next call is the sixty-first.
      // A failure here means the server's own BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE moved, or the quota stopped being per key.
      await spendRateLimit(BOT_KEY_EXCHANGE_BUCKET, key.keyId, BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE, RATE_WINDOW_SECONDS);
      const overKeyBudget = await exchange(fresh);
      await expectRefused(overKeyBudget, 429, 'RATE_LIMITED', 'the sixty-first exchange of one key inside a minute');
      expect(retryAfter(overKeyBudget), 'the refusal says how much of the window is left').toBeGreaterThan(0);
      expect(retryAfter(overKeyBudget)).toBeLessThanOrEqual(RATE_WINDOW_SECONDS);
      expect((await findAuditEvents('bot.key.exchange_denied', key.keyId))[0]?.detail, 'and the quota refusal is audited as one').toMatchObject({ reason: 'rate_limited' });

      await redisDel(`rl:${BOT_KEY_EXCHANGE_BUCKET}:${key.keyId}`);
      expect((await exchange(fresh)).status(), 'the next window lets the key through again').toBe(200);

      await spendRateLimit('ip-general', spent, GENERAL_LIMIT, RATE_WINDOW_SECONDS);
      const overIpBudget = await exchange(spent);
      await expectRefused(overIpBudget, 429, 'RATE_LIMITED', 'a forwarded address that has spent the general budget');
      expect(retryAfter(overIpBudget)).toBeGreaterThan(0);
      expect(retryAfter(overIpBudget)).toBeLessThanOrEqual(RATE_WINDOW_SECONDS);
      expect((await exchange(fresh)).status(), 'the budget belongs to the forwarded address, not to the exchanging service').toBe(200);
    } finally {
      await redisDel(`rl:${BOT_KEY_EXCHANGE_BUCKET}:${key.keyId}`);
      await clearIpState(spent);
      await clearIpState(fresh);
    }
  });

  test('should stamp a key at most once a minute, audit one use an hour and one denial per reason, and never the key itself', async ({ identity }) => {
    const { client, ctx } = await exchangingApp(identity, 'botx-record');
    const team = await identity.createTeam({ label: 'botx-record' });
    const allowed = uniqueClientIp();
    const refused = uniqueClientIp();
    const bot = await identity.createBot(team, { label: 'botx-record', ipAllowlist: [`${allowed}/32`] });
    const key = await issueBotKey(team.ownerCtx, bot);
    const exchange = (clientIp: string): Promise<APIResponse> => exchangeBotKey(ctx, client, { subjectToken: key.key, clientIp });

    try {
      expect((await exchange(allowed)).status()).toBe(200);
      const first = await readBotKeyRecord(key.keyId);
      expect(first?.lastUsedAt, 'the first use is stamped').toBeInstanceOf(Date);
      expect(first?.lastUsedIp, 'together with the address it was presented from').toBe(`${allowed}/32`);

      expect((await exchange(allowed)).status()).toBe(200);
      expect((await readBotKeyRecord(key.keyId))?.lastUsedAt, 'a second use inside the minute does not rewrite the stamp').toEqual(first?.lastUsedAt);
      await updateBotKeyRecord(key.keyId, { lastUsedAt: new Date(Date.now() - 2 * 60_000) });
      expect((await exchange(allowed)).status()).toBe(200);
      expect(Number((await readBotKeyRecord(key.keyId))?.lastUsedAt), 'a use a minute later does').toBeGreaterThan(Number(first?.lastUsedAt));

      const used = await findAuditEvents('bot.key.used', key.keyId);
      expect(used, 'three exchanges in the same hour are audited once').toHaveLength(1);
      expect(used[0]).toMatchObject({
        outcome: 'SUCCESS',
        actorType: 'SERVICE_ACCOUNT',
        actorId: bot.clientId,
        organisationId: team.organisationId,
        targetType: 'bot_key',
        detail: { botId: bot.botId, purpose: 'exchange' },
      });

      await expectRefused(await exchange(refused), 400, 'invalid_grant');
      await expectRefused(await exchange(refused), 400, 'invalid_grant');
      const denied = await findAuditEvents('bot.key.exchange_denied', key.keyId);
      expect(denied, 'two refusals for the same reason inside five minutes are audited once').toHaveLength(1);
      expect(denied[0]).toMatchObject({ outcome: 'DENIED', actorType: 'SERVICE_ACCOUNT', actorId: bot.clientId, detail: { reason: 'ip_not_allowed' } });

      const secret = parseBotKeyParts(key.key)?.secret ?? '';
      const stored = await readBotKeyRecord(key.keyId);
      expect(botKeySecretHash(secret), 'the hash searched for below is the one identity stores').toBe(stored?.secretHash);
      const [carried] = await identityDb()<{ count: number }[]>`
        SELECT count(*)::int AS count FROM audit_events WHERE detail::text LIKE ${`%${secret}%`} OR detail::text LIKE ${`%${stored?.secretHash ?? key.key}%`}
      `;
      expect(carried?.count, 'and no audit row anywhere carries the secret or that hash').toBe(0);
    } finally {
      await clearIpState(allowed);
      await clearIpState(refused);
    }
  });
});

test.describe('identity bot bearer on organisation routes', () => {
  test('should admit a bot only on the routes the role it was granted carries', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botr-grant' });
    const member = await teamMember(identity, team, 'botr-grant', 'MEMBER');
    const reader = await identity.createBot(team, { label: 'botr-reader' });
    const manager = await identity.createBot(team, { label: 'botr-manager' });
    await grantBotRoles(team, reader, { members: 'read' });
    await grantBotRoles(team, manager, { members: 'write', invitations: true, domains: true });
    const readerCtx = await identity.botCaller((await issueBotKey(team.ownerCtx, reader)).key);
    const managerCtx = await identity.botCaller((await issueBotKey(team.ownerCtx, manager)).key);
    const path = orgPath(team.organisationId);
    const invitee = uniqueInvitee('grant');

    expect((await readerCtx.get(`${path}/members`)).status(), 'a members reader lists members').toBe(200);
    await expectRefused(await readerCtx.patch(`${path}/members/${member.user.userId}/status`, { data: { status: 'SUSPENDED' } }), 403, 'ORG_007', 'a members reader suspending');
    await expectRefused(await readerCtx.get(`${path}/invitations`), 403, 'ORG_007', 'a members reader listing invitations');
    await expectRefused(await readerCtx.get(`${path}/domains`), 403, 'ORG_007', 'a members reader listing domains');

    for (const route of [
      { label: 'member list', send: (): Promise<APIResponse> => managerCtx.get(`${path}/members`) },
      { label: 'domain list', send: (): Promise<APIResponse> => managerCtx.get(`${path}/domains`) },
      { label: 'invitation list', send: (): Promise<APIResponse> => managerCtx.get(`${path}/invitations`) },
      { label: 'invitation', send: (): Promise<APIResponse> => managerCtx.post(`${path}/invitations`, { data: { email: invitee, role: 'MEMBER' } }) },
      { label: 'member suspension', send: (): Promise<APIResponse> => managerCtx.patch(`${path}/members/${member.user.userId}/status`, { data: { status: 'SUSPENDED' } }) },
    ]) {
      const response = await route.send();
      expect(response.status(), `${route.label} — ${await response.text()}`).toBe(200);
    }

    const actors = await identityDb()<{ action: string; actorType: string; actorId: string }[]>`
      SELECT action, actor_type::text AS "actorType", actor_id AS "actorId" FROM audit_events
      WHERE organisation_id = ${team.organisationId} AND action IN ('org.invitation_sent', 'org.member_suspended') ORDER BY id
    `;
    expect(actors, "the bot's own writes are attributed to its service account").toEqual([
      { action: 'org.invitation_sent', actorType: 'SERVICE_ACCOUNT', actorId: manager.clientId },
      { action: 'org.member_suspended', actorType: 'SERVICE_ACCOUNT', actorId: manager.clientId },
    ]);
    expect(
      (await identityDb()<{ invitedBy: string | null }[]>`SELECT invited_by AS "invitedBy" FROM organisation_invitations WHERE email = ${invitee}`)[0]?.invitedBy,
      'an invitation a bot sent names no inviting person',
    ).toBeNull();

    const listed = await (await readerCtx.get(`${path}/members`)).text();
    expect(listed, 'the list every member and members-read bot can call carries no global account signal').not.toContain('accountActive');
  });

  test('should hold a bot to member invitations and to members below an administrator', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botr-limit' });
    const member = await teamMember(identity, team, 'botr-limit-m', 'MEMBER');
    const admin = await teamMember(identity, team, 'botr-limit-a', 'ADMIN');
    const bot = await identity.createBot(team, { label: 'botr-limit' });
    await grantBotRoles(team, bot, { members: 'write', invitations: true });
    const botCtx = await identity.botCaller((await issueBotKey(team.ownerCtx, bot)).key);
    const path = orgPath(team.organisationId);
    const invitee = uniqueInvitee('limit');
    const promoted = uniqueInvitee('promote');

    expect((await botCtx.post(`${path}/invitations`, { data: { email: invitee, role: 'MEMBER' } })).status(), 'a bot invites members').toBe(200);
    await expectRefused(await botCtx.post(`${path}/invitations`, { data: { email: invitee, role: 'ADMIN' } }), 403, 'ORG_007', 'a bot inviting an administrator');
    expect((await botCtx.post(`${path}/invitations`, { data: { email: invitee, role: 'OWNER' } })).status(), 'a bot inviting an owner, which no caller may send').toBe(422);

    expect((await identityMutate(team.ownerCtx, 'post', `${path}/invitations`, { email: promoted, role: 'ADMIN' })).status()).toBe(200);
    const pending = (await (await botCtx.get(`${path}/invitations`)).json()) as { invitations: { id: string; role: string }[] };
    const adminInvitation = pending.invitations.find(item => item.role === 'ADMIN');
    await expectRefused(await botCtx.delete(`${path}/invitations/${adminInvitation?.id}`), 403, 'ORG_007', "a bot revoking an administrator's invitation");
    await expectRefused(await botCtx.post(`${path}/invitations`, { data: { email: promoted, role: 'MEMBER' } }), 403, 'ORG_007', 'a bot replacing it with one of its own');
    expect(
      await identityDb()<{ role: string; revokedAt: Date | null }[]>`SELECT role, revoked_at AS "revokedAt" FROM organisation_invitations WHERE email = ${promoted}`,
      'the invitation it may not touch is untouched',
    ).toEqual([{ role: 'ADMIN', revokedAt: null }]);

    for (const [label, userId] of [
      ['an owner', team.owner.userId],
      ['an administrator', admin.user.userId],
    ] as const) {
      await expectRefused(await botCtx.patch(`${path}/members/${userId}/status`, { data: { status: 'SUSPENDED' } }), 403, 'ORG_007', `a bot suspending ${label}`);
    }
    expect((await botCtx.patch(`${path}/members/${member.user.userId}/status`, { data: { status: 'SUSPENDED' } })).status(), 'a plain member it may suspend').toBe(200);
  });

  test('should refuse a bot every route that declares no bot permission, without spending its quota or touching its key', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botr-closed' });
    const member = await teamMember(identity, team, 'botr-closed', 'MEMBER');
    const bot = await identity.createBot(team, { label: 'botr-closed' });
    await grantBotRoles(team, bot, { members: 'read' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const botCtx = await identity.botCaller(key.key);
    const malformedCtx = await identity.botCaller(MALFORMED_KEY);

    for (const route of closedRoutes(team.organisationId, member.user.userId)) {
      await expectRefused(await route.send(botCtx), 403, 'ORG_007', `${route.label} with a live key`);
      await expectRefused(await route.send(malformedCtx), 403, 'ORG_007', `${route.label} with a credential that is not a key`);
    }

    expect(await readRateLimit(BOT_API_BUCKET, bot.botId), 'a route that admits no bot spends none of the bot budget').toBe(0);
    expect((await readBotKeyRecord(key.keyId))?.lastUsedAt, 'nor is the key stamped by one').toBeNull();
    expect(await findAuditEvents('bot.key.used', key.keyId), 'nor is a use audited').toEqual([]);

    expect((await botCtx.get(`${orgPath(team.organisationId)}/members`)).status(), 'the route it does hold a permission for still answers').toBe(200);
    expect((await readBotKeyRecord(key.keyId))?.lastUsedAt, 'and that one does stamp the key').toBeInstanceOf(Date);
  });

  test('should refuse a bot another organisation and every unusable credential', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botr-deny' });
    const neighbour = await identity.createTeam({ label: 'botr-deny-other' });
    const bot = await identity.createBot(team, { label: 'botr-deny' });
    await grantBotRoles(team, bot, { members: 'read' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const spare = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-spare' });
    const members = `${orgPath(team.organisationId)}/members`;
    const ownCtx = await identity.botCaller(key.key);

    await expectRefused(await ownCtx.get(`${orgPath(neighbour.organisationId)}/members`), 403, 'ORG_001', "a bot on another organisation's route");

    const refusal = async (label: string, credential: string): Promise<void> => {
      await expectRefused(await (await identity.botCaller(credential)).get(members), 401, 'AUTH_005', label);
    };
    await refusal('a malformed key', MALFORMED_KEY);
    await refusal('a key id nothing was issued under', forgeBotKey(key.key, 'keyId'));
    await updateBotKeyRecord(spare.keyId, { revokedAt: new Date() });
    await refusal('a revoked key', spare.key);

    const fenced = await identity.createBot(team, { label: 'botr-deny-ip', ipAllowlist: [`${uniqueClientIp()}/32`] });
    await grantBotRoles(team, fenced, { members: 'read' });
    await refusal('a connection address outside the allowlist', (await issueBotKey(team.ownerCtx, fenced)).key);

    await suspendOrganisationBot(team.ownerCtx, bot);
    await expectRefused(await ownCtx.get(members), 401, 'AUTH_005', 'a suspended bot');
    await reactivateBot(bot);
    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectRefused(await ownCtx.get(members), 401, 'AUTH_005', 'an organisation that is not active');

    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect((await ownCtx.get(members)).status(), 'the live key of an active bot still reaches its own organisation').toBe(200);
  });

  test('should stop a bot at its own request budget while humans keep their ordinary checks', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'botr-budget' });
    const member = await teamMember(identity, team, 'botr-budget-m', 'MEMBER');
    const admin = await teamMember(identity, team, 'botr-budget-a', 'ADMIN');
    const outsider = await identity.createUser({ label: 'botr-budget-out' });
    const outsiderCtx = (await identity.signIn(outsider)).ctx;
    const bot = await identity.createBot(team, { label: 'botr-budget' });
    await grantBotRoles(team, bot, { members: 'read' });
    const botCtx = await identity.botCaller((await issueBotKey(team.ownerCtx, bot)).key);
    const path = orgPath(team.organisationId);

    try {
      await spendRateLimit(BOT_API_BUCKET, bot.botId, 600, RATE_WINDOW_SECONDS);
      const refused = await botCtx.get(`${path}/members`);
      await expectRefused(refused, 429, 'RATE_LIMITED', 'a bot past its own request budget');
      expect(Number(refused.headers()['retry-after'])).toBeGreaterThan(0);
      expect(Number(refused.headers()['retry-after'])).toBeLessThanOrEqual(RATE_WINDOW_SECONDS);
      await redisDel(`rl:${BOT_API_BUCKET}:${bot.botId}`);
      expect((await botCtx.get(`${path}/members`)).status(), 'the next window lets it through again').toBe(200);
    } finally {
      await redisDel(`rl:${BOT_API_BUCKET}:${bot.botId}`);
    }

    expect((await member.ctx.get(`${path}/members`)).status(), 'a member reads the member list a bot can read').toBe(200);
    await expectRefused(
      await identityMutate(member.ctx, 'patch', `${path}/members/${admin.user.userId}/status`, { status: 'SUSPENDED' }),
      403,
      'ORG_007',
      "a member changing an administrator's status",
    );
    await expectRefused(await member.ctx.get(`${path}/invitations`), 403, 'ORG_007', 'a member listing invitations');
    expect((await admin.ctx.get(`${path}/invitations`)).status(), 'an administrator lists them').toBe(200);
    await expectRefused(await outsiderCtx.get(`${path}/members`), 403, 'ORG_001', 'a person who is not a member at all');
  });
});
