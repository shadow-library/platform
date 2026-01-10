/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { Configuration, DatastoreService, PrimaryDatabase, Template, schema } from '../datastore';

/**
 * Defining types
 */

export interface SenderRoutingRuleDetails extends Configuration.SenderRoutingRule {
  profile: Configuration.SenderProfile;
}

export interface ListSenderRoutingRulesQuery extends Partial<OffsetPagination> {
  messageType?: Template.MessageType;
  region?: string;
  serviceName?: string;
}

export type CreateRoutingRule = Omit<InferInsertModel<typeof schema.senderRoutingRules>, 'createdAt' | 'updatedAt'>;

export type UpdateRoutingRule = Partial<Pick<CreateRoutingRule, 'senderProfileId'>>;

/**
 * Declaring the constants
 */

@Injectable()
export class SenderRoutingRuleService {
  private readonly logger = Logger.getLogger(APP_NAME, SenderRoutingRuleService.name);

  private readonly db: PrimaryDatabase;

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async createRoutingRule(data: CreateRoutingRule): Promise<Configuration.SenderRoutingRule> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, data.senderProfileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);
    if (!profile.isActive) throw new ServerError(AppErrorCode.SND_RTR_003);

    const whereConditions = [];
    if (data.service) whereConditions.push(eq(schema.senderRoutingRules.service, data.service));
    else whereConditions.push(isNull(schema.senderRoutingRules.service));
    if (data.messageType) whereConditions.push(eq(schema.senderRoutingRules.messageType, data.messageType));
    else whereConditions.push(isNull(schema.senderRoutingRules.messageType));
    if (data.region) whereConditions.push(eq(schema.senderRoutingRules.region, data.region));
    else whereConditions.push(isNull(schema.senderRoutingRules.region));

    const existingRule = await this.db.query.senderRoutingRules.findFirst({ where: and(...whereConditions) });
    if (existingRule) throw new ServerError(AppErrorCode.SND_RTR_002);

    const [routingRule] = await this.db
      .insert(schema.senderRoutingRules)
      .values(data)
      .returning()
      .catch(err => this.datastoreService.translateError(err));
    assert(routingRule, 'Failed to create sender routing rule');
    this.logger.info('Created sender routing rule', { routingRule });
    return routingRule;
  }

  async listSenderRoutingRules(filter: ListSenderRoutingRulesQuery = {}): Promise<OffsetPaginationResult<Configuration.SenderRoutingRule>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    const sortField = query.sortBy === 'createdAt' ? schema.senderRoutingRules.createdAt : schema.senderRoutingRules.updatedAt;
    const whereConditions = [];
    if (filter.messageType) whereConditions.push(eq(schema.senderRoutingRules.messageType, filter.messageType));
    if (filter.region) whereConditions.push(eq(schema.senderRoutingRules.region, filter.region));
    if (filter.serviceName) whereConditions.push(eq(schema.senderRoutingRules.service, filter.serviceName));
    const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const [total, items] = await Promise.all([
      this.db.$count(schema.senderRoutingRules, where),
      this.db.query.senderRoutingRules.findMany({ limit: query.limit, offset: query.offset, orderBy: sortOrder(sortField), where }),
    ]);
    return utils.pagination.createResult(query, items, total);
  }

  async getSenderRoutingRule(id: bigint): Promise<SenderRoutingRuleDetails | null> {
    const routingRule = await this.db.query.senderRoutingRules.findFirst({ where: eq(schema.senderRoutingRules.id, id), with: { profile: true } });
    return routingRule ?? null;
  }

  async resolveSenderRoutingRule(service?: string, region?: string, messageType?: Template.MessageType): Promise<SenderRoutingRuleDetails> {
    const whereConditions = [];

    if (service && region && messageType) {
      whereConditions.push(
        and(eq(schema.senderRoutingRules.service, service), eq(schema.senderRoutingRules.region, region), eq(schema.senderRoutingRules.messageType, messageType)),
      );
    }

    if (service && region) {
      whereConditions.push(and(eq(schema.senderRoutingRules.service, service), eq(schema.senderRoutingRules.region, region), isNull(schema.senderRoutingRules.messageType)));
    }

    if (service) {
      whereConditions.push(and(eq(schema.senderRoutingRules.service, service), isNull(schema.senderRoutingRules.region), isNull(schema.senderRoutingRules.messageType)));
    }

    whereConditions.push(and(isNull(schema.senderRoutingRules.service), isNull(schema.senderRoutingRules.region), isNull(schema.senderRoutingRules.messageType)));

    const [result] = await this.db
      .select({
        routingRule: schema.senderRoutingRules,
        profile: schema.senderProfiles,
        priority: sql<number>`
          CASE
            WHEN ${schema.senderRoutingRules.service} = ${service}
              AND ${schema.senderRoutingRules.region} = ${region}
              AND ${schema.senderRoutingRules.messageType} = ${messageType}
            THEN 1

            WHEN ${schema.senderRoutingRules.service} = ${service}
              AND ${schema.senderRoutingRules.region} = ${region}
              AND ${schema.senderRoutingRules.messageType} IS NULL
            THEN 2

            WHEN ${schema.senderRoutingRules.service} = ${service}
              AND ${schema.senderRoutingRules.region} IS NULL
              AND ${schema.senderRoutingRules.messageType} IS NULL
            THEN 3

            WHEN ${schema.senderRoutingRules.service} IS NULL
              AND ${schema.senderRoutingRules.region} IS NULL
              AND ${schema.senderRoutingRules.messageType} IS NULL
            THEN 4

            ELSE 5
          END
        `.as('priority'),
      })
      .from(schema.senderRoutingRules)
      .innerJoin(schema.senderProfiles, eq(schema.senderRoutingRules.senderProfileId, schema.senderProfiles.id))
      .where(or(...whereConditions))
      .orderBy(asc(sql`priority`))
      .limit(1);

    if (!result) throw new ServerError(AppErrorCode.SND_RTR_001);
    return { ...result.routingRule, profile: result.profile };
  }

  async updateSenderRoutingRule(id: bigint, updatedSenderProfileId: bigint): Promise<Configuration.SenderRoutingRule> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, updatedSenderProfileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);
    if (!profile.isActive) throw new ServerError(AppErrorCode.SND_RTR_003);

    const [result] = await this.db
      .update(schema.senderRoutingRules)
      .set({ senderProfileId: updatedSenderProfileId, updatedAt: new Date() })
      .where(eq(schema.senderRoutingRules.id, id))
      .returning();
    if (!result) throw new ServerError(AppErrorCode.SND_RTR_001);
    return result;
  }

  async deleteSenderRoutingRule(id: bigint): Promise<void> {
    const routingRule = await this.getSenderRoutingRule(id);
    if (routingRule && !routingRule.service && !routingRule.messageType && !routingRule.region) throw new ServerError(AppErrorCode.SND_RTR_004);

    const result = await this.db
      .delete(schema.senderRoutingRules)
      .where(eq(schema.senderRoutingRules.id, id))
      .returning()
      .catch(err => this.datastoreService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.SND_RTR_001);
    this.logger.info(`Deleted sender routing rule`, { routingRuleId: id, result });
  }
}
