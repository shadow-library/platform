import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { KeyService } from '@server/modules/auth/keys';
import { ACCESS_TOKEN_TYPE, AccessTokenService, BOT_KEY_TOKEN_TYPE, OAuthClientService, TOKEN_EXCHANGE_GRANT } from '@server/modules/auth/oauth';
import { BotKeyExchangeService, BotKeyService, BotService, formatBotKey, parseBotKey } from '@server/modules/identity/bot';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { GENERAL_LIMIT, GENERAL_WINDOW_SECONDS, IP_GENERAL_BUCKET, RateLimiterService } from '@server/modules/infrastructure/security';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

interface ExchangingClient {
  clientId: string;
  secret?: string;
}

interface TokenJson {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  issued_token_type?: string;
}

const env = new TestEnvironment('bot_key_exchange').init();

const DAY_MS = 24 * 60 * 60 * 1000;
const FORM = 'application/x-www-form-urlencoded';
const EXCHANGER_AUDIENCE = 'api://exchanger';

describe('Bot key exchange', () => {
  let db: PrimaryDatabase;
  let adminId: bigint;
  let orgId: bigint;
  let botId: bigint;
  let botClientId: string;
  let key: string;
  let keyId: string;
  let exchanger: ExchangingClient;
  let thirdParty: ExchangingClient;
  let seq = 0;

  const registerClient = async (name: string, isFirstParty: boolean, withAudience = true): Promise<ExchangingClient> => {
    const application = await env.getService(ApplicationService).createApplication({ name, subDomain: name });
    const clients = env.getService(OAuthClientService);
    if (withAudience) await clients.ensureResource(application.id, `api://${name}`);
    return clients.register({ applicationId: application.id, name, kind: 'WEB_CONFIDENTIAL', isFirstParty, grantTypes: ['authorization_code', 'client_credentials'] });
  };

  const basic = (client: ExchangingClient, secret = client.secret) => `Basic ${Buffer.from(`${client.clientId}:${secret}`).toString('base64')}`;

  const tokenRequest = (body: Record<string, string | undefined>, authorization?: string, remoteAddress = '127.0.0.1') => {
    const form = new URLSearchParams();
    for (const [name, value] of Object.entries(body)) if (value !== undefined) form.set(name, value);
    const headers: Record<string, string> = { 'content-type': FORM };
    if (authorization) headers.authorization = authorization;
    return env.getRouter().mockRequest({ method: 'POST', url: '/oauth2/token', remoteAddress, headers, payload: form.toString() });
  };

  const exchange = (overrides: Record<string, string | undefined> = {}, client = exchanger, remoteAddress?: string) =>
    tokenRequest({ grant_type: TOKEN_EXCHANGE_GRANT, subject_token: key, subject_token_type: BOT_KEY_TOKEN_TYPE, ...overrides }, basic(client), remoteAddress);

  const errorOf = (response: { json: () => unknown }): string => (response.json() as { code: string }).code;

  const createKey = async (expiresInDays = 90): Promise<{ key: string; id: string }> =>
    env.getService(BotKeyService).createKey({ userId: adminId }, orgId, botId, { name: `key-${seq++}`, expiresAt: new Date(Date.now() + expiresInDays * DAY_MS).toISOString() });

  const auditEvents = (action: string) => db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action));

  const keyRow = async () => db.query.botKeys.findFirst({ where: eq(schema.botKeys.id, keyId) });

  beforeEach(async () => {
    db = env.getPostgresClient();
    const users = env.getService(UserService);
    const ownerId = (await users.createUserWithPassword({ email: 'owner@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    adminId = (await users.createUserWithPassword({ email: 'admin@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    const organisations = env.getService(OrganisationService);
    orgId = (await organisations.createTeam(ownerId, { name: 'Acme' })).id;
    await organisations.ensureMember(orgId, adminId, 'ADMIN');

    const bot = await env.getService(BotService).createBot({ userId: adminId }, orgId, { handle: 'release-notes', displayName: 'Release notes', rateLimitPerMinute: 120 });
    botId = bot.id;
    botClientId = bot.clientId;
    ({ key, id: keyId } = await createKey());

    exchanger = await registerClient('exchanger', true);
    thirdParty = await registerClient('third-party', false);
  });

  afterEach(() => {
    env.getService(RateLimiterService).enabled = false;
  });

  describe('success', () => {
    it('should mint a bot token carrying every contract claim with the audience forced to the exchanging client', async () => {
      const response = await exchange();
      expect(response.statusCode).toBe(200);

      const body = response.json() as TokenJson;
      expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 300, scope: '', issued_token_type: ACCESS_TOKEN_TYPE });
      expect(body.refresh_token).toBeUndefined();

      const claims = env.getService(KeyService).verify(body.access_token);
      expect(claims).toMatchObject({
        token_type: 'bot',
        sub: botClientId,
        client_id: botClientId,
        org: orgId.toString(),
        bot_id: botId.toString(),
        bot_key_id: keyId,
        rl: 120,
        aud: EXCHANGER_AUDIENCE,
        iss: env.getService(AccessTokenService).getIssuer(),
      });
      expect(Number(claims?.exp) - Number(claims?.iat)).toBe(300);
      expect(claims?.scope).toBeUndefined();
      expect(claims?.act).toBeUndefined();
      expect(claims?.sid).toBeUndefined();
    });

    it('should accept a resource naming its own audience and refuse any other with invalid_target', async () => {
      expect((await exchange({ resource: EXCHANGER_AUDIENCE })).statusCode).toBe(200);

      const foreign = await exchange({ resource: 'api://novel-forge' });
      expect(foreign.statusCode).toBe(400);
      expect(errorOf(foreign)).toBe('invalid_target');
    });

    it('should refuse requested scopes because a bot token carries none', async () => {
      const response = await exchange({ scope: 'openid' });
      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toBe('invalid_scope');
    });
  });

  describe('refusals', () => {
    const expectKeyRefused = async (response: { statusCode: number; json: () => unknown }): Promise<void> => {
      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toBe('invalid_grant');
    };

    it('should refuse a key with a bad checksum', async () => {
      const tampered = `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`;
      await expectKeyRefused(await exchange({ subject_token: tampered }));
    });

    it('should refuse an unknown key through the dummy comparison path', async () => {
      const warn = spyOn(env.getService(BotKeyExchangeService)['logger'], 'warn');
      const unknown = formatBotKey(Bun.randomUUIDv7(), randomBytes(32));
      await expectKeyRefused(await exchange({ subject_token: unknown }));
      expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ securityEvent: 'bot.key.unknown', reason: 'not_found' }));
      warn.mockRestore();
    });

    it('should refuse the right key id with the wrong secret', async () => {
      const parsed = parseBotKey(key);
      const forged = formatBotKey(parsed!.keyId, randomBytes(32));
      await expectKeyRefused(await exchange({ subject_token: forged }));
    });

    it('should refuse a revoked key', async () => {
      await env.getService(BotKeyService).revokeKey({ userId: adminId }, orgId, botId, keyId);
      await expectKeyRefused(await exchange());
    });

    it('should refuse an expired key', async () => {
      await db
        .update(schema.botKeys)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.botKeys.id, keyId));
      await expectKeyRefused(await exchange());
    });

    it('should refuse a suspended bot', async () => {
      await env.getService(BotService).suspendBot({ userId: adminId }, orgId, botId);
      await expectKeyRefused(await exchange());
    });

    it('should refuse a bot in a suspended organisation', async () => {
      await db.update(schema.organisations).set({ status: 'SUSPENDED' }).where(eq(schema.organisations.id, orgId));
      await expectKeyRefused(await exchange());
    });

    it('should refuse a caller outside the IP allowlist', async () => {
      await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: ['198.51.100.0/24'] });
      await expectKeyRefused(await exchange({ client_ip: '203.0.113.9' }));
      await expectKeyRefused(await exchange({ client_ip: 'not-an-ip' }));
    });

    it('should refuse a client that is not first-party with unauthorized_client', async () => {
      const response = await exchange({}, thirdParty);
      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toBe('unauthorized_client');
    });

    it('should refuse a first-party client that exposes no resource audience with unauthorized_client', async () => {
      const audienceless = await registerClient('audienceless', true, false);
      const response = await exchange({}, audienceless);
      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toBe('unauthorized_client');
    });

    it('should answer 429 once the key has spent its exchange budget, even with the abuse-control kill switch off', async () => {
      expect(env.getService(RateLimiterService).enabled).toBe(false);

      for (let attempt = 0; attempt < 60; attempt++) expect((await exchange()).statusCode).toBe(200);
      const limited = await exchange();
      expect(limited.statusCode).toBe(429);
      expect(errorOf(limited)).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);

      const [denied] = await auditEvents('bot.key.exchange_denied');
      expect(denied?.detail).toMatchObject({ reason: 'rate_limited' });
    }, 60_000);

    it('should answer 429 with a retry-after when the forwarded caller address has spent its IP budget', async () => {
      const limiter = env.getService(RateLimiterService);
      limiter.enabled = true;
      await env.getRedisClient().set(`rl:${IP_GENERAL_BUCKET}:203.0.113.9`, String(GENERAL_LIMIT), 'EX', GENERAL_WINDOW_SECONDS);

      const limited = await exchange({ client_ip: '203.0.113.9' }, exchanger, '10.0.0.5');

      expect(limited.statusCode).toBe(429);
      expect(errorOf(limited)).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(GENERAL_WINDOW_SECONDS);
    });

    it('should reserve 401 for the exchanging client failing its own authentication', async () => {
      const response = await tokenRequest({ grant_type: TOKEN_EXCHANGE_GRANT, subject_token: key, subject_token_type: BOT_KEY_TOKEN_TYPE }, basic(exchanger, 'wrong-secret'));
      expect(response.statusCode).toBe(401);
      expect(errorOf(response)).toBe('invalid_client');
    });

    it('should answer every refusal of the key or bot with a 4xx other than 401', async () => {
      const refusals: [string, () => Promise<{ statusCode: number }>][] = [
        ['malformed', () => exchange({ subject_token: 'sl_bot_nope' })],
        ['unknown', () => exchange({ subject_token: formatBotKey(Bun.randomUUIDv7(), randomBytes(32)) })],
        ['wrong secret', () => exchange({ subject_token: formatBotKey(keyId, randomBytes(32)) })],
        [
          'not allowlisted',
          async () => {
            await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: ['198.51.100.0/24'] });
            const response = await exchange({ client_ip: '203.0.113.9' });
            await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: [] });
            return response;
          },
        ],
        ['third party', () => exchange({}, thirdParty)],
        ['missing subject token', () => exchange({ subject_token: undefined })],
      ];

      for (const [label, attempt] of refusals) {
        const { statusCode } = await attempt();
        expect({ label, statusCode }).toEqual({ label, statusCode: 400 });
      }
    });
  });

  describe('caller address', () => {
    beforeEach(async () => {
      await env.getService(BotService).updateBot({ userId: adminId }, orgId, botId, { ipAllowlist: ['198.51.100.0/24'] });
    });

    it('should evaluate the allowlist against the client_ip a first-party client forwards', async () => {
      expect((await exchange({ client_ip: '198.51.100.7' }, exchanger, '10.0.0.5')).statusCode).toBe(200);
      expect((await keyRow())?.lastUsedIp).toBe('198.51.100.7');
      expect((await exchange({}, exchanger, '10.0.0.5')).statusCode).toBe(400);
    });

    it('should normalise an IPv4-mapped IPv6 caller address', async () => {
      expect((await exchange({ client_ip: '::ffff:198.51.100.7' })).statusCode).toBe(200);
    });

    it('should never let a client that is not first-party supply the caller address', async () => {
      expect((await exchange({ client_ip: '198.51.100.7' }, thirdParty, '10.0.0.5')).statusCode).toBe(400);
      expect((await keyRow())?.lastUsedAt).toBeNull();
      expect(await auditEvents('bot.key.used')).toHaveLength(0);
    });

    it('should charge a refused exchange to the forwarded caller address rather than the exchanging service', async () => {
      const limiter = env.getService(RateLimiterService);
      limiter.enabled = true;
      const redis = env.getRedisClient();
      await redis.del(`rl:${IP_GENERAL_BUCKET}:203.0.113.9`, `rl:${IP_GENERAL_BUCKET}:10.0.0.5`);

      expect((await exchange({ client_ip: '203.0.113.9' }, exchanger, '10.0.0.5')).statusCode).toBe(400);
      expect(await redis.get(`rl:${IP_GENERAL_BUCKET}:203.0.113.9`)).toBe('1');
      expect(await redis.get(`rl:${IP_GENERAL_BUCKET}:10.0.0.5`)).toBeNull();
    });
  });

  describe('usage tracking', () => {
    it('should update last use at most once a minute per key', async () => {
      expect((await exchange()).statusCode).toBe(200);
      const first = (await keyRow())?.lastUsedAt;
      expect(first).toBeInstanceOf(Date);

      const recent = new Date(Date.now() - 30_000);
      await db.update(schema.botKeys).set({ lastUsedAt: recent }).where(eq(schema.botKeys.id, keyId));
      await exchange();
      expect((await keyRow())?.lastUsedAt?.getTime()).toBe(recent.getTime());

      const stale = new Date(Date.now() - 120_000);
      await db.update(schema.botKeys).set({ lastUsedAt: stale }).where(eq(schema.botKeys.id, keyId));
      await exchange();
      expect((await keyRow())?.lastUsedAt?.getTime()).toBeGreaterThan(stale.getTime());
    });

    it('should audit bot.key.used once per key per hour as the bot service account', async () => {
      for (let attempt = 0; attempt < 3; attempt++) expect((await exchange()).statusCode).toBe(200);
      const events = await auditEvents('bot.key.used');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorType: 'SERVICE_ACCOUNT',
        actorId: botClientId,
        organisationId: orgId.toString(),
        targetType: 'bot_key',
        targetId: keyId,
        outcome: 'SUCCESS',
      });

      const ttl = await env.getRedisClient().ttl(`bot:audit:used:${keyId}`);
      expect(ttl).toBeGreaterThan(3500);
      await env.getRedisClient().del(`bot:audit:used:${keyId}`);
      await exchange();
      expect(await auditEvents('bot.key.used')).toHaveLength(2);
    });

    it('should audit a denial once per key per reason per five minutes', async () => {
      await env.getService(BotService).suspendBot({ userId: adminId }, orgId, botId);
      for (let attempt = 0; attempt < 3; attempt++) await exchange();
      await env.getService(BotService).resumeBot({ userId: adminId }, orgId, botId);
      await db.update(schema.organisations).set({ status: 'SUSPENDED' }).where(eq(schema.organisations.id, orgId));
      for (let attempt = 0; attempt < 3; attempt++) await exchange();

      const events = await auditEvents('bot.key.exchange_denied');
      expect(events.map(event => (event.detail as { reason: string }).reason).sort()).toEqual(['bot_suspended', 'org_inactive']);
      expect(events.every(event => event.outcome === 'DENIED' && event.actorType === 'SERVICE_ACCOUNT' && event.actorId === botClientId)).toBe(true);
      const ttl = await env.getRedisClient().ttl(`bot:audit:denied:${keyId}:org_inactive`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should sample refusal logs so unknown keys and repeated denials cannot flood them', async () => {
      const warn = spyOn(env.getService(BotKeyExchangeService)['logger'], 'warn');
      const events = (securityEvent: string) => warn.mock.calls.filter(([, meta]) => (meta as { securityEvent?: string }).securityEvent === securityEvent);

      for (let attempt = 0; attempt < 3; attempt++) await exchange({ subject_token: formatBotKey(Bun.randomUUIDv7(), randomBytes(32)) }, exchanger, '10.0.0.5');
      await exchange({ subject_token: formatBotKey(Bun.randomUUIDv7(), randomBytes(32)) }, exchanger, '10.0.0.6');
      expect(events('bot.key.unknown')).toHaveLength(2);

      await env.getService(BotService).suspendBot({ userId: adminId }, orgId, botId);
      for (let attempt = 0; attempt < 3; attempt++) await exchange();
      expect(events('bot.key.exchange_denied')).toHaveLength(1);
      warn.mockRestore();
    });

    it('should never put key material in logs or audit events', async () => {
      const rootLogger = Object.getPrototypeOf(env.getService(BotKeyExchangeService)['logger']) as { write: (info: unknown) => unknown };
      const write = spyOn(rootLogger, 'write');
      const parsed = parseBotKey(key)!;
      const secretHash = (await keyRow())!.secretHash;

      await exchange();
      await exchange({ subject_token: formatBotKey(keyId, randomBytes(32)) });
      await exchange({ subject_token: `${key.slice(0, -1)}0` });
      await env.getService(BotKeyService).revokeKey({ userId: adminId }, orgId, botId, keyId);
      await exchange();

      expect(write).toHaveBeenCalled();
      const logged = JSON.stringify(write.mock.calls, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
      expect(logged).toContain('oauth.token_exchanged');
      expect(logged).toContain('bot.key.unknown');
      expect(logged).toContain('bot.key.exchange_denied');
      const audited = JSON.stringify(await db.select().from(schema.auditEvents));
      for (const material of [key, parsed.secret, secretHash]) {
        expect(logged).not.toContain(material);
        expect(audited).not.toContain(material);
      }
      write.mockRestore();
    });
  });

  describe('audit resilience', () => {
    const restores: (() => void)[] = [];
    afterEach(() => {
      for (const undo of restores.splice(0)) undo();
    });

    const failAudit = () => {
      const record = spyOn(env.getService(AuditService), 'record').mockImplementation(() => Promise.reject(new Error('audit chain lock timeout')));
      restores.push(() => record.mockRestore());
      return record;
    };

    it('should keep a denial a 4xx when the audit write fails, and still log the security event', async () => {
      await env.getService(BotService).suspendBot({ userId: adminId }, orgId, botId);
      const warn = spyOn(env.getService(BotKeyExchangeService)['logger'], 'warn');
      restores.push(() => warn.mockRestore());
      failAudit();

      const response = await exchange();

      expect({ statusCode: response.statusCode, code: errorOf(response) }).toEqual({ statusCode: 400, code: 'invalid_grant' });
      expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ securityEvent: 'bot.key.exchange_denied', reason: 'bot_suspended' }));
    });

    it('should keep an authentication successful when the audit write fails, and audit the next use instead', async () => {
      const record = failAudit();
      expect((await exchange()).statusCode).toBe(200);
      expect(await auditEvents('bot.key.used')).toHaveLength(0);
      expect(await env.getRedisClient().get(`bot:audit:used:${keyId}`)).toBeNull();

      record.mockRestore();
      expect((await exchange()).statusCode).toBe(200);
      expect(await auditEvents('bot.key.used')).toHaveLength(1);
    });
  });

  describe('bot principals elsewhere at the token endpoint', () => {
    const botToken = async (): Promise<string> => ((await exchange()).json() as TokenJson).access_token;

    it('should refuse a bot token as an RFC 8693 subject token', async () => {
      const response = await tokenRequest(
        { grant_type: TOKEN_EXCHANGE_GRANT, subject_token: await botToken(), subject_token_type: ACCESS_TOKEN_TYPE, resource: EXCHANGER_AUDIENCE },
        basic(exchanger),
      );
      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toBe('invalid_grant');
    });

    it('should refuse a bot client authenticating itself before any grant is resolved', async () => {
      const clients = env.getService(OAuthClientService);
      const resolveScopes = spyOn(clients, 'getAvailableScopes');
      const secret = randomBytes(24).toString('base64url');
      await clients.setSecret(botClientId, secret);
      const bot = { clientId: botClientId, secret };

      const attempts = [
        tokenRequest({ grant_type: 'client_credentials', resource: 'shadow-identity' }, basic(bot)),
        tokenRequest({ grant_type: 'client_credentials', client_id: botClientId, client_secret: secret }),
        tokenRequest({ grant_type: TOKEN_EXCHANGE_GRANT, subject_token: key, subject_token_type: BOT_KEY_TOKEN_TYPE }, basic(bot)),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.statusCode).toBe(401);
        expect(errorOf(response)).toBe('invalid_client');
      }
      expect(resolveScopes).not.toHaveBeenCalled();
      resolveScopes.mockRestore();
    });

    it('should refuse a bot token at userinfo', async () => {
      const token = await botToken();
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/oauth2/userinfo')
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(401);
    });

    it('should refuse a bot client at SCIM even with a provisioning-scoped service token', async () => {
      const serviceToken = env.getService(AccessTokenService).mintAccessToken({
        subject: botClientId,
        audience: 'shadow-identity',
        scope: 'scim:provision',
        clientId: botClientId,
        ttlSeconds: 300,
        actorType: 'service',
      }).token;

      for (const bearer of [serviceToken, await botToken()]) {
        const response = await env
          .getRouter()
          .mockRequest()
          .get('/scim/v2/Users')
          .headers({ authorization: `Bearer ${bearer}` });
        expect(response.statusCode).toBe(403);
      }
    });
  });
});
