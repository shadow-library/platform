import assert from 'node:assert';

import { and, asc, eq, exists, inArray, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Bot, DatabaseService, type PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { generateBotClientId } from './bot-key.util';
import { BOT_ACCESS_TOKEN_TTL_SECONDS } from './bot.constants';
import { normaliseIpAllowlist } from './ip-allowlist.util';

export interface BotActor {
  userId: bigint;
  ip?: string;
}

export interface BotUserRef {
  id: bigint;
  displayName: string | null;
}

export interface BotSummary {
  id: bigint;
  clientId: string;
  handle: string;
  displayName: string;
  description: string | null;
  status: Bot.Status;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  activeKeyCount: number;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  nextKeyExpiresAt: Date | null;
  createdBy: BotUserRef | null;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
  suspendedBy: BotUserRef | null;
}

export interface BotUsage {
  count: number;
  limit: number;
}

export interface BotListing {
  bots: BotSummary[];
  usage: BotUsage;
}

export interface CreateBot {
  handle: string;
  displayName: string;
  description?: string;
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
}

export interface UpdateBot {
  displayName?: string;
  description?: string | null;
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
}

interface KeyStats {
  activeKeyCount: number;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  nextKeyExpiresAt: Date | null;
}

type BotChanges = Partial<Pick<Bot, 'displayName' | 'description' | 'ipAllowlist' | 'rateLimitPerMinute'>>;

export const MAX_BOTS_PER_ORGANISATION = 25;
export const MAX_BOT_RATE_LIMIT_PER_MINUTE = 600;

const MANAGEABLE_STATUSES: Bot.Status[] = ['ACTIVE', 'SUSPENDED'];
const EMPTY_KEY_STATS: KeyStats = { activeKeyCount: 0, lastUsedAt: null, lastUsedIp: null, nextKeyExpiresAt: null };

@Injectable()
export class BotService {
  private readonly logger = Logger.getLogger(APP_NAME, BotService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listBots(organisationId: bigint): Promise<BotListing> {
    const rows = await this.db.query.bots.findMany({
      where: and(eq(schema.bots.organisationId, organisationId), ne(schema.bots.status, 'DELETED')),
      orderBy: asc(schema.bots.id),
    });
    return { bots: await this.summarise(rows), usage: { count: rows.length, limit: MAX_BOTS_PER_ORGANISATION } };
  }

  async getBot(organisationId: bigint, botId: bigint): Promise<BotSummary> {
    const bot = await this.requireBot(organisationId, botId);
    const [summary] = await this.summarise([bot]);
    assert(summary, 'Bot summary is missing');
    return summary;
  }

  async createBot(actor: BotActor, organisationId: bigint, input: CreateBot): Promise<BotSummary> {
    const ipAllowlist = normaliseIpAllowlist(input.ipAllowlist ?? []);
    const platformApplication = this.applicationService.getApplicationOrThrow(APP_NAME);

    const bot = await this.db.transaction(async tx => {
      // Serialises concurrent creates so two cannot both pass the limit check; NO KEY UPDATE leaves FK inserts elsewhere in the organisation unblocked.
      const [organisation] = await tx
        .select({ type: schema.organisations.type, status: schema.organisations.status })
        .from(schema.organisations)
        .where(eq(schema.organisations.id, organisationId))
        .for('no key update');
      if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_002.create();
      if (organisation.type !== 'TEAM') throw AppErrorCode.BOT_002.create();

      const existing = await tx.$count(schema.bots, and(eq(schema.bots.organisationId, organisationId), ne(schema.bots.status, 'DELETED')));
      if (existing >= MAX_BOTS_PER_ORGANISATION) throw AppErrorCode.BOT_001.create();

      const taken = await tx.query.bots.findFirst({ where: and(eq(schema.bots.organisationId, organisationId), eq(schema.bots.handle, input.handle)), columns: { id: true } });
      if (taken) throw AppErrorCode.BOT_003.create();

      const clientId = generateBotClientId();
      await tx.insert(schema.oauthClients).values({
        id: clientId,
        applicationId: platformApplication.id,
        name: `${input.handle}[bot]`,
        kind: 'SERVICE',
        isFirstParty: false,
        tokenEndpointAuthMethod: 'client_secret_basic',
        grantTypes: [],
        accessTokenTtl: BOT_ACCESS_TOKEN_TTL_SECONDS,
        organisationId,
      });

      const [created] = await tx
        .insert(schema.bots)
        .values({
          organisationId,
          clientId,
          handle: input.handle,
          displayName: input.displayName,
          description: input.description ?? null,
          ipAllowlist,
          rateLimitPerMinute: input.rateLimitPerMinute ?? MAX_BOT_RATE_LIMIT_PER_MINUTE,
          createdBy: actor.userId,
        })
        .returning()
        .catch(error => this.databaseService.translateError(error));
      assert(created, 'Bot insertion returned no row');
      return created;
    });

    await this.record(actor, bot, 'bot.created', { handle: bot.handle, clientId: bot.clientId, ipAllowlist: bot.ipAllowlist, rateLimitPerMinute: bot.rateLimitPerMinute });
    this.logger.info('created organisation bot', { organisationId: organisationId.toString(), botId: bot.id.toString(), clientId: bot.clientId });
    return this.getBot(organisationId, bot.id);
  }

  async updateBot(actor: BotActor, organisationId: bigint, botId: bigint, input: UpdateBot): Promise<void> {
    const changes: BotChanges = {};
    if (input.displayName !== undefined) changes.displayName = input.displayName;
    if (input.description !== undefined) changes.description = input.description;
    if (input.ipAllowlist !== undefined) changes.ipAllowlist = normaliseIpAllowlist(input.ipAllowlist);
    if (input.rateLimitPerMinute !== undefined) changes.rateLimitPerMinute = input.rateLimitPerMinute;

    const fields = Object.keys(changes);
    if (fields.length === 0) {
      await this.requireManageableBot(organisationId, botId);
      return;
    }

    const [updated] = await this.db
      .update(schema.bots)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(this.ownedBy(organisationId, botId), inArray(schema.bots.status, MANAGEABLE_STATUSES), this.organisationIsActive()))
      .returning();
    if (!updated) return this.throwUnavailable(organisationId, botId);

    await this.record(actor, updated, 'bot.updated', { fields, ipAllowlist: changes.ipAllowlist, rateLimitPerMinute: changes.rateLimitPerMinute });
    this.logger.info('updated organisation bot', { organisationId: organisationId.toString(), botId: botId.toString(), fields });
  }

  async suspendBot(actor: BotActor, organisationId: bigint, botId: bigint): Promise<void> {
    const now = new Date();
    const suspended = await this.transition(organisationId, botId, 'ACTIVE', { status: 'SUSPENDED', suspendedAt: now, suspendedBy: actor.userId, updatedAt: now }, false, false);
    await this.record(actor, suspended, 'bot.suspended');
    this.logger.info('suspended organisation bot', { organisationId: organisationId.toString(), botId: botId.toString() });
  }

  async resumeBot(actor: BotActor, organisationId: bigint, botId: bigint): Promise<void> {
    const resumed = await this.transition(organisationId, botId, 'SUSPENDED', { status: 'ACTIVE', suspendedAt: null, suspendedBy: null, updatedAt: new Date() }, true, true);
    await this.record(actor, resumed, 'bot.resumed');
    this.logger.info('resumed organisation bot', { organisationId: organisationId.toString(), botId: botId.toString() });
  }

  async requireBot(organisationId: bigint, botId: bigint): Promise<Bot> {
    const bot = await this.db.query.bots.findFirst({ where: and(this.ownedBy(organisationId, botId), ne(schema.bots.status, 'DELETED')) });
    if (!bot) throw AppErrorCode.BOT_009.create();
    return bot;
  }

  async userRefResolver(userIds: (bigint | null)[]): Promise<(id: bigint | null) => BotUserRef | null> {
    const ids = [...new Set(userIds.filter((id): id is bigint => id !== null))];
    const profiles =
      ids.length === 0
        ? []
        : await this.db.query.userProfiles.findMany({
            where: inArray(schema.userProfiles.userId, ids),
            columns: { userId: true, displayName: true, firstName: true, lastName: true },
          });
    const names = new Map(profiles.map(profile => [profile.userId, profile.displayName ?? ([profile.firstName, profile.lastName].filter(Boolean).join(' ') || null)]));
    // The fastify response transformer mutates a structuredClone that preserves aliasing, so a shared ref instance fails serialisation the second time it is visited.
    return id => (id === null ? null : { id, displayName: names.get(id) ?? null });
  }

  record(actor: BotActor, bot: Pick<Bot, 'id' | 'organisationId'>, action: string, detail?: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.userId.toString(),
      organisationId: bot.organisationId.toString(),
      targetType: 'bot',
      targetId: bot.id.toString(),
      ipAddress: actor.ip ?? null,
      detail: detail ?? null,
    });
  }

  private ownedBy(organisationId: bigint, botId: bigint) {
    return and(eq(schema.bots.id, botId), eq(schema.bots.organisationId, organisationId));
  }

  private async assertOrganisationActive(organisationId: bigint): Promise<void> {
    const organisation = await this.db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId), columns: { status: true } });
    if (organisation?.status !== 'ACTIVE') throw AppErrorCode.BOT_013.create();
  }

  private organisationIsActive() {
    const activeOrganisation = this.db
      .select({ id: schema.organisations.id })
      .from(schema.organisations)
      .where(and(eq(schema.organisations.id, schema.bots.organisationId), eq(schema.organisations.status, 'ACTIVE')));
    return exists(activeOrganisation);
  }

  private async requireManageableBot(organisationId: bigint, botId: bigint): Promise<Bot> {
    const bot = await this.requireBot(organisationId, botId);
    if (!MANAGEABLE_STATUSES.includes(bot.status)) throw AppErrorCode.BOT_010.create();
    await this.assertOrganisationActive(organisationId);
    return bot;
  }

  private async throwUnavailable(organisationId: bigint, botId: bigint, from?: Bot.Status): Promise<never> {
    const bot = await this.requireBot(organisationId, botId);
    const statusAllows = from === undefined ? MANAGEABLE_STATUSES.includes(bot.status) : bot.status === from;
    if (statusAllows) await this.assertOrganisationActive(organisationId);
    throw AppErrorCode.BOT_010.create();
  }

  private async transition(organisationId: bigint, botId: bigint, from: Bot.Status, set: Partial<Bot>, clientActive: boolean, requireActiveOrganisation: boolean): Promise<Bot> {
    const bot = await this.db.transaction(async tx => {
      const [updated] = await tx
        .update(schema.bots)
        .set(set)
        .where(and(this.ownedBy(organisationId, botId), eq(schema.bots.status, from), requireActiveOrganisation ? this.organisationIsActive() : undefined))
        .returning();
      if (!updated) return null;
      await tx.update(schema.oauthClients).set({ isActive: clientActive, updatedAt: new Date() }).where(eq(schema.oauthClients.id, updated.clientId));
      return updated;
    });
    return bot ?? this.throwUnavailable(organisationId, botId, from);
  }

  private async summarise(bots: Bot[]): Promise<BotSummary[]> {
    if (bots.length === 0) return [];
    const stats = await this.keyStats(bots.map(bot => bot.id));
    const userRef = await this.userRefResolver(bots.flatMap(bot => [bot.createdBy, bot.suspendedBy]));

    return bots.map(bot => ({
      id: bot.id,
      clientId: bot.clientId,
      handle: bot.handle,
      displayName: bot.displayName,
      description: bot.description,
      status: bot.status,
      ipAllowlist: bot.ipAllowlist,
      rateLimitPerMinute: bot.rateLimitPerMinute,
      ...(stats.get(bot.id) ?? EMPTY_KEY_STATS),
      createdBy: userRef(bot.createdBy),
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
      suspendedAt: bot.suspendedAt,
      suspendedBy: userRef(bot.suspendedBy),
    }));
  }

  private async keyStats(botIds: bigint[]): Promise<Map<bigint, KeyStats>> {
    const rows = await this.db
      .select({
        botId: schema.botKeys.botId,
        activeKeyCount: sql<number>`count(*) FILTER (WHERE ${schema.botKeys.revokedAt} IS NULL AND ${schema.botKeys.expiresAt} > now())`.mapWith(Number),
        lastUsedAt: sql<Date | null>`max(${schema.botKeys.lastUsedAt})`.mapWith(schema.botKeys.lastUsedAt),
        lastUsedIp: sql<string | null>`(array_agg(host(${schema.botKeys.lastUsedIp}) ORDER BY ${schema.botKeys.lastUsedAt} DESC NULLS LAST))[1]`,
        nextKeyExpiresAt: sql<Date | null>`min(${schema.botKeys.expiresAt}) FILTER (WHERE ${schema.botKeys.revokedAt} IS NULL AND ${schema.botKeys.expiresAt} > now())`.mapWith(
          schema.botKeys.expiresAt,
        ),
      })
      .from(schema.botKeys)
      .where(inArray(schema.botKeys.botId, botIds))
      .groupBy(schema.botKeys.botId);
    return new Map(rows.map(({ botId, ...stats }) => [botId, stats]));
  }
}
