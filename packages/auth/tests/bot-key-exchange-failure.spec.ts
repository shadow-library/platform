/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { type HandlerMetadata } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthClient, type FetchLike } from '@shadow-library/auth';
import { AuthGuard, type AuthGuardHandler, extendContextWithAuth, type GuardedRequest, type GuardedResponse } from '@shadow-library/auth/module';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

interface Interception {
  status: number;
  headers?: Record<string, string>;
}

/**
 * Declaring the constants
 *
 * Identity answers a throttled bot-key exchange with 429, and the key it refuses that way is perfectly
 * valid. Reading that as a credential rejection would negative-cache a working key for ten seconds and
 * keep answering 401 long after identity's window cleared, so the status taxonomy is pinned end to end.
 */
const AUDIENCE = 'api://novel-forge';
const CLIENT = { id: 'novel-forge', secret: 's3cr3t' };
const ORG = '7';
const IP = '203.0.113.7';
const TOKEN_PATH = '/oauth2/token';

describe('Bot key exchange failures', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let context: ContextService;
  let guard: AuthGuard;
  let exchanges: number;
  let intercept: Interception | undefined;
  let counter = 0;

  const transport: FetchLike = async (url, init) => {
    if (!String(url).endsWith(TOKEN_PATH)) return fetch(url, init);
    exchanges += 1;
    if (!intercept) return fetch(url, init);
    const headers = { 'content-type': 'application/json', ...intercept.headers };
    return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: intercept.status, headers });
  };

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, fetch: transport });
    context = new ContextService();
    extendContextWithAuth(context);
    guard = new AuthGuard(auth, context);
  });
  afterAll(() => idp.stop());
  afterEach(() => {
    intercept = undefined;
  });

  const nextKey = (): string => {
    const botId = `bot-${++counter}`;
    const key = idp.issueBotKey({ botId, org: ORG, rateLimitPerMinute: 100 });
    idp.grantPermission({ kind: 'bot', sub: `bot_${botId}` }, ORG, 'projects:read');
    exchanges = 0;
    return key;
  };

  const failureOf = (key: string): Promise<AppError | undefined> =>
    auth.resolveBotKey(key, IP).then(
      () => undefined,
      (error: AppError) => error,
    );

  const runGuarded = (handler: AuthGuardHandler, request: GuardedRequest, response: GuardedResponse): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
      hook({ id: 'throttle-rid' }, {}, () => void handler(request, response).then(resolve, reject));
    });

  it('should treat a throttled exchange as a transient failure rather than an invalid key', async () => {
    const key = nextKey();
    intercept = { status: 429, headers: { 'retry-after': '9' } };

    const error = await failureOf(key);
    expect({ code: error?.code, status: error?.status }).toEqual({ code: 'TOKEN_EXCHANGE_FAILED', status: 503 });
  });

  it('should hold a throttled key back rather than re-asking identity on every request', async () => {
    const key = nextKey();
    intercept = { status: 429, headers: { 'retry-after': '30' } };
    expect((await failureOf(key))?.code).toBe('TOKEN_EXCHANGE_FAILED');

    intercept = undefined;
    const held = await failureOf(key);
    expect({ code: held?.code, status: held?.status }).toEqual({ code: 'TOKEN_EXCHANGE_FAILED', status: 503 });
    expect(exchanges).toBe(1);
  });

  it('should negative-cache a 4xx that is neither 401 nor 429, since only those say nothing about the key', async () => {
    const key = nextKey();
    intercept = { status: 400 };
    expect((await failureOf(key))?.code).toBe('BOT_KEY_INVALID');

    intercept = undefined;
    expect((await failureOf(key))?.code).toBe('BOT_KEY_INVALID');
    expect(exchanges).toBe(1);
  });

  it('should read a 401 as this application failing its own credential, not the key', async () => {
    const key = nextKey();
    intercept = { status: 401 };
    expect((await failureOf(key))?.code).toBe('TOKEN_EXCHANGE_FAILED');

    intercept = undefined;
    await expect(auth.resolveBotKey(key, IP)).resolves.toMatchObject({ kind: 'bot' });
    expect(exchanges).toBe(2);
  });

  it('should read a 5xx as an outage and leave it uncached', async () => {
    const key = nextKey();
    intercept = { status: 502 };
    expect((await failureOf(key))?.code).toBe('TOKEN_EXCHANGE_FAILED');

    intercept = undefined;
    await expect(auth.resolveBotKey(key, IP)).resolves.toMatchObject({ kind: 'bot' });
    expect(exchanges).toBe(2);
  });

  it('should hand a throttled bot identity retry-after instead of a 401 it cannot act on', async () => {
    const key = nextKey();
    intercept = { status: 429, headers: { 'retry-after': '12' } };
    const handler = guard.generate({ shadowAuth: { authenticated: true, botPermissions: ['projects:read'] }, method: 'GET', path: '/projects' } as HandlerMetadata);
    if (!handler) throw new Error('expected a handler');

    const headers = new Map<string, string | string[]>();
    const response: GuardedResponse = { header: (name, value) => headers.set(name, value), redirect: () => undefined };
    const request: GuardedRequest = { headers: { authorization: `Bearer ${key}` }, ip: IP };

    const error = await runGuarded(handler, request, response).then(
      () => undefined,
      (caught: AppError) => caught,
    );
    expect({ code: error?.code, status: error?.status }).toEqual({ code: 'TOKEN_EXCHANGE_FAILED', status: 503 });
    expect(headers.get('retry-after')).toBe('12');
  });
});
