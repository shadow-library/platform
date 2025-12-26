/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPagination, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, and, asc, desc, eq } from 'drizzle-orm';

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

  async getSenderRoutingRule(serviceName: string, messageType: Template.MessageType, region: string): Promise<SenderRoutingRuleDetails | null> {
    const routingRule = await this.db.query.senderRoutingRules.findFirst({
      where: and(eq(schema.senderRoutingRules.service, serviceName), eq(schema.senderRoutingRules.messageType, messageType), eq(schema.senderRoutingRules.region, region)),
      with: { profile: true },
    });

    return routingRule ?? null;
  }

  async updateSenderRoutingRule(service: string, messageType: Template.MessageType, region: string, updatedSenderProfileId: bigint): Promise<Configuration.SenderRoutingRule> {
    const profile = await this.db.query.senderProfiles.findFirst({ where: eq(schema.senderProfiles.id, updatedSenderProfileId) });
    if (!profile) throw new ServerError(AppErrorCode.SND_PRF_001);
    if (!profile.isActive) throw new ServerError(AppErrorCode.SND_RTR_003);

    const [result] = await this.db
      .update(schema.senderRoutingRules)
      .set({ senderProfileId: updatedSenderProfileId, updatedAt: new Date() })
      .where(and(eq(schema.senderRoutingRules.service, service), eq(schema.senderRoutingRules.messageType, messageType), eq(schema.senderRoutingRules.region, region)))
      .returning();
    if (!result) throw new ServerError(AppErrorCode.SND_RTR_001);
    return result;
  }

  async deleteSenderRoutingRule(serviceName: string, messageType: Template.MessageType, region: string): Promise<void> {
    const result = await this.db
      .delete(schema.senderRoutingRules)
      .where(and(eq(schema.senderRoutingRules.service, serviceName), eq(schema.senderRoutingRules.messageType, messageType), eq(schema.senderRoutingRules.region, region)))
      .returning({ serviceName: schema.senderRoutingRules.service })
      .catch(err => this.datastoreService.translateError(err));
    if (result.length === 0) throw new ServerError(AppErrorCode.SND_RTR_001);
    this.logger.info(`Deleted sender routing rule for service: '${serviceName}', messageType: '${messageType}', region: '${region}'`);
  }
}
