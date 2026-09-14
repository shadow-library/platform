/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { AppError, Logger, LRUCache } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AuthPrincipal, BotPrincipal } from '../interfaces';
import { botKeyIdToUuid, parseBotKey } from './bot-key';
import { isThrottled, retryAfterHint } from './transport';

/**
 * Defining types
 */

export interface BotKeyExchangerOptions {
  /** Exchanges the key at identity and returns the bot access token */
  exchange: (botKey: string, clientIp?: string) => Promise<string>;
  verify: (accessToken: string) => Promise<AuthPrincipal>;
  maxEntries?: number;
  now?: () => number;
}

interface CachedBotPrincipal {
  principal: BotPrincipal;
  expiresAt: number;
}

/**
 * Declaring the constants
 *
 * A verified principal is cached until `min(exp - 30 s, 60 s)`, which is also the upper bound on how
 * long a revoked key or a suspended bot keeps working on this replica. A definitive refusal (a 4xx
 * credential rejection) is cached for 10 s so a revoked key hammering the service costs identity one
 * exchange per window; an outage is not, so the first request after identity recovers succeeds.
 *
 * A throttle is neither. The key is valid, so it must not be negative-cached into a 401, but identity
 * said "stop" and nothing else on this path applies backpressure — the bot rate limiter only runs once
 * an exchange has succeeded, and identity charges nothing for the refusal. So the back-off is held
 * separately and still rethrown as an outage. Identity's own `Retry-After` is taken verbatim up to the
 * maximum, however short: it is what remains of *its* window, so a floor would only delay a bot that
 * identity is already willing to serve again. `THROTTLE_DEFAULT_MS` is the guess for a missing hint,
 * not a minimum.
 *
 * Entries are keyed by a hash of the key *and* the caller's IP: identity enforces the bot's IP
 * allowlist during the exchange, so a principal verified for one address must never answer a request
 * from another.
 */
const DEFAULT_MAX_ENTRIES = 1_000;
const MAX_CACHE_MS = 60_000;
const EXPIRY_MARGIN_MS = 30_000;
const REFUSAL_CACHE_MS = 10_000;
const THROTTLE_DEFAULT_MS = 5_000;
const THROTTLE_MAX_MS = 60_000;

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export class BotKeyExchanger {
  private readonly logger = Logger.getLogger(NAMESPACE, BotKeyExchanger.name);
  private readonly verified: LRUCache;
  private readonly refused: LRUCache;
  private readonly throttled: LRUCache;
  private readonly inflight = new Map<string, Promise<BotPrincipal>>();
  private readonly now: () => number;

  constructor(private readonly options: BotKeyExchangerOptions) {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.verified = new LRUCache(maxEntries);
    this.refused = new LRUCache(maxEntries);
    this.throttled = new LRUCache(maxEntries);
    this.now = options.now ?? Date.now;
  }

  async resolve(botKey: string, clientIp?: string): Promise<BotPrincipal> {
    const parsed = parseBotKey(botKey);
    if (!parsed) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the key is malformed or fails its checksum' });

    const cacheKey = createHash('sha256')
      .update(`${clientIp ?? ''}\n${botKey}`)
      .digest('base64url');
    const now = this.now();
    const cached = this.verified.get<CachedBotPrincipal>(cacheKey);
    if (cached && cached.expiresAt > now) return cached.principal;
    if (cached) this.verified.remove(cacheKey);

    const refusedUntil = this.refused.get<number>(cacheKey);
    if (refusedUntil !== undefined && refusedUntil > now) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the key was recently refused' });
    if (refusedUntil !== undefined) this.refused.remove(cacheKey);

    const throttledUntil = this.throttled.get<number>(cacheKey);
    if (throttledUntil !== undefined && throttledUntil > now) {
      const retryAfterSeconds = Math.ceil((throttledUntil - now) / 1000);
      throw AuthErrorCode.TOKEN_EXCHANGE_FAILED.create({ reason: 'identity throttled this key and the back-off has not elapsed', throttled: true, retryAfterSeconds });
    }
    if (throttledUntil !== undefined) this.throttled.remove(cacheKey);

    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;

    const flight = this.exchange(cacheKey, botKey, botKeyIdToUuid(parsed.keyId), clientIp).finally(() => this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey, flight);
    return flight;
  }

  private async exchange(cacheKey: string, botKey: string, keyUuid: string, clientIp: string | undefined): Promise<BotPrincipal> {
    try {
      const principal = await this.options.verify(await this.options.exchange(botKey, clientIp));
      if (principal.kind !== 'bot') throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the exchange did not yield a bot token' });
      if (principal.keyId.toLowerCase() !== keyUuid) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the exchanged token names a different key' });
      this.store(cacheKey, deepFreeze(principal));
      this.logger.debug('bot key exchanged', { botId: principal.botId, org: principal.org });
      return principal;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isThrottled(error)) {
        const hint = retryAfterHint(error);
        const backOffMs = Math.min(THROTTLE_MAX_MS, hint !== undefined && hint > 0 ? hint * 1000 : THROTTLE_DEFAULT_MS);
        this.throttled.set(cacheKey, this.now() + backOffMs);
        this.logger.warn('bot key exchange throttled; holding off before asking identity again', { reason, backOffMs });
        throw error;
      }
      if (!AppError.is(error) || error.status >= 500) {
        this.logger.warn('bot key exchange unavailable', { reason });
        throw error;
      }
      this.refused.set(cacheKey, this.now() + REFUSAL_CACHE_MS);
      this.logger.warn('bot key refused; refusing it briefly', { reason, refusedForMs: REFUSAL_CACHE_MS });
      throw error;
    }
  }

  private store(cacheKey: string, principal: BotPrincipal): void {
    const now = this.now();
    const exp = typeof principal.claims.exp === 'number' ? principal.claims.exp * 1000 - EXPIRY_MARGIN_MS : now + MAX_CACHE_MS;
    const expiresAt = Math.min(exp, now + MAX_CACHE_MS);
    if (expiresAt > now) this.verified.set(cacheKey, { principal, expiresAt });
  }
}
