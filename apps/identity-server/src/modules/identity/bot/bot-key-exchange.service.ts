import { timingSafeEqual } from 'node:crypto';

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { hashBotKeySecret, parseBotKey } from './bot-key.util';
import { BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE } from './bot.constants';
import { normaliseClientIp } from './ip-allowlist.util';

export interface AuthenticatedBot {
  id: bigint;
  clientId: string;
  organisationId: bigint;
  keyId: string;
  rateLimitPerMinute: number;
}

export type BotKeyPurpose = 'exchange' | 'direct';

export type BotKeyDenialReason = 'revoked' | 'expired' | 'ip_not_allowed' | 'rate_limited' | 'bot_suspended' | 'org_inactive';

export type BotKeyAuthentication = { status: 'authenticated'; bot: AuthenticatedBot } | { status: 'denied' } | { status: 'rate_limited' };

type UnknownKeyReason = 'malformed' | 'not_found' | 'secret_mismatch';

interface KeyRecord {
  secretHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  botId: bigint;
  clientId: string;
  botStatus: string;
  clientActive: boolean;
  rateLimitPerMinute: number;
  organisationId: bigint;
  organisationStatus: string;
  ipAllowed: boolean;
}

const DUMMY_SECRET_HASH = Buffer.alloc(32);
const RATE_WINDOW_SECONDS = 60;
const LAST_USED_THROTTLE_MS = 60_000;
const USED_AUDIT_WINDOW_SECONDS = 3600;
const DENIED_AUDIT_WINDOW_SECONDS = 300;
const LOG_WINDOW_SECONDS = 60;
const DENIED: BotKeyAuthentication = { status: 'denied' };

@Injectable()
export class BotKeyExchangeService {
  private readonly logger = Logger.getLogger(APP_NAME, BotKeyExchangeService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(
    databaseService: DatabaseService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  async authenticate(key: string, callerIp: string, purpose: BotKeyPurpose): Promise<BotKeyAuthentication> {
    const ip = normaliseClientIp(callerIp);
    const parsed = parseBotKey(key);
    if (!parsed) return this.unknown('malformed', ip);

    const record = await this.findKey(parsed.keyId, ip);
    const presented = Buffer.from(hashBotKeySecret(parsed.secret), 'hex');
    const matches = timingSafeEqual(presented, record ? Buffer.from(record.secretHash, 'hex') : DUMMY_SECRET_HASH);
    if (!record) return this.unknown('not_found', ip);
    if (!matches) return this.unknown('secret_mismatch', ip, parsed.keyId);

    const bot: AuthenticatedBot = {
      id: record.botId,
      clientId: record.clientId,
      organisationId: record.organisationId,
      keyId: parsed.keyId,
      rateLimitPerMinute: record.rateLimitPerMinute,
    };
    const reason = this.denialReason(record);
    if (reason) return this.deny(bot, reason, ip);

    const decision =
      purpose === 'exchange'
        ? await this.rateLimiterService.enforce('bot-key-exchange', bot.keyId, BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE, RATE_WINDOW_SECONDS)
        : await this.rateLimiterService.enforce('bot-api', bot.id.toString(), bot.rateLimitPerMinute, RATE_WINDOW_SECONDS);
    if (!decision.allowed) {
      await this.deny(bot, 'rate_limited', ip);
      return { status: 'rate_limited' };
    }

    await this.touch(bot.keyId, ip);
    await this.sampleAudit(`bot:audit:used:${bot.keyId}`, USED_AUDIT_WINDOW_SECONDS, () => this.record(bot, 'bot.key.used', 'SUCCESS', ip, { purpose }));
    return { status: 'authenticated', bot };
  }

  private async findKey(keyId: string, ip: string | null): Promise<KeyRecord | null> {
    const [record] = await this.db
      .select({
        secretHash: schema.botKeys.secretHash,
        revokedAt: schema.botKeys.revokedAt,
        expiresAt: schema.botKeys.expiresAt,
        botId: schema.bots.id,
        clientId: schema.bots.clientId,
        botStatus: schema.bots.status,
        clientActive: schema.oauthClients.isActive,
        rateLimitPerMinute: schema.bots.rateLimitPerMinute,
        organisationId: schema.bots.organisationId,
        organisationStatus: schema.organisations.status,
        ipAllowed: sql<boolean>`coalesce(cardinality(${schema.bots.ipAllowlist}) = 0 OR ${ip}::inet <<= ANY(${schema.bots.ipAllowlist}), false)`,
      })
      .from(schema.botKeys)
      .innerJoin(schema.bots, eq(schema.bots.id, schema.botKeys.botId))
      .innerJoin(schema.oauthClients, eq(schema.oauthClients.id, schema.bots.clientId))
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.bots.organisationId))
      .where(eq(schema.botKeys.id, keyId))
      .limit(1);
    return record ?? null;
  }

  private denialReason(record: KeyRecord): BotKeyDenialReason | null {
    if (record.revokedAt) return 'revoked';
    if (record.expiresAt.getTime() <= Date.now()) return 'expired';
    if (record.botStatus !== 'ACTIVE' || !record.clientActive) return 'bot_suspended';
    if (record.organisationStatus !== 'ACTIVE') return 'org_inactive';
    if (!record.ipAllowed) return 'ip_not_allowed';
    return null;
  }

  private async unknown(reason: UnknownKeyReason, ip: string | null, keyId?: string): Promise<BotKeyAuthentication> {
    if (await this.claimLogSlot(`bot:log:unknown:${ip ?? 'invalid'}:${reason}`)) {
      this.logger.warn('bot key refused: no key matches the presented credential', { securityEvent: 'bot.key.unknown', reason, keyId, ip });
    }
    return DENIED;
  }

  private async deny(bot: AuthenticatedBot, reason: BotKeyDenialReason, ip: string | null): Promise<BotKeyAuthentication> {
    if (await this.claimLogSlot(`bot:log:denied:${bot.keyId}:${reason}`)) {
      this.logger.warn('bot key refused', {
        securityEvent: 'bot.key.exchange_denied',
        reason,
        botId: bot.id.toString(),
        keyId: bot.keyId,
        organisationId: bot.organisationId.toString(),
      });
    }
    await this.sampleAudit(`bot:audit:denied:${bot.keyId}:${reason}`, DENIED_AUDIT_WINDOW_SECONDS, () => this.record(bot, 'bot.key.exchange_denied', 'DENIED', ip, { reason }));
    return DENIED;
  }

  private async touch(keyId: string, ip: string | null): Promise<void> {
    const now = new Date();
    const stale = or(isNull(schema.botKeys.lastUsedAt), lte(schema.botKeys.lastUsedAt, new Date(now.getTime() - LAST_USED_THROTTLE_MS)));
    await this.db
      .update(schema.botKeys)
      .set({ lastUsedAt: now, lastUsedIp: ip })
      .where(and(eq(schema.botKeys.id, keyId), stale));
  }

  /**
   * Every audit write takes the organisation's hash-chain advisory lock, so recording each exchange would serialise all of an
   * organisation's bot traffic on it; one event per window is kept instead, claimed atomically so replicas do not duplicate it.
   */
  private async sampleAudit(slot: string, windowSeconds: number, write: () => Promise<unknown>): Promise<void> {
    if (!(await this.claimSlot(slot, windowSeconds))) return;
    await write().catch(async (error: unknown) => {
      await this.redis.del(slot);
      throw error;
    });
  }

  private async claimLogSlot(slot: string): Promise<boolean> {
    return this.claimSlot(slot, LOG_WINDOW_SECONDS).catch(() => true);
  }

  private async claimSlot(slot: string, windowSeconds: number): Promise<boolean> {
    return (await this.redis.set(slot, '1', 'EX', windowSeconds, 'NX')) === 'OK';
  }

  private record(bot: AuthenticatedBot, action: string, outcome: 'SUCCESS' | 'DENIED', ip: string | null, detail: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome,
      actorType: 'SERVICE_ACCOUNT',
      actorId: bot.clientId,
      organisationId: bot.organisationId.toString(),
      targetType: 'bot_key',
      targetId: bot.keyId,
      ipAddress: ip,
      detail: { botId: bot.id.toString(), ...detail },
    });
  }
}
