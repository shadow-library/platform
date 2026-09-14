/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthErrorCode, type AuthPrincipal, BotKeyExchanger, type BotPrincipal, BotRateLimiter, formatBotKey } from '@shadow-library/auth';
import { AppError } from '@shadow-library/common';

/**
 * Defining types
 */

interface ExchangeCall {
  botKey: string;
  clientIp?: string;
}

/**
 * Declaring the constants
 */
const START = 1_700_000_000_000;
const IP = '203.0.113.7';
const KEY_UUID = '0190f5a2-7c3e-7d4b-9a1f-2b3c4d5e6f70';

const botKey = (): string => formatBotKey(KEY_UUID, crypto.getRandomValues(new Uint8Array(32)));

const botPrincipal = (expSeconds: number): BotPrincipal => ({
  kind: 'bot',
  sub: 'bot_42',
  clientId: 'bot_42',
  scopes: [],
  org: '7',
  botId: '42',
  keyId: KEY_UUID.toUpperCase(),
  rateLimitPerMinute: 60,
  claims: { sub: 'bot_42', exp: expSeconds },
});

describe('BotKeyExchanger', () => {
  let now: number;
  let calls: ExchangeCall[];
  let tokenLifetimeSeconds: number;
  let exchangeFailure: AppError | undefined;
  let principalFor: (token: string) => AuthPrincipal;
  let exchanger: BotKeyExchanger;

  beforeEach(() => {
    now = START;
    calls = [];
    tokenLifetimeSeconds = 300;
    exchangeFailure = undefined;
    principalFor = () => botPrincipal(Math.floor(now / 1000) + tokenLifetimeSeconds);
    exchanger = new BotKeyExchanger({
      now: () => now,
      exchange: async (key, clientIp) => {
        calls.push({ botKey: key, clientIp });
        await Bun.sleep(5);
        if (exchangeFailure) throw exchangeFailure;
        return `token-${calls.length}`;
      },
      verify: async token => principalFor(token),
    });
  });

  it('should exchange once for concurrent requests with the same key', async () => {
    const key = botKey();
    const principals = await Promise.all(Array.from({ length: 5 }, () => exchanger.resolve(key, IP)));

    expect(calls).toEqual([{ botKey: key, clientIp: IP }]);
    expect(new Set(principals).size).toBe(1);
  });

  it('should serve the cached principal for 60 s and re-exchange after', async () => {
    const key = botKey();
    await exchanger.resolve(key, IP);

    now += 59_999;
    await exchanger.resolve(key, IP);
    expect(calls).toHaveLength(1);

    now += 1;
    await exchanger.resolve(key, IP);
    expect(calls).toHaveLength(2);
  });

  it('should stop serving a cached principal 30 s before its token expires', async () => {
    tokenLifetimeSeconds = 40;
    const key = botKey();
    await exchanger.resolve(key, IP);

    now += 9_000;
    await exchanger.resolve(key, IP);
    expect(calls).toHaveLength(1);

    now += 1_000;
    await exchanger.resolve(key, IP);
    expect(calls).toHaveLength(2);
  });

  it('should not cache a principal whose token is within 30 s of expiry', async () => {
    tokenLifetimeSeconds = 20;
    const key = botKey();
    await exchanger.resolve(key, IP);
    await exchanger.resolve(key, IP);
    expect(calls).toHaveLength(2);
  });

  it('should negative-cache a refused key for 10 s', async () => {
    const key = botKey();
    exchangeFailure = AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'identity refused the key with http 400' });
    const concurrent = await Promise.all([exchanger.resolve(key, IP).catch((error: unknown) => error), exchanger.resolve(key, IP).catch((error: unknown) => error)]);
    expect(concurrent.every(error => AppError.is(error, AuthErrorCode.BOT_KEY_INVALID))).toBe(true);
    expect(calls).toHaveLength(1);

    exchangeFailure = undefined;
    now += 9_999;
    const refused = await exchanger.resolve(key, IP).catch((error: unknown) => error);
    expect(AppError.is(refused, AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(calls).toHaveLength(1);

    now += 1;
    expect(await exchanger.resolve(key, IP)).toMatchObject({ kind: 'bot', botId: '42' });
    expect(calls).toHaveLength(2);
  });

  it('should hold a throttled key for the retry-after identity sent, then exchange again', async () => {
    const key = botKey();
    exchangeFailure = AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled the bot key exchange', throttled: true, retryAfterSeconds: 30 });
    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.TOKEN_EXCHANGE_FAILED)).toBe(true);

    exchangeFailure = undefined;
    now += 29_999;
    const held = await exchanger.resolve(key, IP).catch((error: unknown) => error);
    expect(AppError.is(held, AuthErrorCode.TOKEN_EXCHANGE_FAILED)).toBe(true);
    expect(calls).toHaveLength(1);

    now += 1;
    expect(await exchanger.resolve(key, IP)).toMatchObject({ kind: 'bot', botId: '42' });
    expect(calls).toHaveLength(2);
  });

  it('should back off for a default window when a throttle carries no retry-after, and never longer than a minute', async () => {
    const unhinted = botKey();
    exchangeFailure = AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled the bot key exchange', throttled: true });
    await exchanger.resolve(unhinted, IP).catch(() => undefined);
    now += 5_000;
    exchangeFailure = undefined;
    expect(await exchanger.resolve(unhinted, IP)).toMatchObject({ kind: 'bot' });

    const clamped = botKey();
    exchangeFailure = AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled the bot key exchange', throttled: true, retryAfterSeconds: 3_600 });
    await exchanger.resolve(clamped, IP).catch(() => undefined);
    now += 60_000;
    exchangeFailure = undefined;
    expect(await exchanger.resolve(clamped, IP)).toMatchObject({ kind: 'bot' });
  });

  it('should never turn a throttle into a refused key', async () => {
    const key = botKey();
    exchangeFailure = AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled the bot key exchange', throttled: true, retryAfterSeconds: 2 });

    for (const attempt of [0, 1]) {
      now += attempt;
      const error = await exchanger.resolve(key, IP).catch((caught: unknown) => caught);
      expect(AppError.is(error, AuthErrorCode.BOT_KEY_INVALID)).toBe(false);
      expect(AppError.is(error, AuthErrorCode.TOKEN_EXCHANGE_FAILED)).toBe(true);
    }
  });

  it('should not cache an outage, so the first request after identity recovers is exchanged', async () => {
    const key = botKey();
    exchangeFailure = AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'http 503' });
    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.TOKEN_EXCHANGE_FAILED)).toBe(true);

    exchangeFailure = undefined;
    expect(await exchanger.resolve(key, IP)).toMatchObject({ kind: 'bot' });
    expect(calls).toHaveLength(2);
  });

  it('should refuse and cache an exchanged token naming a different key', async () => {
    principalFor = () => ({ ...botPrincipal(Math.floor(now / 1000) + 300), keyId: crypto.randomUUID() });
    const key = botKey();

    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('should deep-freeze the principal it caches', async () => {
    const principal = await exchanger.resolve(botKey(), IP);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.claims)).toBe(true);
    expect(() => principal.scopes.push('projects:admin')).toThrow();
  });

  it('should reject a bad checksum without an exchange', async () => {
    const key = botKey();
    const tampered = `${key.slice(0, -1)}${key.endsWith('0') ? '1' : '0'}`;
    const error = await exchanger.resolve(tampered, IP).catch((caught: unknown) => caught);

    expect(AppError.is(error, AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('should refuse an exchange that yields a non-bot principal and cache the refusal', async () => {
    principalFor = () => ({ kind: 'user', sub: 'user-1', scopes: [], claims: { exp: Math.floor(now / 1000) + 300 } });
    const key = botKey();

    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(AppError.is(await exchanger.resolve(key, IP).catch((error: unknown) => error), AuthErrorCode.BOT_KEY_INVALID)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('should exchange separately per caller ip so an allowlist decision never crosses addresses', async () => {
    const key = botKey();
    await exchanger.resolve(key, IP);
    await exchanger.resolve(key, '198.51.100.9');
    await exchanger.resolve(key);

    expect(calls.map(call => call.clientIp)).toEqual([IP, '198.51.100.9', undefined]);
  });
});

describe('BotRateLimiter', () => {
  it('should allow a full minute of requests at once and then refuse with a retry hint', () => {
    let now = START;
    const limiter = new BotRateLimiter({ now: () => now });
    for (let request = 0; request < 3; request++) expect(limiter.consume('42', 3)).toEqual({ allowed: true });

    expect(limiter.consume('42', 3)).toEqual({ allowed: false, retryAfterSeconds: 20 });
    now += 20_000;
    expect(limiter.consume('42', 3)).toEqual({ allowed: true });
  });

  it('should keep separate buckets per bot', () => {
    const limiter = new BotRateLimiter({ now: () => START });
    expect(limiter.consume('42', 1)).toEqual({ allowed: true });
    expect(limiter.consume('42', 1).allowed).toBe(false);
    expect(limiter.consume('43', 1)).toEqual({ allowed: true });
  });

  it('should clamp the bucket when a lower limit arrives', () => {
    const limiter = new BotRateLimiter({ now: () => START });
    expect(limiter.consume('42', 600)).toEqual({ allowed: true });
    expect(limiter.consume('42', 1)).toEqual({ allowed: true });
    expect(limiter.consume('42', 1).allowed).toBe(false);
  });

  it('should evict an idle bucket before an active one', () => {
    let now = START;
    const limiter = new BotRateLimiter({ now: () => now, maxBuckets: 2 });
    limiter.consume('idle', 1);
    now += 30_000;
    limiter.consume('drained', 1);
    now += 31_000;
    limiter.consume('newcomer', 1);

    expect(limiter.consume('drained', 1).allowed).toBe(false);
  });

  it('should evict the fullest bucket when none is idle, never a drained one', () => {
    const limiter = new BotRateLimiter({ now: () => START, maxBuckets: 2 });
    for (let request = 0; request < 10; request++) limiter.consume('drained', 10);
    limiter.consume('light', 10);
    limiter.consume('newcomer', 10);

    expect(limiter.consume('drained', 10).allowed).toBe(false);
  });

  it('should evict the least recently used bucket once the map is full', () => {
    const limiter = new BotRateLimiter({ now: () => START, maxBuckets: 2 });
    limiter.consume('a', 1);
    limiter.consume('b', 1);
    limiter.consume('a', 1);
    limiter.consume('c', 1);

    expect(limiter.consume('b', 1)).toEqual({ allowed: true });
    expect(limiter.consume('c', 1).allowed).toBe(false);
  });
});
