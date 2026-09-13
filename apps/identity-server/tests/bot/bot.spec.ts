import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { and, eq, like } from 'drizzle-orm';

import { APP_NAME, REGEX } from '@server/constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { BotService, parseBotKey } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface UserRefJson {
  id: string;
  displayName?: string;
}

interface BotJson {
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
  createdBy?: UserRefJson;
  createdAt: string;
  suspendedAt?: string;
  suspendedBy?: UserRefJson;
}

interface BotsJson {
  bots: BotJson[];
  usage: { count: number; limit: number };
}

interface KeyJson {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdBy?: UserRefJson;
  revokedAt?: string;
  revokedBy?: UserRefJson;
  key?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const env = new TestEnvironment('bot').init();

describe('Organisation bots', () => {
  let db: PrimaryDatabase;
  let adminId: bigint;
  let memberId: bigint;
  let foreignId: bigint;
  let adminSecret: string;
  let adminAal1Secret: string;
  let memberSecret: string;
  let foreignSecret: string;
  let orgId: string;
  let foreignOrgId: string;
  let seq = 0;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const mock = env.getRouter().mockRequest();
    const chain = mock[method](path)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL2') => (await env.getService(SessionService).create({ userId, aal })).secret;

  const basePath = (organisationId: string = orgId): string => `/api/v1/organisations/${organisationId}/bots`;

  const codeOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const createUser = async (email: string, displayName?: string): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true, displayName })).id;

  const createRequest = (body: Record<string, unknown> = {}, secret = adminSecret, organisationId = orgId) =>
    request('post', basePath(organisationId), secret, { handle: `bot-${seq++}`, displayName: 'Release notes', ...body });

  const createBot = async (body: Record<string, unknown> = {}, secret = adminSecret, organisationId = orgId): Promise<BotJson> => {
    const response = await createRequest(body, secret, organisationId);
    expect(response.statusCode).toBe(201);
    return response.json() as BotJson;
  };

  const seedBots = async (count: number, organisationId = orgId): Promise<void> => {
    const service = env.getService(BotService);
    for (let index = 0; index < count; index++) await service.createBot({ userId: adminId }, BigInt(organisationId), { handle: `seed-${seq++}`, displayName: 'Seeded' });
  };

  const expiryIn = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

  const keyRequest = (botId: string, body: Record<string, unknown> = {}, secret = adminSecret) =>
    request('post', `${basePath()}/${botId}/keys`, secret, { name: `key-${seq++}`, expiresAt: expiryIn(90), ...body });

  const createKey = async (botId: string, body: Record<string, unknown> = {}): Promise<KeyJson> => {
    const response = await keyRequest(botId, body);
    expect(response.statusCode).toBe(201);
    return response.json() as KeyJson;
  };

  const auditEvents = (action: string) => db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action));

  beforeEach(async () => {
    db = env.getPostgresClient();

    const organisations = env.getService(OrganisationService);
    const ownerId = await createUser('owner@example.com');
    adminId = await createUser('admin@example.com', 'Priya Raman');
    memberId = await createUser('member@example.com');
    foreignId = await createUser('foreign@example.com');

    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id.toString();
    foreignOrgId = (await organisations.createTeam(foreignId, { name: 'Globex' })).id.toString();
    await organisations.ensureMember(BigInt(orgId), adminId, 'ADMIN');
    await organisations.ensureMember(BigInt(orgId), memberId, 'MEMBER');

    adminSecret = await session(adminId);
    adminAal1Secret = await session(adminId, 'AAL1');
    memberSecret = await session(memberId);
    foreignSecret = await session(foreignId);
  });

  describe('access control', () => {
    it('should reject a plain org member with ORG_007', async () => {
      const listed = await request('get', basePath(), memberSecret);
      expect(listed.statusCode).toBe(403);
      expect(codeOf(listed)).toBe('ORG_007');

      const created = await createRequest({}, memberSecret);
      expect(created.statusCode).toBe(403);
      expect(codeOf(created)).toBe('ORG_007');
    });

    it('should demand a stepped-up session for every mutation', async () => {
      const bot = await createBot();
      const key = await createKey(bot.id);
      const mutations: [Method, string, Record<string, unknown>?][] = [
        ['post', basePath(), { handle: 'second', displayName: 'Second' }],
        ['patch', `${basePath()}/${bot.id}`, { displayName: 'Renamed' }],
        ['post', `${basePath()}/${bot.id}/suspend`, undefined],
        ['post', `${basePath()}/${bot.id}/resume`, undefined],
        ['post', `${basePath()}/${bot.id}/keys`, { name: 'ci', expiresAt: expiryIn(30) }],
        ['delete', `${basePath()}/${bot.id}/keys/${key.id}`, undefined],
      ];

      for (const [method, path, body] of mutations) {
        const response = await request(method, path, adminAal1Secret, body);
        expect(response.statusCode).toBe(403);
        expect(codeOf(response)).toBe('AUTH_006');
      }
    });

    it('should keep reads available to a non-elevated admin', async () => {
      const bot = await createBot();
      expect((await request('get', basePath(), adminAal1Secret)).statusCode).toBe(200);
      expect((await request('get', `${basePath()}/${bot.id}`, adminAal1Secret)).statusCode).toBe(200);
      expect((await request('get', `${basePath()}/${bot.id}/keys`, adminAal1Secret)).statusCode).toBe(200);
    });

    it("should answer another organisation's bot with BOT_009 as if it did not exist", async () => {
      const bot = await createBot();
      const key = await createKey(bot.id);
      const foreignPath = `${basePath(foreignOrgId)}/${bot.id}`;
      const attempts: [Method, string, Record<string, unknown>?][] = [
        ['get', foreignPath, undefined],
        ['patch', foreignPath, { displayName: 'Stolen' }],
        ['post', `${foreignPath}/suspend`, undefined],
        ['post', `${foreignPath}/resume`, undefined],
        ['get', `${foreignPath}/keys`, undefined],
        ['post', `${foreignPath}/keys`, { name: 'stolen', expiresAt: expiryIn(30) }],
        ['delete', `${foreignPath}/keys/${key.id}`, undefined],
      ];

      for (const [method, path, body] of attempts) {
        const response = await request(method, path, foreignSecret, body);
        expect(response.statusCode).toBe(404);
        expect(codeOf(response)).toBe('BOT_009');
      }

      const missing = await request('get', `${basePath()}/999999`, adminSecret);
      expect(codeOf(missing)).toBe('BOT_009');
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.displayName).toBe('Release notes');
      expect((await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) }))?.revokedAt).toBeNull();
    });
  });

  describe('POST /api/v1/organisations/:organisationId/bots', () => {
    it('should create the backing service client and the bot together', async () => {
      const bot = await createBot({ handle: 'release-notes', description: 'Publishes release notes' });

      expect(bot).toMatchObject({ handle: 'release-notes', displayName: 'Release notes', status: 'ACTIVE', ipAllowlist: [], rateLimitPerMinute: 600, activeKeyCount: 0 });
      expect(bot.createdBy).toEqual({ id: adminId.toString(), displayName: 'Priya Raman' });
      expect(bot.clientId).toMatch(REGEX.BOT_CLIENT_ID);

      const client = await db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, bot.clientId) });
      expect(client).toMatchObject({ kind: 'SERVICE', isFirstParty: false, grantTypes: [], organisationId: BigInt(orgId), isActive: true });
      expect(client?.applicationId).toBe(env.getService(ApplicationService).getApplicationOrThrow(APP_NAME).id);
      expect(await db.$count(schema.oauthClientSecrets, eq(schema.oauthClientSecrets.clientId, bot.clientId))).toBe(0);
      expect(await env.getService(OAuthClientService).getClient(bot.clientId)).not.toBeNull();

      const row = await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) });
      expect(row).toMatchObject({ clientId: bot.clientId, organisationId: BigInt(orgId), createdBy: adminId, description: 'Publishes release notes' });
    });

    it('should leave no client behind when the bot row cannot be written', async () => {
      const service = env.getService(BotService);
      await expect(service.createBot({ userId: adminId }, BigInt(orgId), { handle: 'broken', displayName: 'Broken', rateLimitPerMinute: 601 })).rejects.toThrow();

      expect(await db.$count(schema.bots, eq(schema.bots.organisationId, BigInt(orgId)))).toBe(0);
      expect(await db.$count(schema.oauthClients, and(eq(schema.oauthClients.organisationId, BigInt(orgId)), like(schema.oauthClients.id, 'bot\\_%')))).toBe(0);
    });

    it('should refuse the 26th bot with BOT_001', async () => {
      await seedBots(25);
      const response = await createRequest();
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_001');
    });

    it('should not count deleted bots toward the limit', async () => {
      await seedBots(25);
      const [victim] = await db
        .select({ id: schema.bots.id })
        .from(schema.bots)
        .where(eq(schema.bots.organisationId, BigInt(orgId)))
        .limit(1);
      await db.update(schema.bots).set({ status: 'DELETED' }).where(eq(schema.bots.id, victim!.id));

      await createBot();
    });

    it('should never exceed the limit under concurrent creates', async () => {
      await seedBots(24);
      const responses = await Promise.all([createRequest(), createRequest(), createRequest()]);

      expect(responses.filter(response => response.statusCode === 201)).toHaveLength(1);
      expect(responses.filter(response => response.statusCode === 409).map(codeOf)).toEqual(['BOT_001', 'BOT_001']);
      expect(await db.$count(schema.bots, eq(schema.bots.organisationId, BigInt(orgId)))).toBe(25);
    });

    it('should refuse a personal workspace', async () => {
      const personal = await env.getService(OrganisationService).createPersonalWorkspace(adminId, 'Admin Workspace');

      const response = await createRequest({}, adminSecret, personal.id.toString());
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('ORG_003');

      const direct = env.getService(BotService).createBot({ userId: adminId }, personal.id, { handle: 'personal', displayName: 'Personal' });
      await expect(direct).rejects.toMatchObject({ code: 'BOT_002' });
    });

    it('should refuse a suspended organisation with ORG_002', async () => {
      await db
        .update(schema.organisations)
        .set({ status: 'SUSPENDED' })
        .where(eq(schema.organisations.id, BigInt(orgId)));

      const response = await createRequest();
      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('ORG_002');
    });

    it('should refuse a handle already taken in the organisation with BOT_003', async () => {
      await createBot({ handle: 'release-notes' });

      const duplicate = await createRequest({ handle: 'release-notes' });
      expect(duplicate.statusCode).toBe(409);
      expect(codeOf(duplicate)).toBe('BOT_003');

      const foreign = await createRequest({ handle: 'release-notes' }, foreignSecret, foreignOrgId);
      expect(foreign.statusCode).toBe(201);
    });

    it('should refuse malformed handles at the schema boundary', async () => {
      for (const handle of ['', 'Release', 'release_notes', '-release', 'release-', 'release--notes', 'a'.repeat(40)]) {
        expect((await createRequest({ handle })).statusCode).toBe(422);
      }
      expect((await createRequest({ handle: 'a'.repeat(39) })).statusCode).toBe(201);
      expect((await createRequest({ handle: '7' })).statusCode).toBe(201);
    });

    it('should normalise and dedupe the IP allowlist', async () => {
      const bot = await createBot({ ipAllowlist: ['203.0.113.77/24', '203.0.113.0/24', '198.51.100.14', '2001:DB8::1/32'] });
      expect(bot.ipAllowlist).toEqual(['203.0.113.0/24', '198.51.100.14/32', '2001:db8::/32']);
    });

    it('should refuse an invalid CIDR with BOT_012 and more than 20 entries at the schema boundary', async () => {
      const invalid = await createRequest({ ipAllowlist: ['203.0.113.0/24', '10.0.0.0/33'] });
      expect(invalid.statusCode).toBe(400);
      expect(codeOf(invalid)).toBe('BOT_012');

      const tooMany = await createRequest({ ipAllowlist: Array.from({ length: 21 }, (_, index) => `10.0.${index}.0/24`) });
      expect(tooMany.statusCode).toBe(422);
      expect(await db.$count(schema.bots)).toBe(0);
    });

    it('should accept a rate limit from 1 to 600 only', async () => {
      expect((await createBot({ rateLimitPerMinute: 1 })).rateLimitPerMinute).toBe(1);
      for (const rateLimitPerMinute of [0, 601, 12.5]) expect((await createRequest({ rateLimitPerMinute })).statusCode).toBe(422);
    });

    it('should audit the creation against the organisation', async () => {
      const bot = await createBot();
      const [event] = await auditEvents('bot.created');
      expect(event).toMatchObject({ organisationId: orgId, targetType: 'bot', targetId: bot.id, actorType: 'USER', actorId: adminId.toString(), outcome: 'SUCCESS' });
    });

    it("should not count bot clients toward the platform application's client limit", async () => {
      await seedBots(10);
      const clients = env.getService(OAuthClientService);
      const application = env.getService(ApplicationService).getApplicationOrThrow(APP_NAME);
      const nonBotClients = (await clients.listClients(application.id)).filter(client => !REGEX.BOT_CLIENT_ID.test(client.id)).length;

      for (let index = nonBotClients; index < 10; index++)
        await clients.register({ applicationId: application.id, name: `svc-${index}`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
      await expect(clients.register({ applicationId: application.id, name: 'overflow', kind: 'SERVICE', grantTypes: ['client_credentials'] })).rejects.toMatchObject({
        code: 'ADM_004',
      });
    });
  });

  describe('GET /api/v1/organisations/:organisationId/bots', () => {
    it('should list bots with usage, active key counts and the latest key use', async () => {
      const first = await createBot({ handle: 'first' });
      const second = await createBot({ handle: 'second' });
      const deleted = await createBot({ handle: 'deleted' });
      await db
        .update(schema.bots)
        .set({ status: 'DELETED' })
        .where(eq(schema.bots.id, BigInt(deleted.id)));

      const older = await createKey(first.id);
      const newer = await createKey(first.id);
      await db
        .update(schema.botKeys)
        .set({ lastUsedAt: new Date(Date.now() - 60_000), lastUsedIp: '198.51.100.14' })
        .where(eq(schema.botKeys.id, older.id));
      await db.update(schema.botKeys).set({ lastUsedAt: new Date(), lastUsedIp: '203.0.113.24', revokedAt: new Date() }).where(eq(schema.botKeys.id, newer.id));

      const response = await request('get', basePath(), adminSecret);
      expect(response.statusCode).toBe(200);
      const listing = response.json() as BotsJson;

      expect(listing.usage).toEqual({ count: 2, limit: 25 });
      expect(listing.bots.map(bot => bot.handle)).toEqual(['first', 'second']);
      expect(listing.bots[0]).toMatchObject({ activeKeyCount: 1, lastUsedIp: '203.0.113.24' });
      expect(listing.bots[0]?.lastUsedAt).toBeDefined();
      expect(listing.bots[1]).toMatchObject({ id: second.id, activeKeyCount: 0 });
      expect(listing.bots[1]?.lastUsedAt).toBeUndefined();
      expect(response.body).not.toMatch(/secret_?hash/i);
    });

    it('should answer a deleted bot with BOT_009', async () => {
      const bot = await createBot();
      await db
        .update(schema.bots)
        .set({ status: 'DELETED' })
        .where(eq(schema.bots.id, BigInt(bot.id)));
      expect(codeOf(await request('get', `${basePath()}/${bot.id}`, adminSecret))).toBe('BOT_009');
    });
  });

  describe('PATCH /api/v1/organisations/:organisationId/bots/:botId', () => {
    it('should update the mutable fields and audit which ones changed', async () => {
      const bot = await createBot({ handle: 'release-notes', description: 'Old' });

      const response = await request('patch', `${basePath()}/${bot.id}`, adminSecret, {
        displayName: 'Release bot',
        description: null,
        ipAllowlist: ['10.1.2.3/8'],
        rateLimitPerMinute: 120,
      });
      expect(response.statusCode).toBe(200);

      const detail = (await request('get', `${basePath()}/${bot.id}`, adminSecret)).json() as BotJson;
      expect(detail).toMatchObject({ handle: 'release-notes', displayName: 'Release bot', ipAllowlist: ['10.0.0.0/8'], rateLimitPerMinute: 120 });
      expect(detail.description).toBeUndefined();

      const [event] = await auditEvents('bot.updated');
      expect(event?.detail).toMatchObject({ fields: ['displayName', 'description', 'ipAllowlist', 'rateLimitPerMinute'], ipAllowlist: ['10.0.0.0/8'], rateLimitPerMinute: 120 });
    });

    it('should keep the handle immutable', async () => {
      const bot = await createBot({ handle: 'release-notes' });
      expect((await request('patch', `${basePath()}/${bot.id}`, adminSecret, { handle: 'renamed', displayName: 'Renamed' })).statusCode).toBe(200);
      expect((await db.query.bots.findFirst({ where: eq(schema.bots.id, BigInt(bot.id)) }))?.handle).toBe('release-notes');
    });

    it('should refuse an invalid allowlist with BOT_012', async () => {
      const bot = await createBot();
      const response = await request('patch', `${basePath()}/${bot.id}`, adminSecret, { ipAllowlist: ['nope'] });
      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('BOT_012');
    });

    it('should refuse changes to a bot that is being deleted with BOT_010', async () => {
      const bot = await createBot();
      await db
        .update(schema.bots)
        .set({ status: 'DELETING' })
        .where(eq(schema.bots.id, BigInt(bot.id)));

      for (const body of [{ displayName: 'Renamed' }, {}]) {
        const response = await request('patch', `${basePath()}/${bot.id}`, adminSecret, body);
        expect(response.statusCode).toBe(409);
        expect(codeOf(response)).toBe('BOT_010');
      }
    });
  });

  describe('POST /api/v1/organisations/:organisationId/bots/:botId/suspend and /resume', () => {
    it('should suspend and resume, recording who suspended and toggling the backing client', async () => {
      const bot = await createBot();

      expect((await request('post', `${basePath()}/${bot.id}/suspend`, adminSecret)).statusCode).toBe(200);
      const suspended = (await request('get', `${basePath()}/${bot.id}`, adminSecret)).json() as BotJson;
      expect(suspended.status).toBe('SUSPENDED');
      expect(suspended.suspendedAt).toBeDefined();
      expect(suspended.suspendedBy?.id).toBe(adminId.toString());
      expect((await db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, bot.clientId) }))?.isActive).toBe(false);

      expect((await request('post', `${basePath()}/${bot.id}/resume`, adminSecret)).statusCode).toBe(200);
      const resumed = (await request('get', `${basePath()}/${bot.id}`, adminSecret)).json() as BotJson;
      expect(resumed.status).toBe('ACTIVE');
      expect(resumed.suspendedAt).toBeUndefined();
      expect((await db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, bot.clientId) }))?.isActive).toBe(true);

      expect(await auditEvents('bot.suspended')).toHaveLength(1);
      expect(await auditEvents('bot.resumed')).toHaveLength(1);
    });

    it('should refuse transitions from the wrong status with BOT_010', async () => {
      const bot = await createBot();

      const resumeActive = await request('post', `${basePath()}/${bot.id}/resume`, adminSecret);
      expect(resumeActive.statusCode).toBe(409);
      expect(codeOf(resumeActive)).toBe('BOT_010');

      await request('post', `${basePath()}/${bot.id}/suspend`, adminSecret);
      const suspendSuspended = await request('post', `${basePath()}/${bot.id}/suspend`, adminSecret);
      expect(suspendSuspended.statusCode).toBe(409);
      expect(codeOf(suspendSuspended)).toBe('BOT_010');
    });
  });

  describe('bot keys', () => {
    it('should return the full key once and store only its prefix and secret hash', async () => {
      const bot = await createBot();
      const created = await createKey(bot.id, { name: 'ci-ingest' });

      expect(created.key).toMatch(/^sl_bot_[0-9A-Za-z]{22}_[0-9A-Za-z]{43}_[0-9A-Za-z]{6}$/);
      expect(created).toMatchObject({ name: 'ci-ingest', keyPrefix: created.key!.slice(0, 16), status: 'ACTIVE' });
      expect(created.createdBy?.id).toBe(adminId.toString());

      const parsed = parseBotKey(created.key!);
      expect(parsed?.keyId).toBe(created.id);
      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, created.id) });
      expect(row?.secretHash).toBe(createHash('sha256').update(parsed!.secret).digest('hex'));
      expect(row?.keyPrefix).toBe(created.keyPrefix);

      const listed = await request('get', `${basePath()}/${bot.id}/keys`, adminSecret);
      expect(listed.body).not.toContain(parsed!.secret);
      expect(listed.body).not.toContain(row!.secretHash);
      expect(listed.body).not.toMatch(/"key"|secret_?hash/i);
      expect((listed.json() as { keys: KeyJson[] }).keys.map(key => key.id)).toEqual([created.id]);

      const [event] = await auditEvents('bot.key.created');
      expect(event).toMatchObject({ targetType: 'bot', targetId: bot.id, organisationId: orgId });
      expect(JSON.stringify(event?.detail)).not.toContain(parsed!.secret);
      expect(JSON.stringify(event?.detail)).not.toContain(row!.secretHash);
    });

    it('should refuse a third active key with BOT_006', async () => {
      const bot = await createBot();
      await createKey(bot.id);
      await createKey(bot.id);

      const third = await keyRequest(bot.id);
      expect(third.statusCode).toBe(409);
      expect(codeOf(third)).toBe('BOT_006');
    });

    it('should not count expired or revoked keys as active', async () => {
      const bot = await createBot();
      const expired = await createKey(bot.id);
      const revoked = await createKey(bot.id);
      await db
        .update(schema.botKeys)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.botKeys.id, expired.id));
      expect((await request('delete', `${basePath()}/${bot.id}/keys/${revoked.id}`, adminSecret)).statusCode).toBe(200);

      await createKey(bot.id);
      await createKey(bot.id);

      const keys = ((await request('get', `${basePath()}/${bot.id}/keys`, adminSecret)).json() as { keys: KeyJson[] }).keys;
      expect(keys.map(key => key.status).sort()).toEqual(['ACTIVE', 'ACTIVE', 'EXPIRED', 'REVOKED']);
      expect(((await request('get', `${basePath()}/${bot.id}`, adminSecret)).json() as BotJson).activeKeyCount).toBe(2);
    });

    it('should refuse an expiry that is not in the future or more than 365 days away with BOT_007', async () => {
      const bot = await createBot();
      for (const expiresAt of [new Date(Date.now() - 1000).toISOString(), expiryIn(366), 'next tuesday']) {
        const response = await keyRequest(bot.id, { expiresAt });
        expect(response.statusCode).toBe(400);
        expect(codeOf(response)).toBe('BOT_007');
      }

      const longest = await createKey(bot.id, { expiresAt: new Date(Date.now() + 365 * DAY_MS - 60_000).toISOString() });
      expect(longest.status).toBe('ACTIVE');
    });

    it('should refuse to issue a key to a suspended bot with BOT_010', async () => {
      const bot = await createBot();
      await request('post', `${basePath()}/${bot.id}/suspend`, adminSecret);

      const response = await keyRequest(bot.id);
      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('BOT_010');
    });

    it('should revoke idempotently and audit only the first revocation', async () => {
      const bot = await createBot();
      const key = await createKey(bot.id);
      const path = `${basePath()}/${bot.id}/keys/${key.id}`;

      expect((await request('delete', path, adminSecret)).statusCode).toBe(200);
      expect((await request('delete', path, adminSecret)).statusCode).toBe(200);

      const row = await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, key.id) });
      expect(row?.revokedBy).toBe(adminId);
      expect(await auditEvents('bot.key.revoked')).toHaveLength(1);
    });

    it('should let a suspended bot have its keys revoked', async () => {
      const bot = await createBot();
      const key = await createKey(bot.id);
      await request('post', `${basePath()}/${bot.id}/suspend`, adminSecret);
      expect((await request('delete', `${basePath()}/${bot.id}/keys/${key.id}`, adminSecret)).statusCode).toBe(200);
    });

    it("should answer an unknown, malformed, or another bot's key id with BOT_011", async () => {
      const bot = await createBot();
      const other = await createBot();
      const otherKey = await createKey(other.id);

      for (const keyId of [Bun.randomUUIDv7(), '-'.repeat(36), otherKey.id]) {
        const response = await request('delete', `${basePath()}/${bot.id}/keys/${keyId}`, adminSecret);
        expect(response.statusCode).toBe(404);
        expect(codeOf(response)).toBe('BOT_011');
      }
      expect((await db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, otherKey.id) }))?.revokedAt).toBeNull();
    });
  });
});
