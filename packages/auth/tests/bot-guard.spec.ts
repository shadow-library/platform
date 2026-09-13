/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import 'reflect-metadata';
import { type Response as MockResponse } from 'light-my-request';
import { Dispatcher, type HandlerMetadata, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService, FastifyModule, Get, HttpController, Post } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import {
  Authenticated,
  AuthGuard,
  type AuthGuardHandler,
  AuthModule,
  BotPermission,
  extendContextWithAuth,
  type GuardedRequest,
  type GuardedResponse,
  RequirePermission,
} from '@shadow-library/auth/module';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

type RouteMetadataRecord = Record<string, unknown>;

interface MockRouter {
  mockRequest(options: { method: string; url: string; headers?: Record<string, string> }): Promise<MockResponse>;
}

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://novel-forge';
const CLIENT = { id: 'novel-forge', secret: 's3cr3t' };
const ORG = '7';
const IP = '203.0.113.7';
const PDP_PATH = '/api/v1/authz/check';
const TOKEN_PATH = '/oauth2/token';

const getRouteMetadata = (target: object): RouteMetadataRecord => {
  for (const key of Reflect.getMetadataKeys(target)) {
    const value = Reflect.getMetadata(key, target) as RouteMetadataRecord | undefined;
    if (value && typeof value === 'object' && 'shadowAuth' in value) return value.shadowAuth as RouteMetadataRecord;
  }
  return {};
};

describe('BotPermission decorator', () => {
  class Controller {
    @BotPermission('projects:write')
    @Authenticated()
    write(): void {}

    @Authenticated()
    @BotPermission('projects:read')
    read(): void {}
  }

  it('should compose with @Authenticated in either order on one method', () => {
    expect(getRouteMetadata(Controller.prototype.write)).toEqual({ authenticated: true, botPermissions: ['projects:write'] });
    expect(getRouteMetadata(Controller.prototype.read)).toEqual({ authenticated: true, botPermissions: ['projects:read'] });
  });

  it('should refuse an empty permission', () => {
    expect(() => BotPermission('')).toThrow();
  });
});

describe('BotPermission route merging', () => {
  @HttpController('/projects')
  @BotPermission('projects:read')
  class ProjectController {
    @Get()
    list(): { ok: boolean } {
      return { ok: true };
    }

    @Post('/generate')
    @BotPermission('generation:run')
    generate(): { ok: boolean } {
      return { ok: true };
    }

    @Post('/archive')
    @RequirePermission('projects:archive')
    archive(): { ok: boolean } {
      return { ok: true };
    }
  }

  @Authenticated()
  @HttpController('/members')
  class MemberController {
    @Get()
    list(): { ok: boolean } {
      return { ok: true };
    }

    @BotPermission('members:write')
    @Post()
    add(): { ok: boolean } {
      return { ok: true };
    }
  }

  @Module({ imports: [FastifyModule], controllers: [ProjectController, MemberController] })
  class BotRoutesModule {}

  let idp: TestIdP;
  let app: ShadowApplication;
  let router: MockRouter;

  const call = (method: string, url: string, key: string): Promise<MockResponse> => router.mockRequest({ method, url, headers: { authorization: `Bearer ${key}` } });

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    const auth = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE, appId: CLIENT.id, client: CLIENT });

    @Module({ imports: [FastifyModule.forRoot({ imports: [auth, BotRoutesModule] })] })
    class TestAppModule {}

    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as unknown as MockRouter;
  });

  afterAll(async () => {
    await app.stop();
    idp.stop();
  });

  it('should require both class- and method-level bot permissions', async () => {
    const reader = idp.issueBotKey({ botId: 'reader', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_reader' }, ORG, 'projects:read');
    const generator = idp.issueBotKey({ botId: 'generator', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_generator' }, ORG, 'generation:run');
    const author = idp.issueBotKey({ botId: 'author', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_author' }, ORG, 'projects:read');
    idp.grantPermission({ kind: 'bot', sub: 'bot_author' }, ORG, 'generation:run');

    expect((await call('GET', '/projects', reader)).statusCode).toBe(200);
    expect((await call('POST', '/projects/generate', reader)).statusCode).toBe(403);
    expect((await call('POST', '/projects/generate', generator)).statusCode).toBe(403);
    expect((await call('POST', '/projects/generate', author)).statusCode).toBe(201);
  });

  it('should also require the route permission when a class-level @BotPermission covers a @RequirePermission method', async () => {
    const reader = idp.issueBotKey({ botId: 'archive-reader', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_archive-reader' }, ORG, 'projects:read');
    const archiver = idp.issueBotKey({ botId: 'archiver', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_archiver' }, ORG, 'projects:read');
    idp.grantPermission({ kind: 'bot', sub: 'bot_archiver' }, ORG, 'projects:archive');

    expect((await call('POST', '/projects/archive', reader)).statusCode).toBe(403);
    expect((await call('POST', '/projects/archive', archiver)).statusCode).toBe(201);
  });

  it('should admit a bot only on the method that adds @BotPermission under a class-level @Authenticated', async () => {
    const key = idp.issueBotKey({ botId: 'merge-2', org: ORG });
    idp.grantPermission({ kind: 'bot', sub: 'bot_merge-2' }, ORG, 'members:write');

    expect((await call('GET', '/members', key)).statusCode).toBe(403);
    expect((await call('POST', '/members', key)).statusCode).toBe(201);
  });

  it('should answer 429 with a retry-after header through the framework error handler', async () => {
    const key = idp.issueBotKey({ botId: 'merge-3', org: ORG, rateLimitPerMinute: 1 });
    idp.grantPermission({ kind: 'bot', sub: 'bot_merge-3' }, ORG, 'projects:read');

    expect((await call('GET', '/projects', key)).statusCode).toBe(200);
    const limited = await call('GET', '/projects', key);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.json()).toMatchObject({ code: 'S007' });
  });
});

describe('AuthGuard with bot principals', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let guard: AuthGuard;
  let context: ContextService;
  let counter = 0;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
    context = new ContextService();
    extendContextWithAuth(context);
    guard = new AuthGuard(auth, context);
    await auth.check({ action: 'warm-up', organisationId: ORG, principal: { kind: 'user', sub: 'warm-up' } });
  });
  afterAll(() => idp.stop());
  afterEach(() => idp.setEndpointFailure(TOKEN_PATH, false));

  const nextBotId = (): string => `bot-${++counter}`;
  const request = (bearer?: string): GuardedRequest => ({ headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, ip: IP });

  const runGuarded = (handler: AuthGuardHandler, req: GuardedRequest, response?: GuardedResponse, after?: () => void): Promise<void> =>
    new Promise((resolve, reject) => {
      const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
      hook({ id: 'bot-rid' }, {}, () => {
        handler(req, response)
          .then(() => after?.())
          .then(resolve, reject);
      });
    });

  const failure = async (handler: AuthGuardHandler, req: GuardedRequest, response?: GuardedResponse): Promise<AppError> => {
    const error = await runGuarded(handler, req, response).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  };

  const generate = (auth: RouteMetadataRecord): AuthGuardHandler => {
    const handler = guard.generate({ shadowAuth: auth, method: 'POST', path: '/api/v1/projects' } as HandlerMetadata);
    if (!handler) throw new Error('expected a handler');
    return handler;
  };

  it('should exchange a bot key once for concurrent requests and admit the bot with a PDP permit', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG, rateLimitPerMinute: 100 });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:write');
    const handler = generate({ authenticated: true, botPermissions: ['projects:write'] });

    const before = idp.getBotKeyExchangeCount();
    await Promise.all(Array.from({ length: 4 }, () => runGuarded(handler, request(key))));
    expect(idp.getBotKeyExchangeCount() - before).toBe(1);

    const exchange = idp.getLastTokenRequest();
    expect(exchange?.contentType).toContain('application/x-www-form-urlencoded');
    expect(exchange?.authorization).toMatch(/^Basic /);
    expect(exchange?.body).toMatchObject({ subject_token_type: 'urn:shadow:token-type:bot-key', client_ip: IP, subject_token: key });
    expect(exchange?.body.resource).toBeUndefined();
    expect(exchange?.body.audience).toBeUndefined();

    await runGuarded(handler, request(key), undefined, () => {
      expect(context.getAuthPrincipal()).toMatchObject({ kind: 'bot', sub: `bot_${botId}`, org: ORG, botId, rateLimitPerMinute: 100 });
    });
  });

  it('should deny a bot on routes without a bot permission, or elevated ones, before exchanging its key', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:write');
    const pdpBefore = idp.getRequestCount(PDP_PATH);
    const tokenBefore = idp.getRequestCount(TOKEN_PATH);
    const routes = [
      { authenticated: true },
      { authenticated: true, scopes: ['projects:write'] },
      { authenticated: true, permission: 'projects:write' },
      { authenticated: true, elevated: true, botPermissions: ['projects:write'] },
    ];

    for (const metadata of routes) expect((await failure(generate(metadata), request(key))).code).toBe('IAM_002');
    expect(idp.getRequestCount(TOKEN_PATH)).toBe(tokenBefore);
    expect(idp.getRequestCount(PDP_PATH)).toBe(pdpBefore);
  });

  it('should refuse a bot token presented directly as a bearer, so bots enter only through key exchange', async () => {
    const botId = nextBotId();
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:write');
    const token = await idp.mintBotToken({ botId, org: ORG });

    expect((await failure(generate({ authenticated: true, botPermissions: ['projects:write'] }), request(token))).code).toBe('IAM_001');
    await expect(auth.verify(token)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('should check the route permission for a bot as well as its bot permissions', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
    expect((await failure(generate({ authenticated: true, permission: 'projects:delete', botPermissions: ['projects:read'] }), request(key))).code).toBe('IAM_002');
  });

  it('should deny a bot on a @BotPermission route without a PDP permit', async () => {
    const botId = nextBotId();
    const handler = generate({ authenticated: true, botPermissions: ['projects:write'] });
    expect((await failure(handler, request(idp.issueBotKey({ botId, org: ORG })))).code).toBe('IAM_002');
  });

  it('should require every accumulated bot permission', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:write');
    const handler = generate({ authenticated: true, botPermissions: ['projects:write', 'generation:run', 'projects:write'] });
    expect((await failure(handler, request(key))).code).toBe('IAM_002');

    const fullyGranted = nextBotId();
    idp.grantPermission({ kind: 'bot', sub: `bot_${fullyGranted}` }, ORG, 'projects:write');
    idp.grantPermission({ kind: 'bot', sub: `bot_${fullyGranted}` }, ORG, 'generation:run');
    await runGuarded(handler, request(idp.issueBotKey({ botId: fullyGranted, org: ORG })));
  });

  it('should admit a bot without scopes or service-access rules, and ignore fail-open for it', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
    await runGuarded(generate({ authenticated: true, scopes: ['projects:admin'], botPermissions: ['projects:read'] }), request(key));

    const unknownBot = idp.issueBotKey({ botId: nextBotId(), org: ORG });
    idp.setEndpointFailure(PDP_PATH, true);
    expect((await failure(generate({ authenticated: true, failOpen: true, botPermissions: ['projects:read'] }), request(unknownBot))).code).toBe('IAM_002');
    idp.setEndpointFailure(PDP_PATH, false);
  });

  it('should not call the PDP for users or services on @BotPermission routes', async () => {
    const handler = generate({ authenticated: true, botPermissions: ['projects:write'] });
    const before = idp.getRequestCount(PDP_PATH);
    await runGuarded(handler, request(await idp.issueToken({ sub: 'user-1', audience: AUDIENCE, org: ORG })), undefined, () => {
      expect(context.getAuthPrincipal().kind).toBe('user');
    });
    expect(idp.getRequestCount(PDP_PATH)).toBe(before);
  });

  it('should answer 429 with retry-after once the bot bucket is empty', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG, rateLimitPerMinute: 2 });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
    const handler = generate({ authenticated: true, botPermissions: ['projects:read'] });
    await runGuarded(handler, request(key));
    await runGuarded(handler, request(key));

    const headers = new Map<string, string | string[]>();
    const response: GuardedResponse = { header: (name, value) => headers.set(name, value), redirect: () => undefined };
    const error = await failure(handler, request(key), response);
    expect(error.status).toBe(429);
    expect(error.code).toBe('S007');
    expect(headers.get('retry-after')).toBe('30');
  });

  it('should reject a bad checksum with 401 and no network call', async () => {
    const key = idp.issueBotKey({ botId: nextBotId(), org: ORG });
    const tampered = `${key.slice(0, -1)}${key.endsWith('0') ? '1' : '0'}`;
    const tokenBefore = idp.getRequestCount(TOKEN_PATH);
    const handler = generate({ authenticated: true, botPermissions: ['projects:read'] });

    expect((await failure(handler, request(tampered))).code).toBe('IAM_001');
    expect((await failure(handler, request('sl_bot_not-a-key'))).code).toBe('IAM_001');
    expect(idp.getRequestCount(TOKEN_PATH)).toBe(tokenBefore);
  });

  it('should reject a revoked key with 401 and negative-cache the refusal', async () => {
    const key = idp.issueBotKey({ botId: nextBotId(), org: ORG });
    idp.revokeBotKey(key);
    const handler = generate({ authenticated: true, botPermissions: ['projects:read'] });
    const before = idp.getBotKeyExchangeCount();

    expect((await failure(handler, request(key))).code).toBe('IAM_001');
    expect((await failure(handler, request(key))).code).toBe('IAM_001');
    expect(idp.getBotKeyExchangeCount() - before).toBe(1);
  });

  it('should answer 503 when identity cannot exchange the key, and not cache the outage', async () => {
    const botId = nextBotId();
    const key = idp.issueBotKey({ botId, org: ORG });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
    const handler = generate({ authenticated: true, botPermissions: ['projects:read'] });

    idp.setEndpointFailure(TOKEN_PATH, true);
    const outage = await failure(handler, request(key));
    expect(outage.status).toBe(503);
    expect(outage.code).toBe('TOKEN_EXCHANGE_FAILED');

    idp.setEndpointFailure(TOKEN_PATH, false);
    await runGuarded(handler, request(key));
  });

  it('should refuse an exchanged bot token missing org, bot_id, bot_key_id or a positive rl', async () => {
    const overrides = [{ org: undefined }, { bot_id: undefined }, { bot_key_id: undefined }, { rl: undefined }, { rl: 0 }, { rl: 1.5 }];
    for (const claims of overrides) {
      const key = idp.issueBotKey({ botId: nextBotId(), org: ORG, claims });
      await expect(auth.resolveBotKey(key, IP)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    }
  });

  it('should refuse an exchanged token that names a different key than the one presented', async () => {
    const key = idp.issueBotKey({ botId: nextBotId(), org: ORG, claims: { bot_key_id: crypto.randomUUID() } });
    await expect(auth.resolveBotKey(key, IP)).rejects.toMatchObject({ code: 'BOT_KEY_INVALID' });
  });

  it('should hand out a frozen principal, since it is shared across requests', async () => {
    const principal = await auth.resolveBotKey(idp.issueBotKey({ botId: nextBotId(), org: ORG }), IP);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.scopes)).toBe(true);
    expect(Object.isFrozen(principal.claims)).toBe(true);
  });

  it('should never log the bot key, its hash or the exchanged token', async () => {
    const lines: string[] = [];
    const capture = new Proxy(
      {},
      {
        get:
          () =>
          (...args: unknown[]) =>
            void lines.push(JSON.stringify(args)),
      },
    );
    const spy = spyOn(Logger, 'getLogger').mockImplementation(() => capture as ReturnType<typeof Logger.getLogger>);
    try {
      const loggedAuth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
      const loggedGuard = new AuthGuard(loggedAuth, context);
      const botId = nextBotId();
      const key = idp.issueBotKey({ botId, org: ORG, rateLimitPerMinute: 1 });
      const revoked = idp.issueBotKey({ botId: nextBotId(), org: ORG });
      idp.revokeBotKey(revoked);
      idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
      const handler = loggedGuard.generate({
        shadowAuth: { authenticated: true, botPermissions: ['projects:read'] },
        method: 'GET',
        path: '/',
      } as HandlerMetadata) as AuthGuardHandler;

      await runGuarded(handler, request(key));
      await runGuarded(handler, request(key)).catch(() => undefined);
      await runGuarded(handler, request(revoked)).catch(() => undefined);
      await runGuarded(loggedGuard.generate({ shadowAuth: { authenticated: true }, method: 'GET', path: '/' } as HandlerMetadata) as AuthGuardHandler, request(key)).catch(
        () => undefined,
      );

      const hashes = (value: string): string[] =>
        [value, `${IP}\n${value}`].flatMap(input => [createHash('sha256').update(input).digest('base64url'), createHash('sha256').update(input).digest('hex')]);
      const secrets = [key, revoked].flatMap(value => [value, value.split('_')[3] ?? value, ...hashes(value)]);
      const logged = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      for (const secret of secrets) expect(logged).not.toContain(secret);
      expect(logged).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    } finally {
      spy.mockRestore();
    }
  });
});
