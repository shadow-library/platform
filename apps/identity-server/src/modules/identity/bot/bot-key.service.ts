import assert from 'node:assert';

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, REGEX } from '@server/constants';
import { type Bot, DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { generateBotKey } from './bot-key.util';
import { type BotActor, BotService, type BotUserRef } from './bot.service';

export type BotKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface BotKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  status: BotKeyStatus;
  expiresAt: Date;
  createdAt: Date;
  createdBy: BotUserRef | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  revokedAt: Date | null;
  revokedBy: BotUserRef | null;
}

export interface CreatedBotKey extends BotKeySummary {
  key: string;
}

export interface CreateBotKey {
  name: string;
  expiresAt: string;
}

export const MAX_ACTIVE_KEYS_PER_BOT = 2;
export const MAX_BOT_KEY_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

const STRICT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BotKeyService {
  private readonly logger = Logger.getLogger(APP_NAME, BotKeyService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly botService: BotService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listKeys(organisationId: bigint, botId: bigint): Promise<BotKeySummary[]> {
    const bot = await this.botService.requireBot(organisationId, botId);
    const keys = await this.db.query.botKeys.findMany({ where: eq(schema.botKeys.botId, bot.id), orderBy: [desc(schema.botKeys.createdAt), desc(schema.botKeys.id)] });
    return this.summarise(keys, new Date());
  }

  async createKey(actor: BotActor, organisationId: bigint, botId: bigint, input: CreateBotKey): Promise<CreatedBotKey> {
    const now = new Date();
    const expiresAt = this.parseExpiry(input.expiresAt, now);

    const { key, row } = await this.db.transaction(async tx => {
      // Locks the bot row so concurrent requests cannot both count one active key and each add a second.
      const [bot] = await tx
        .select({ id: schema.bots.id, status: schema.bots.status, organisationStatus: schema.organisations.status })
        .from(schema.bots)
        .innerJoin(schema.organisations, eq(schema.organisations.id, schema.bots.organisationId))
        .where(and(eq(schema.bots.id, botId), eq(schema.bots.organisationId, organisationId)))
        .for('no key update', { of: schema.bots });
      if (!bot || bot.status === 'DELETED') throw AppErrorCode.BOT_009.create();
      if (bot.status !== 'ACTIVE') throw AppErrorCode.BOT_010.create();
      if (bot.organisationStatus !== 'ACTIVE') throw AppErrorCode.BOT_013.create();

      const active = await tx.$count(schema.botKeys, and(eq(schema.botKeys.botId, bot.id), isNull(schema.botKeys.revokedAt), gt(schema.botKeys.expiresAt, now)));
      if (active >= MAX_ACTIVE_KEYS_PER_BOT) throw AppErrorCode.BOT_006.create();

      const id = Bun.randomUUIDv7();
      const generated = generateBotKey(id);
      const [inserted] = await tx
        .insert(schema.botKeys)
        .values({ id, botId: bot.id, name: input.name, keyPrefix: generated.keyPrefix, secretHash: generated.secretHash, expiresAt, createdBy: actor.userId, createdAt: now })
        .returning()
        .catch(error => this.databaseService.translateError(error));
      assert(inserted, 'Bot key insertion returned no row');
      return { key: generated.key, row: inserted };
    });

    await this.botService.record(actor, { id: botId, organisationId }, 'bot.key.created', {
      keyId: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      expiresAt: row.expiresAt.toISOString(),
    });
    this.logger.info('created bot key', { organisationId: organisationId.toString(), botId: botId.toString(), keyId: row.id, expiresAt: row.expiresAt });

    const [summary] = await this.summarise([row], now);
    assert(summary, 'Bot key summary is missing');
    return { ...summary, key };
  }

  async revokeKey(actor: BotActor, organisationId: bigint, botId: bigint, keyId: string): Promise<void> {
    const bot = await this.botService.requireBot(organisationId, botId);
    if (!STRICT_UUID_PATTERN.test(keyId)) throw AppErrorCode.BOT_011.create();

    const [revoked] = await this.db
      .update(schema.botKeys)
      .set({ revokedAt: new Date(), revokedBy: actor.userId })
      .where(and(eq(schema.botKeys.id, keyId), eq(schema.botKeys.botId, bot.id), isNull(schema.botKeys.revokedAt)))
      .returning({ id: schema.botKeys.id, name: schema.botKeys.name });

    if (!revoked) {
      const existing = await this.db.query.botKeys.findFirst({ where: and(eq(schema.botKeys.id, keyId), eq(schema.botKeys.botId, bot.id)), columns: { id: true } });
      if (!existing) throw AppErrorCode.BOT_011.create();
      return;
    }

    await this.botService.record(actor, bot, 'bot.key.revoked', { keyId: revoked.id, name: revoked.name });
    this.logger.info('revoked bot key', { organisationId: organisationId.toString(), botId: botId.toString(), keyId: revoked.id });
  }

  private parseExpiry(value: string, now: Date): Date {
    if (!REGEX.ISO_DATE_TIME.test(value)) throw AppErrorCode.BOT_007.create();
    const expiresAt = new Date(value);
    const time = expiresAt.getTime();
    if (Number.isNaN(time) || time <= now.getTime() || time > now.getTime() + MAX_BOT_KEY_LIFETIME_MS) throw AppErrorCode.BOT_007.create();
    return expiresAt;
  }

  private async summarise(keys: Bot.Key[], now: Date): Promise<BotKeySummary[]> {
    const userRef = await this.botService.userRefResolver(keys.flatMap(key => [key.createdBy, key.revokedBy]));

    return keys.map(key => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      status: key.revokedAt ? 'REVOKED' : key.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE',
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      createdBy: userRef(key.createdBy),
      lastUsedAt: key.lastUsedAt,
      lastUsedIp: key.lastUsedIp,
      revokedAt: key.revokedAt,
      revokedBy: userRef(key.revokedBy),
    }));
  }
}
