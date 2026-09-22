/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  auditChain,
  botKeySecretHash,
  csrfHeaders,
  findApplicationIdByName,
  findAuditEvents,
  IDENTITY_CSRF_SEED_PATH,
  identityMutate,
  type IdentityUser,
  issueBotKey,
  type OrganisationBot,
  type OrganisationRole,
  parseBotKeyParts,
  PLATFORM_APPLICATION_NAME,
  readBotClient,
  readBotKeyRecord,
  readOrganisationBot,
  resumeOrganisationBot,
  setOrganisationBotStatus,
  suspendOrganisationBot,
  updateBotKeyRecord,
  updateOrganisation,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface BotUserItem {
  id: string;
  displayName?: string;
}

interface BotItem {
  id: string;
  clientId: string;
  handle: string;
  displayName: string;
  description?: string;
  status: string;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  activeKeyCount: number;
  lastUsedAt?: string;
  lastUsedIp?: string;
  nextKeyExpiresAt?: string;
  createdBy?: BotUserItem;
  suspendedAt?: string;
  suspendedBy?: BotUserItem;
}

interface BotListing {
  bots: BotItem[];
  usage: { count: number; limit: number };
}

interface BotKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  expiresAt: string;
  revokedAt?: string;
  revokedBy?: BotUserItem;
}

interface CreatedBotKey extends BotKeyItem {
  key: string;
}

interface BotActivityItem {
  id: string;
  action: string;
  outcome: string;
  actorType: string;
  actor?: BotUserItem;
  keyId?: string;
  keyName?: string;
  ip?: string;
  detail?: { fields?: string[]; added?: string[]; removed?: string[] };
}

interface BotActivityPage {
  events: BotActivityItem[];
  nextCursor?: string;
}

/** One call on the bot API, named for the failure message and deferred so a matrix can be walked one request at a time. */
interface BotRoute {
  label: string;
  mutation: boolean;
  send(): Promise<APIResponse>;
}

/**
 * Declaring the constants
 *
 * The guard rails around the organisation-bot API, whose happy path `cross-app/org-bots.spec.ts` already walks: who may
 * reach it, what each status refuses, and what creation, keys and the activity feed record. Every mutation needs an
 * organisation admin on a self-service-elevated session, so the harness owner drives them and each refusal group ends
 * with the legitimate call it must not have closed. Requests are sent one at a time rather than in parallel: identity's
 * CSRF token is reissued by the GET that seeds it, so concurrent mutations would refuse each other on a stale token —
 * the two tests that genuinely need concurrency take the header once and reuse it.
 *
 * A bot's OAuth client is `ON DELETE restrict` and its service-account role assignments hang off that client rather
 * than the bot, so neither goes with the organisation; the harness removes all three for every bot it hands out.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Bot ids are a bigserial; nothing in a dev database reaches this, so it stands in for a bot that never existed. */
const MISSING_BOT_ID = '999999999999';

const botsPath = (organisationId: string): string => `/api/v1/organisations/${organisationId}/bots`;

const botPath = (organisationId: string, botId: string): string => `${botsPath(organisationId)}/${botId}`;

const keyExpiry = (msAhead = HOUR_MS): string => new Date(Date.now() + msAhead).toISOString();

function uniqueHandle(label: string): string {
  return `e2e-${label}-${randomBytes(3).toString('hex')}`;
}

async function expectRefused(response: APIResponse, status: number, code: string, message?: string): Promise<void> {
  expect(response.status(), message ?? (await response.text())).toBe(status);
  await expectErrorCode(response, code);
}

/** Reads a successful creation and hands the bot to the harness, whose client and grants no organisation cascade reaches. */
async function trackCreated(identity: IdentityHarness, organisationId: string, response: APIResponse): Promise<BotItem> {
  expect(response.status(), await response.text()).toBe(201);
  const bot = (await response.json()) as BotItem;
  identity.trackBot({ botId: bot.id, clientId: bot.clientId, handle: bot.handle, organisationId });
  return bot;
}

async function teamMember(identity: IdentityHarness, team: IdentityTeam, label: string, role: OrganisationRole): Promise<{ user: IdentityUser; ctx: APIRequestContext }> {
  const user = await identity.createUser({ label });
  await addOrganisationMember(team.organisationId, user.userId, { role });
  const { ctx } = await identity.signIn(user, { aal: 'AAL2' });
  return { user, ctx };
}

function createBot(ctx: APIRequestContext, organisationId: string, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'post', botsPath(organisationId), { handle: uniqueHandle('bot'), displayName: 'E2E Bot', ...body });
}

async function listBots(ctx: APIRequestContext, organisationId: string): Promise<BotListing> {
  const response = await ctx.get(botsPath(organisationId));
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as BotListing;
}

async function botDetail(ctx: APIRequestContext, organisationId: string, botId: string): Promise<BotItem> {
  const response = await ctx.get(botPath(organisationId, botId));
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as BotItem;
}

function patchBot(ctx: APIRequestContext, bot: OrganisationBot, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(ctx, 'patch', botPath(bot.organisationId, bot.botId), body);
}

function createKey(ctx: APIRequestContext, bot: OrganisationBot, body: Record<string, unknown> = {}): Promise<APIResponse> {
  return identityMutate(ctx, 'post', `${botPath(bot.organisationId, bot.botId)}/keys`, { name: 'e2e-runner', expiresAt: keyExpiry(), ...body });
}

function revokeKey(ctx: APIRequestContext, bot: OrganisationBot, keyId: string): Promise<APIResponse> {
  return identityMutate(ctx, 'delete', `${botPath(bot.organisationId, bot.botId)}/keys/${keyId}`);
}

async function listKeys(ctx: APIRequestContext, bot: OrganisationBot): Promise<BotKeyItem[]> {
  const response = await ctx.get(`${botPath(bot.organisationId, bot.botId)}/keys`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { keys: BotKeyItem[] }).keys;
}

async function activity(ctx: APIRequestContext, bot: OrganisationBot, query = ''): Promise<BotActivityPage> {
  const response = await ctx.get(`${botPath(bot.organisationId, bot.botId)}/activity${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as BotActivityPage;
}

/** Every route of one bot, so a refusal matrix covers the whole surface instead of a chosen corner of it. */
function botRoutes(ctx: APIRequestContext, organisationId: string, botId: string, target: { keyId: string; handle: string; recipientUserId: string }): BotRoute[] {
  const path = botPath(organisationId, botId);
  return [
    { label: 'detail', mutation: false, send: () => ctx.get(path) },
    { label: 'key list', mutation: false, send: () => ctx.get(`${path}/keys`) },
    { label: 'activity', mutation: false, send: () => ctx.get(`${path}/activity`) },
    { label: 'permissions', mutation: false, send: () => ctx.get(`${path}/permissions`) },
    { label: 'ownership', mutation: false, send: () => ctx.get(`${path}/ownership`) },
    { label: 'update', mutation: true, send: () => identityMutate(ctx, 'patch', path, { displayName: 'E2E Reached' }) },
    { label: 'suspend', mutation: true, send: () => identityMutate(ctx, 'post', `${path}/suspend`) },
    { label: 'resume', mutation: true, send: () => identityMutate(ctx, 'post', `${path}/resume`) },
    { label: 'key creation', mutation: true, send: () => identityMutate(ctx, 'post', `${path}/keys`, { name: 'e2e-reached', expiresAt: keyExpiry() }) },
    { label: 'key revocation', mutation: true, send: () => identityMutate(ctx, 'delete', `${path}/keys/${target.keyId}`) },
    { label: 'permission replacement', mutation: true, send: () => identityMutate(ctx, 'put', `${path}/permissions`, { grants: [] }) },
    { label: 'ownership retry', mutation: true, send: () => identityMutate(ctx, 'post', `${path}/ownership/retry`) },
    { label: 'deletion', mutation: true, send: () => identityMutate(ctx, 'delete', path, { transferToUserId: target.recipientUserId, confirmHandle: target.handle }) },
  ];
}

test.describe('identity organisation bots — access and status guards', () => {
  test('should refuse a plain member the bot list and creation while its admin keeps both', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-member' });
    const member = await teamMember(identity, team, 'bot-member', 'MEMBER');

    await expectRefused(await member.ctx.get(botsPath(team.organisationId)), 403, 'ORG_007', 'a plain member listing bots');
    await expectRefused(await createBot(member.ctx, team.organisationId, {}), 403, 'ORG_007', 'a plain member creating a bot');

    const bot = await identity.createBot(team, { label: 'bot-member' });
    expect(
      (await listBots(team.ownerCtx, team.organisationId)).bots.map(item => item.id),
      'the organisation admin still lists and creates',
    ).toEqual([bot.botId]);
  });

  test('should hold every bot mutation to a stepped-up admin while the reads stay open', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-aal1' });
    const bot = await identity.createBot(team, { label: 'bot-aal1' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const unelevated = (await identity.signIn(team.owner)).ctx;
    const routes = botRoutes(unelevated, team.organisationId, bot.botId, { keyId: key.keyId, handle: bot.handle, recipientUserId: team.owner.userId });

    await expectRefused(await createBot(unelevated, team.organisationId, {}), 403, 'AUTH_006', 'creating a bot without a step-up');
    for (const route of routes.filter(item => item.mutation)) {
      await expectRefused(await route.send(), 403, 'AUTH_006', `${route.label} without a step-up`);
    }
    for (const route of routes.filter(item => !item.mutation)) {
      expect((await route.send()).status(), `${route.label} needs no step-up`).toBe(200);
    }
    expect((await unelevated.get(botsPath(team.organisationId))).status(), 'the bot list needs no step-up').toBe(200);

    expect(await readOrganisationBot(bot.botId)).toMatchObject({ status: 'ACTIVE', displayName: 'E2E Bot' });
    expect((await readBotKeyRecord(key.keyId))?.revokedAt, 'no refused mutation revoked the key').toBeNull();
    const renamed = await patchBot(team.ownerCtx, bot, { displayName: 'E2E Stepped Up' });
    expect(renamed.status(), 'the same admin with a step-up still administers the bot').toBe(200);
  });

  test("should answer for another organisation's bot exactly as for one that never existed, and change nothing", async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-tenant' });
    const neighbour = await identity.createTeam({ label: 'bot-neighbour' });
    const bot = await identity.createBot(team, { label: 'bot-tenant' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const target = { keyId: key.keyId, handle: bot.handle, recipientUserId: neighbour.owner.userId };

    for (const [label, botId] of [
      ["another organisation's bot", bot.botId],
      ['a bot that never existed', MISSING_BOT_ID],
    ] as const) {
      for (const route of botRoutes(neighbour.ownerCtx, neighbour.organisationId, botId, target)) {
        await expectRefused(await route.send(), 404, 'BOT_009', `${route.label} on ${label}`);
      }
    }

    expect(await readOrganisationBot(bot.botId)).toMatchObject({ status: 'ACTIVE', displayName: 'E2E Bot' });
    expect((await readBotKeyRecord(key.keyId))?.revokedAt, 'the neighbour never reached the key').toBeNull();
    expect((await botDetail(team.ownerCtx, team.organisationId, bot.botId)).handle, 'its own organisation still reaches it').toBe(bot.handle);
  });

  test('should create bots only in an active team organisation', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-scope' });

    await expectRefused(await createBot(team.ownerCtx, team.owner.personalOrgId, {}), 409, 'ORG_003', 'a personal workspace holds no bots');

    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });
    await expectRefused(await createBot(team.ownerCtx, team.organisationId, {}), 404, 'ORG_002', 'a suspended organisation');

    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    const created = await createBot(team.ownerCtx, team.organisationId, {});
    expect(created.status(), 'a reinstated organisation creates bots again').toBe(201);
    await trackCreated(identity, team.organisationId, created);
  });

  test('should refuse a deleting bot every change and a suspended bot a new key while its keys stay revocable', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-status' });
    const bot = await identity.createBot(team, { label: 'bot-status' });
    const key = await issueBotKey(team.ownerCtx, bot);

    await suspendOrganisationBot(team.ownerCtx, bot);
    await expectRefused(await createKey(team.ownerCtx, bot), 409, 'BOT_010', 'a key for a suspended bot');
    expect((await revokeKey(team.ownerCtx, bot, key.keyId)).status(), "a suspended bot's keys stay revocable").toBe(200);
    expect((await listKeys(team.ownerCtx, bot))[0]?.status, 'the revocation landed').toBe('REVOKED');

    await resumeOrganisationBot(team.ownerCtx, bot);
    expect((await createKey(team.ownerCtx, bot)).status(), 'a resumed bot is issued keys again').toBe(201);

    await setOrganisationBotStatus(bot.botId, 'DELETING');
    await expectRefused(await patchBot(team.ownerCtx, bot, {}), 409, 'BOT_010', 'an empty patch of a deleting bot');
    await expectRefused(await patchBot(team.ownerCtx, bot, { displayName: 'E2E Deleting' }), 409, 'BOT_010', 'renaming a deleting bot');
    expect((await readOrganisationBot(bot.botId))?.displayName, 'the refused patch changed nothing').toBe('E2E Bot');
  });

  test('should keep a suspended organisation able to suspend and revoke but refuse changes, keys and resume', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-susporg' });
    const bot = await identity.createBot(team, { label: 'bot-susporg' });
    const key = await issueBotKey(team.ownerCtx, bot);
    await updateOrganisation(team.organisationId, { status: 'SUSPENDED' });

    await expectRefused(await createKey(team.ownerCtx, bot), 409, 'BOT_013', 'a key in a suspended organisation');
    await expectRefused(await patchBot(team.ownerCtx, bot, { displayName: 'E2E Suspended Org' }), 409, 'BOT_013', 'a patch in a suspended organisation');
    expect((await identityMutate(team.ownerCtx, 'post', `${botPath(team.organisationId, bot.botId)}/suspend`)).status(), 'suspending stays available').toBe(200);
    expect((await revokeKey(team.ownerCtx, bot, key.keyId)).status(), 'key revocation stays available').toBe(200);
    await expectRefused(await identityMutate(team.ownerCtx, 'post', `${botPath(team.organisationId, bot.botId)}/resume`), 409, 'BOT_013', 'resuming in a suspended organisation');

    await updateOrganisation(team.organisationId, { status: 'ACTIVE' });
    expect((await identityMutate(team.ownerCtx, 'post', `${botPath(team.organisationId, bot.botId)}/resume`)).status(), 'a reinstated organisation resumes its bot').toBe(200);
    expect((await readOrganisationBot(bot.botId))?.status).toBe('ACTIVE');
  });
});

test.describe('identity organisation bots — creation, limits and listing', () => {
  test('should back a new bot with a secretless service client of the organisation and audit the creation', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-create' });
    const handle = uniqueHandle('create');
    const bot = await trackCreated(identity, team.organisationId, await createBot(team.ownerCtx, team.organisationId, { handle, displayName: 'E2E Release Notes' }));

    expect(bot).toMatchObject({
      handle,
      displayName: 'E2E Release Notes',
      status: 'ACTIVE',
      ipAllowlist: [],
      rateLimitPerMinute: 600,
      activeKeyCount: 0,
      createdBy: { id: team.owner.userId, displayName: 'E2E Factory' },
    });
    expect(bot.clientId).toMatch(/^bot_[0-9A-Za-z]{22}$/);
    expect(await readBotClient(bot.clientId)).toEqual({
      applicationId: await findApplicationIdByName(PLATFORM_APPLICATION_NAME),
      name: `${handle}[bot]`,
      kind: 'SERVICE',
      isFirstParty: false,
      grantTypes: [],
      organisationId: team.organisationId,
      isActive: true,
      secretCount: 0,
    });

    const audited = await findAuditEvents('bot.created', bot.id);
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({ outcome: 'SUCCESS', actorType: 'USER', actorId: team.owner.userId, organisationId: team.organisationId, targetType: 'bot' });
  });

  test('should cap an organisation at twenty-five live bots and free a slot only once one is deleted', async ({ identity }) => {
    test.setTimeout(60_000);
    const team = await identity.createTeam({ label: 'bot-limit' });
    const seeded = await identity.seedBots(team, 24, { label: 'bot-limit' });

    const headers = await csrfHeaders(team.ownerCtx, IDENTITY_CSRF_SEED_PATH);
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () => team.ownerCtx.post(botsPath(team.organisationId), { headers, data: { handle: uniqueHandle('race'), displayName: 'E2E Race' } })),
    );
    for (const response of concurrent.filter(item => item.status() === 201)) await trackCreated(identity, team.organisationId, response);
    expect(concurrent.map(response => response.status()).sort(), 'three creates racing for the last slot leave exactly one winner').toEqual([201, 409, 409]);
    for (const refused of concurrent.filter(item => item.status() === 409)) await expectErrorCode(refused, 'BOT_001');
    expect((await listBots(team.ownerCtx, team.organisationId)).usage).toEqual({ count: 25, limit: 25 });

    await expectRefused(await createBot(team.ownerCtx, team.organisationId, {}), 409, 'BOT_001', 'the twenty-sixth bot');

    const tombstone = seeded[0] as OrganisationBot;
    await setOrganisationBotStatus(tombstone.botId, 'DELETED');
    const listing = await listBots(team.ownerCtx, team.organisationId);
    expect(listing.usage.count, 'a deleted bot counts towards nothing').toBe(24);
    expect(
      listing.bots.map(item => item.id),
      'nor is it listed',
    ).not.toContain(tombstone.botId);

    const replacement = await createBot(team.ownerCtx, team.organisationId, {});
    expect(replacement.status(), 'the freed slot is handed out').toBe(201);
    await trackCreated(identity, team.organisationId, replacement);
  });

  test('should reserve a handle inside its organisation even after deletion and leave other organisations free', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-handle' });
    const neighbour = await identity.createTeam({ label: 'bot-handle-other' });
    const handle = uniqueHandle('handle');
    const claimed = await trackCreated(identity, team.organisationId, await createBot(team.ownerCtx, team.organisationId, { handle }));

    await expectRefused(await createBot(team.ownerCtx, team.organisationId, { handle }), 409, 'BOT_003', 'a handle already taken in the organisation');
    const elsewhere = await createBot(neighbour.ownerCtx, neighbour.organisationId, { handle });
    expect(elsewhere.status(), 'the same handle is free in another organisation').toBe(201);
    await trackCreated(identity, neighbour.organisationId, elsewhere);

    await setOrganisationBotStatus(claimed.id, 'DELETED');
    await expectRefused(await createBot(team.ownerCtx, team.organisationId, { handle }), 409, 'BOT_003', "a deleted bot's handle stays reserved");
    await trackCreated(identity, team.organisationId, await createBot(team.ownerCtx, team.organisationId, { handle: `${handle}-2` }));
  });

  test('should validate the handle, the address allowlist and the request budget of a new bot', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-validate' });
    const refusedHandles = ['', 'Release', 'release_notes', '-release', 'release-', 'release--notes', 'r'.repeat(40)];
    for (const handle of refusedHandles) {
      expect((await createBot(team.ownerCtx, team.organisationId, { handle })).status(), `handle ${JSON.stringify(handle)}`).toBe(422);
    }
    for (const handle of ['r'.repeat(39), '7']) {
      await trackCreated(identity, team.organisationId, await createBot(team.ownerCtx, team.organisationId, { handle }));
    }

    const allowlisted = await trackCreated(
      identity,
      team.organisationId,
      await createBot(team.ownerCtx, team.organisationId, { ipAllowlist: ['203.0.113.77/24', '203.0.113.0/24', '198.51.100.14', '2001:DB8::1/32'] }),
    );
    expect(allowlisted.ipAllowlist, 'host bits are cleared, a bare address becomes a single-host range and duplicates collapse').toEqual([
      '203.0.113.0/24',
      '198.51.100.14/32',
      '2001:db8::/32',
    ]);

    await expectRefused(await createBot(team.ownerCtx, team.organisationId, { ipAllowlist: ['203.0.113.0/33'] }), 400, 'BOT_012', 'a prefix wider than the address');
    await expectRefused(await createBot(team.ownerCtx, team.organisationId, { ipAllowlist: ['not-an-address'] }), 400, 'BOT_012', 'an address that does not parse');
    const tooMany = Array.from({ length: 21 }, (_, index) => `198.51.100.${index + 1}`);
    expect((await createBot(team.ownerCtx, team.organisationId, { ipAllowlist: tooMany })).status(), 'twenty-one allowlist entries').toBe(422);

    for (const rateLimitPerMinute of [0, 601, 12.5]) {
      expect((await createBot(team.ownerCtx, team.organisationId, { rateLimitPerMinute })).status(), `rateLimitPerMinute ${rateLimitPerMinute}`).toBe(422);
    }
    for (const rateLimitPerMinute of [1, 600]) {
      const accepted = await trackCreated(identity, team.organisationId, await createBot(team.ownerCtx, team.organisationId, { rateLimitPerMinute }));
      expect(accepted.rateLimitPerMinute, `rateLimitPerMinute ${rateLimitPerMinute}`).toBe(rateLimitPerMinute);
    }
  });

  test('should keep bot clients out of the admin client listing and out of the platform application client budget', async ({ identity }) => {
    test.setTimeout(60_000);
    const admin = (await identity.admin()).ctx;
    const team = await identity.createTeam({ label: 'bot-hidden' });
    const bot = await identity.createBot(team, { label: 'bot-hidden' });
    const platformApplicationId = await findApplicationIdByName(PLATFORM_APPLICATION_NAME);
    const clientIds = async (query: string): Promise<string[]> => {
      const response = await admin.get(`/api/v1/admin/clients${query}`);
      expect(response.status(), await response.text()).toBe(200);
      return ((await response.json()) as { items: { id: string }[] }).items.map(item => item.id);
    };

    expect(await clientIds(`?applicationId=${platformApplicationId}`), "the platform application's client list hides its bot clients").not.toContain(bot.clientId);
    expect(await clientIds(''), 'nor does the unfiltered listing carry one').not.toContain(bot.clientId);

    // Ten more bot clients put the platform application past the ten-client ceiling, so an eleventh registration
    // succeeding is the proof that the ceiling never counted them.
    await identity.seedBots(team, 10, { label: 'bot-budget' });
    const clientId = `e2e-budget-${randomBytes(4).toString('hex')}`;
    const registered = await identityMutate(admin, 'post', '/api/v1/admin/clients', {
      clientId,
      applicationId: platformApplicationId,
      name: `${clientId} client`,
      kind: 'SERVICE',
      isFirstParty: false,
      grantTypes: ['client_credentials'],
      authMethod: 'client_secret',
    });
    try {
      expect(registered.status(), await registered.text()).toBe(201);
    } finally {
      const removed = await identityMutate(admin, 'delete', `/api/v1/admin/clients/${clientId}`);
      expect([200, 404], 'the probe client is removed from the platform application').toContain(removed.status());
    }
  });

  test('should summarise every live bot with its key usage and never a stored secret', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-listing' });
    const bot = await identity.createBot(team, { label: 'bot-listing' });
    const spare = await identity.createBot(team, { label: 'bot-listing-spare' });
    const older = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-older', expiresAt: new Date(Date.now() + 2 * HOUR_MS) });
    const newer = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-newer' });
    await updateBotKeyRecord(older.keyId, { lastUsedAt: new Date(Date.now() - HOUR_MS), lastUsedIp: '198.51.100.7' });
    await updateBotKeyRecord(newer.keyId, { lastUsedAt: new Date(Date.now() - 60_000), lastUsedIp: '198.51.100.8' });

    const listing = await listBots(team.ownerCtx, team.organisationId);
    expect(listing.usage).toEqual({ count: 2, limit: 25 });
    const summary = listing.bots.find(item => item.id === bot.botId);
    expect(summary).toMatchObject({ activeKeyCount: 2, lastUsedIp: '198.51.100.8' });
    expect(new Date(summary?.lastUsedAt ?? 0).getTime(), 'the most recent use across the keys wins').toBeGreaterThan(Date.now() - 2 * 60_000);

    await setOrganisationBotStatus(spare.botId, 'DELETED');
    const afterDeletion = await listBots(team.ownerCtx, team.organisationId);
    expect(afterDeletion.usage.count).toBe(1);
    expect(afterDeletion.bots.map(item => item.id)).toEqual([bot.botId]);

    const raw = await (await team.ownerCtx.get(botsPath(team.organisationId))).text();
    const stored = await readBotKeyRecord(newer.keyId);
    expect(raw, 'the listing never carries a key hash').not.toContain(stored?.secretHash);
    expect(raw).not.toContain('secretHash');
  });
});

test.describe('identity organisation bots — updates, suspension and keys', () => {
  test('should patch only the mutable fields and audit exactly what changed', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-patch' });
    const bot = await identity.createBot(team, { label: 'bot-patch', ipAllowlist: ['198.51.100.0/24'] });

    const renamed = await patchBot(team.ownerCtx, bot, { displayName: 'E2E Renamed', description: 'E2E description', handle: 'e2e-stolen-handle' });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(await readOrganisationBot(bot.botId)).toMatchObject({ displayName: 'E2E Renamed', description: 'E2E description', handle: bot.handle });

    const cleared = await patchBot(team.ownerCtx, bot, { description: null });
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect((await readOrganisationBot(bot.botId))?.description, 'null clears the description').toBeNull();

    const retuned = await patchBot(team.ownerCtx, bot, { ipAllowlist: ['203.0.113.9'], rateLimitPerMinute: 120 });
    expect(retuned.status(), await retuned.text()).toBe(200);
    expect(await readOrganisationBot(bot.botId)).toMatchObject({ ipAllowlist: ['203.0.113.9/32'], rateLimitPerMinute: 120 });

    await expectRefused(await patchBot(team.ownerCtx, bot, { ipAllowlist: ['203.0.113.0/33'] }), 400, 'BOT_012', 'a patch with an unparseable range');
    expect((await readOrganisationBot(bot.botId))?.ipAllowlist, 'the refused patch stored nothing').toEqual(['203.0.113.9/32']);

    expect(
      (await findAuditEvents('bot.updated', bot.botId)).map(row => row.detail?.fields),
      'each update names exactly the fields it changed',
    ).toEqual([['displayName', 'description'], ['description'], ['ipAllowlist', 'rateLimitPerMinute']]);
  });

  test('should suspend and resume a bot with its backing client, auditing each transition once', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-suspend' });
    const bot = await identity.createBot(team, { label: 'bot-suspend' });
    const suspend = (): Promise<APIResponse> => identityMutate(team.ownerCtx, 'post', `${botPath(team.organisationId, bot.botId)}/suspend`);
    const resume = (): Promise<APIResponse> => identityMutate(team.ownerCtx, 'post', `${botPath(team.organisationId, bot.botId)}/resume`);

    expect((await suspend()).status(), 'an active bot suspends').toBe(200);
    expect(await readOrganisationBot(bot.botId)).toMatchObject({ status: 'SUSPENDED', suspendedBy: team.owner.userId });
    expect((await readOrganisationBot(bot.botId))?.suspendedAt).toBeInstanceOf(Date);
    expect((await readBotClient(bot.clientId))?.isActive, 'suspension deactivates the backing client').toBe(false);
    const detail = await botDetail(team.ownerCtx, team.organisationId, bot.botId);
    expect(detail.suspendedBy).toMatchObject({ id: team.owner.userId, displayName: 'E2E Factory' });

    await expectRefused(await suspend(), 409, 'BOT_010', 'suspending a suspended bot');
    expect((await resume()).status(), 'a suspended bot resumes').toBe(200);
    expect(await readOrganisationBot(bot.botId)).toMatchObject({ status: 'ACTIVE', suspendedAt: null, suspendedBy: null });
    expect((await readBotClient(bot.clientId))?.isActive, 'resuming reactivates the backing client').toBe(true);
    await expectRefused(await resume(), 409, 'BOT_010', 'resuming an active bot');

    const actions = (await auditChain(team.organisationId)).filter(row => row.targetId === bot.botId).map(row => row.action);
    expect(
      actions.filter(action => action === 'bot.suspended'),
      'the refused second suspend audited nothing',
    ).toHaveLength(1);
    expect(actions.filter(action => action === 'bot.resumed')).toHaveLength(1);
  });

  test('should hand back a bot key once, store only the hash of its secret and never repeat it', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-key' });
    const bot = await identity.createBot(team, { label: 'bot-key' });

    const issued = await createKey(team.ownerCtx, bot, { name: 'e2e-ci' });
    expect(issued.status(), await issued.text()).toBe(201);
    const created = (await issued.json()) as CreatedBotKey;
    expect(created.key).toMatch(/^sl_bot_[0-9A-Za-z]{22}_[0-9A-Za-z]{43}_[0-9A-Za-z]{6}$/);
    expect(created.keyPrefix, 'the prefix is the first sixteen characters of the key').toBe(created.key.slice(0, 16));
    expect(created.status).toBe('ACTIVE');

    const parts = parseBotKeyParts(created.key);
    if (!parts) throw new Error(`the issued key did not parse into its three segments: ${created.keyPrefix}…`);
    const stored = await readBotKeyRecord(created.id);
    expect(stored?.secretHash, 'only the SHA-256 of the secret segment is stored').toBe(botKeySecretHash(parts.secret));
    expect(stored?.keyPrefix).toBe(created.keyPrefix);

    const listed = await (await team.ownerCtx.get(`${botPath(team.organisationId, bot.botId)}/keys`)).text();
    expect(listed, 'the key list never repeats the secret').not.toContain(created.key);
    expect(listed).not.toContain(parts.secret);
    expect(listed).not.toContain(stored?.secretHash);
    expect(Object.keys((JSON.parse(listed) as { keys: Record<string, unknown>[] }).keys[0] ?? {}), 'nor does it carry a "key" field at all').not.toContain('key');

    const audited = await findAuditEvents('bot.key.created', bot.botId);
    const detail = JSON.stringify(audited[0]?.detail ?? {});
    expect(detail, 'the audit detail carries neither the secret nor its hash').not.toContain(parts.secret);
    expect(detail).not.toContain(stored?.secretHash);
    expect(audited[0]?.detail).toMatchObject({ keyId: created.id, keyPrefix: created.keyPrefix, name: 'e2e-ci' });
  });

  test('should allow two live keys at a time, counting neither an expired nor a revoked one', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-keycap' });
    const bot = await identity.createBot(team, { label: 'bot-keycap' });
    const first = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-first' });
    const second = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-second' });

    await expectRefused(await createKey(team.ownerCtx, bot), 409, 'BOT_006', 'a third live key');
    await updateBotKeyRecord(first.keyId, { expiresAt: new Date(Date.now() - HOUR_MS) });
    const revoked = await revokeKey(team.ownerCtx, bot, second.keyId);
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect(
      (await listKeys(team.ownerCtx, bot)).map(key => [key.name, key.status]),
      'an expired and a revoked key are both reported, and neither is live',
    ).toEqual(
      expect.arrayContaining([
        ['e2e-first', 'EXPIRED'],
        ['e2e-second', 'REVOKED'],
      ]),
    );

    const third = await createKey(team.ownerCtx, bot, { name: 'e2e-third' });
    expect(third.status(), 'neither of them occupies a slot').toBe(201);
    const thirdId = ((await third.json()) as CreatedBotKey).id;

    const headers = await csrfHeaders(team.ownerCtx, IDENTITY_CSRF_SEED_PATH);
    const racing = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        team.ownerCtx.post(`${botPath(team.organisationId, bot.botId)}/keys`, { headers, data: { name: `e2e-race-${index}`, expiresAt: keyExpiry() } }),
      ),
    );
    expect(racing.map(response => response.status()).sort(), 'three creates racing for the one free slot leave exactly one winner').toEqual([201, 409, 409]);
    for (const refused of racing.filter(item => item.status() === 409)) await expectErrorCode(refused, 'BOT_006');
    expect(
      (await listKeys(team.ownerCtx, bot)).filter(key => key.status === 'ACTIVE').map(key => key.id),
      'the bot holds two live keys',
    ).toContain(thirdId);
  });

  test('should accept only a future ISO-8601 expiry within a year', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-expiry' });
    const bot = await identity.createBot(team, { label: 'bot-expiry' });

    for (const [label, expiresAt] of [
      ['an expiry in the past', new Date(Date.now() - HOUR_MS).toISOString()],
      ['an expiry beyond a year', new Date(Date.now() + 366 * DAY_MS).toISOString()],
    ] as const) {
      await expectRefused(await createKey(team.ownerCtx, bot, { expiresAt }), 400, 'BOT_007', label);
    }

    const malformed = ['next tuesday', 'Tue, 07 Mar 2028 09:30:00 GMT', '2028-03-07', '2028-03-07T09:30Z', '2028-03-07 09:30:00Z', '2028-03-07T09:30:00', '1834567890000'];
    for (const expiresAt of malformed) {
      expect((await createKey(team.ownerCtx, bot, { expiresAt })).status(), `expiresAt ${JSON.stringify(expiresAt)}`).toBe(422);
    }

    const accepted = await createKey(team.ownerCtx, bot, { expiresAt: keyExpiry(364 * DAY_MS) });
    expect(accepted.status(), 'a date-time with an offset just inside the year is accepted').toBe(201);
  });

  test('should report the earliest live expiry and drop it once no key is live', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-nextexpiry' });
    const bot = await identity.createBot(team, { label: 'bot-nextexpiry' });
    expect((await botDetail(team.ownerCtx, team.organisationId, bot.botId)).nextKeyExpiresAt, 'a bot without keys reports none').toBeUndefined();

    const soon = new Date(Date.now() + 2 * HOUR_MS);
    const later = new Date(Date.now() + 5 * HOUR_MS);
    const early = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-soon', expiresAt: soon });
    await issueBotKey(team.ownerCtx, bot, { name: 'e2e-later', expiresAt: later });
    expect((await botDetail(team.ownerCtx, team.organisationId, bot.botId)).nextKeyExpiresAt, 'the earliest live expiry wins').toBe(soon.toISOString());

    expect((await revokeKey(team.ownerCtx, bot, early.keyId)).status(), 'the earliest key is revoked').toBe(200);
    expect((await botDetail(team.ownerCtx, team.organisationId, bot.botId)).nextKeyExpiresAt, 'a revoked key no longer sets the next expiry').toBe(later.toISOString());
  });

  test('should revoke a key idempotently and refuse an unknown, malformed or foreign key id', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-revoke' });
    const bot = await identity.createBot(team, { label: 'bot-revoke' });
    const neighbourBot = await identity.createBot(team, { label: 'bot-revoke-other' });
    const key = await issueBotKey(team.ownerCtx, bot);
    const neighbourKey = await issueBotKey(team.ownerCtx, neighbourBot);

    expect((await revokeKey(team.ownerCtx, bot, key.keyId)).status(), 'the key is revoked').toBe(200);
    expect((await revokeKey(team.ownerCtx, bot, key.keyId)).status(), 'revoking it again is a no-op, not an error').toBe(200);
    expect((await listKeys(team.ownerCtx, bot))[0]).toMatchObject({ status: 'REVOKED', revokedBy: { id: team.owner.userId } });
    expect(await findAuditEvents('bot.key.revoked', bot.botId), 'the second revocation audited nothing').toHaveLength(1);

    for (const [label, keyId] of [
      ['an unknown key', '00000000-0000-4000-8000-000000000000'],
      ['a key id that is not a uuid', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      ["another bot's key", neighbourKey.keyId],
    ] as const) {
      await expectRefused(await revokeKey(team.ownerCtx, bot, keyId), 404, 'BOT_011', `revoking ${label}`);
    }
    expect((await readBotKeyRecord(neighbourKey.keyId))?.revokedAt, "the other bot's key is untouched").toBeNull();
    expect((await revokeKey(team.ownerCtx, neighbourBot, neighbourKey.keyId)).status(), 'its own bot still revokes it').toBe(200);
  });
});

test.describe('identity organisation bots — activity feed', () => {
  test('should account for a bot’s whole administrative history, newest first, with working filters and paging', async ({ identity }) => {
    const team = await identity.createTeam({ label: 'bot-activity' });
    const bot = await identity.createBot(team, { label: 'bot-activity' });
    const key = await issueBotKey(team.ownerCtx, bot, { name: 'e2e-feed' });
    expect((await patchBot(team.ownerCtx, bot, { displayName: 'E2E Feed', rateLimitPerMinute: 90 })).status()).toBe(200);
    await suspendOrganisationBot(team.ownerCtx, bot);
    await resumeOrganisationBot(team.ownerCtx, bot);
    expect((await revokeKey(team.ownerCtx, bot, key.keyId)).status()).toBe(200);

    const feed = await activity(team.ownerCtx, bot, '?limit=100');
    expect(
      feed.events.map(event => event.action),
      'the feed is newest first',
    ).toEqual(['bot.key.revoked', 'bot.resumed', 'bot.suspended', 'bot.updated', 'bot.key.created', 'bot.created']);
    expect(
      [...new Set(feed.events.map(event => `${event.actorType}/${event.actor?.id}/${event.actor?.displayName}/${event.ip}`))],
      'every event names the administrator who caused it and the address it came from',
    ).toEqual([`USER/${team.owner.userId}/E2E Factory/${identity.clientIp}`]);
    expect(
      feed.events.filter(event => event.action.startsWith('bot.key.')).map(event => [event.keyId, event.keyName]),
      'every key event names the key it is about',
    ).toEqual([
      [key.keyId, 'e2e-feed'],
      [key.keyId, 'e2e-feed'],
    ]);
    expect(feed.events.find(event => event.action === 'bot.updated')?.detail?.fields).toEqual(['displayName', 'rateLimitPerMinute']);

    const filtered = await activity(team.ownerCtx, bot, '?action=bot.suspended');
    expect(filtered.events.map(event => event.action)).toEqual(['bot.suspended']);
    expect((await activity(team.ownerCtx, bot, '?outcome=SUCCESS')).events, 'every administrative event succeeded').toHaveLength(feed.events.length);
    expect((await activity(team.ownerCtx, bot, '?outcome=DENIED')).events).toEqual([]);

    const firstPage = await activity(team.ownerCtx, bot, '?limit=2');
    expect(firstPage.events).toHaveLength(2);
    const secondPage = await activity(team.ownerCtx, bot, `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`);
    expect(
      [...firstPage.events, ...secondPage.events].map(event => event.id),
      'paging neither repeats nor skips an event',
    ).toEqual(feed.events.slice(0, 4).map(event => event.id));

    const malformed = await team.ownerCtx.get(`${botPath(team.organisationId, bot.botId)}/activity?cursor=not-a-cursor`);
    expect(malformed.status(), 'a cursor that decodes to nothing is rejected').toBe(422);
  });
});
